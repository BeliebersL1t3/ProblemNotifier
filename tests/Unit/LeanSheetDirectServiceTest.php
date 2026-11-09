<?php

namespace Tests\Unit;

use App\Models\LeanIssue;
use App\Services\LeanSheetDirectService;
use Tests\TestCase;

class LeanSheetDirectServiceTest extends TestCase
{
    public function test_get_headers_has_18_columns_including_active_status(): void
    {
        $headers = LeanSheetDirectService::getHeaders();
        $this->assertCount(18, $headers);
        $this->assertEquals('Aktif di Dashboard', $headers[15]);
        $this->assertEquals('Dihapus Oleh', $headers[16]);
        $this->assertEquals('Waktu Dihapus', $headers[17]);
    }

    public function test_format_issue_row_active_has_status_1(): void
    {
        $service = app(LeanSheetDirectService::class);

        $issue = new LeanIssue([
            'location'           => 'Villa 10 TBR',
            'title'              => 'Pipa Bocor',
            'description'        => 'Pipa air bocor',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Ahmad',
            'reporter_dept'      => 'Housekeeping',
            'status'             => 'open',
        ]);
        $issue->id = 101;
        $issue->created_at = now();

        $row = $service->formatIssueRow($issue);
        $this->assertCount(18, $row);
        $this->assertEquals(1, $row[15]); // Aktif di Dashboard = 1
        $this->assertEquals('', $row[16]); // Dihapus Oleh = ''
        $this->assertEquals('', $row[17]); // Waktu Dihapus = ''
    }

    public function test_format_issue_row_trashed_has_status_0(): void
    {
        $service = app(LeanSheetDirectService::class);

        $issue = new LeanIssue([
            'location'           => 'Villa 10 TBR',
            'title'              => 'Pipa Bocor',
            'description'        => 'Pipa air bocor',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Ahmad',
            'reporter_dept'      => 'Housekeeping',
            'status'             => 'open',
            'deleted_by_name'    => 'Supervisor Phillip',
        ]);
        $issue->id = 102;
        $issue->created_at = now();
        $issue->deleted_at = now();

        $row = $service->formatIssueRow($issue);
        $this->assertCount(18, $row);
        $this->assertEquals(0, $row[15]); // Aktif di Dashboard = 0
        $this->assertEquals('Supervisor Phillip', $row[16]); // Dihapus Oleh
        $this->assertNotEmpty($row[17]); // Waktu Dihapus
    }
}
