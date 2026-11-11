<?php

namespace Tests\Unit;

use App\Models\LeanIssue;
use App\Services\LeanSheetDirectService;
use Tests\TestCase;

class LeanSheetDirectServiceTest extends TestCase
{
    public function test_get_headers_has_21_columns_matching_option_4b(): void
    {
        $headers = LeanSheetDirectService::getHeaders();
        $this->assertCount(21, $headers);
        $this->assertEquals('Diambil Oleh (Pekerja Awal)', $headers[10]); // K
        $this->assertEquals('Pekerja Selama Progress', $headers[12]);     // M
        $this->assertEquals('Diselesaikan Oleh', $headers[13]);           // N
        $this->assertEquals('Seluruh Kontributor (Evaluasi)', $headers[16]); // Q
        $this->assertEquals('Riwayat Pengalihan Dept', $headers[17]);     // R
        $this->assertEquals('Aktif di Dashboard', $headers[18]);          // S
        $this->assertEquals('Dihapus Oleh', $headers[19]);                // T
        $this->assertEquals('Waktu Dihapus', $headers[20]);               // U
        $this->assertNotContains('Riwayat Komentar & Log', $headers);
    }

    public function test_format_issue_row_active_has_status_1_and_option_4b_contributors(): void
    {
        $service = app(LeanSheetDirectService::class);

        $issue = new LeanIssue([
            'location'           => 'Villa 10 TBR',
            'title'              => 'Pipa Bocor',
            'description'        => 'Pipa air bocor',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Ahmad',
            'reporter_dept'      => 'HK',
            'status'             => 'resolved',
            'claimed_by_name'    => 'Budi, Citra',
            'claimed_at'         => now(),
            'initial_workers'    => ['Andi', 'Budi'],
            'progress_workers'   => ['Andi', 'Budi', 'Citra'],
            'resolved_by_name'   => 'Budi, Citra, Doni',
            'resolved_at'        => now(),
            'resolution_note'    => 'Pipa diganti dan dites aman',
            'contributors'       => ['Andi', 'Budi', 'Citra', 'Doni'],
            'progress_logs'      => [
                [
                    'type'       => 'progress',
                    'actor'      => 'Budi',
                    'message'    => 'Sedang pembongkaran pipa',
                    'workers'    => ['Budi', 'Citra'],
                    'created_at' => now()->toIso8601String(),
                ],
            ],
            'transfer_history'   => [
                [
                    'from_department' => 'HK',
                    'to_department'   => 'Engineer',
                    'transferred_by'  => 'Siti',
                    'reason'          => 'Butuh teknisi perpipaan',
                    'transferred_at'  => now()->toIso8601String(),
                ],
            ],
        ]);
        $issue->id = 101;
        $issue->created_at = now();

        $row = $service->formatIssueRow($issue);
        $this->assertCount(21, $row);
        $this->assertEquals('Andi, Budi', $row[10]);                  // K: Initial workers
        $this->assertEquals('Andi, Budi, Citra', $row[12]);           // M: Progress workers
        $this->assertEquals('Budi, Citra, Doni', $row[13]);           // N: Resolved by
        $this->assertEquals('Pipa diganti dan dites aman', $row[15]); // P: Resolution note
        $this->assertEquals('Andi, Budi, Citra, Doni', $row[16]);     // Q: All Contributors
        $this->assertStringNotContainsString('Sedang pembongkaran pipa', implode("\n", $row));
        $this->assertStringContainsString('HK -> Engineer', $row[17]); // R: Transfers
        $this->assertEquals(1, $row[18]);  // S: Aktif di Dashboard = 1
        $this->assertEquals('', $row[19]); // T: Dihapus Oleh = ''
        $this->assertEquals('', $row[20]); // U: Waktu Dihapus = ''
    }

    public function test_format_issue_row_trashed_has_status_0(): void
    {
        $service = app(LeanSheetDirectService::class);

        $issue = new LeanIssue([
            'location'           => 'Villa 10 TBR',
            'title'              => 'Pipa Bocor',
            'description'        => 'Pipa air bocor',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Ahmad',
            'reporter_dept'      => 'HK',
            'status'             => 'open',
            'deleted_by_name'    => 'Supervisor Phillip',
        ]);
        $issue->id = 102;
        $issue->created_at = now();
        $issue->deleted_at = now();

        $row = $service->formatIssueRow($issue);
        $this->assertCount(21, $row);
        $this->assertEquals(0, $row[18]); // S: Aktif di Dashboard = 0
        $this->assertEquals('Supervisor Phillip', $row[19]); // T: Dihapus Oleh
        $this->assertNotEmpty($row[20]); // U: Waktu Dihapus
    }
}
