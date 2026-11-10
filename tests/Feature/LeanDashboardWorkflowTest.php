<?php

namespace Tests\Feature;

use App\Models\LeanIssue;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LeanDashboardWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('cache.default', 'array');
        Config::set('session.driver', 'array');
        Cache::flush();

        // Mock Google Sheets calls during workflow tests
        $sheetMock = $this->createMock(LeanSheetDirectService::class);
        $sheetMock->method('getMonthGids')->willReturn(['November' => 11111]);
        $sheetMock->method('syncSingleIssue')->willReturn(true);
        $this->app->instance(LeanSheetDirectService::class, $sheetMock);

        $gasMock = $this->createMock(GoogleSheetsSyncService::class);
        $gasMock->method('syncIssue')->willReturn(true);
        $this->app->instance(GoogleSheetsSyncService::class, $gasMock);

        Http::fake([
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
            '*'                       => Http::response(['success' => true], 200),
        ]);
    }

    protected function makeUser(string $role = 'department', ?string $department = 'Engineer', string $name = 'Spv Engineer'): User
    {
        return User::factory()->create([
            'name'            => $name,
            'staff_name'      => $name,
            'role'            => $role,
            'department'      => $department,
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);
    }

    protected function makeEngineerIssue(array $overrides = []): LeanIssue
    {
        return LeanIssue::create(array_merge([
            'location'           => 'TBR - Villa 01',
            'title'              => 'Pipa Air Bocor',
            'description'        => 'Air menetes di kolong wastafel',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Nadya',
            'reporter_dept'      => 'HR',
            'reporter_phone'     => '081234567890',
            'status'             => 'open',
        ], $overrides));
    }

    public function test_all_users_can_view_all_issues_but_only_owner_dept_or_admin_can_manage(): void
    {
        $engIssue = $this->makeEngineerIssue();
        $itIssue = $this->makeEngineerIssue([
            'title'              => 'Wi-Fi TPI Mati',
            'target_departments' => ['IT'],
        ]);

        // 1. Other department user ("IT") sees ALL issues, but can_manage is false for Engineer issue and true for IT issue
        $itUser = $this->makeUser('department', 'IT', 'Spv IT');

        $response = $this->actingAs($itUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->get('/lapangan');

        $response->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->has('issues', 2)
                ->where('issues', function ($issues) use ($engIssue, $itIssue) {
                    $eng = collect($issues)->firstWhere('id', $engIssue->id);
                    $it  = collect($issues)->firstWhere('id', $itIssue->id);
                    return $eng && $eng['can_manage'] === false
                        && $it  && $it['can_manage'] === true;
                })
            );

        // 2. Engineering alias ("Engineering" user managing "Engineer" issue) is permitted
        $engAliasUser = $this->makeUser('department', 'Engineering', 'Andi Eng');
        $this->actingAs($engAliasUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->get('/lapangan')
            ->assertInertia(fn (Assert $page) => $page
                ->where('issues', fn ($issues) => collect($issues)->firstWhere('id', $engIssue->id)['can_manage'] === true)
            );

        // 3. IT user gets 403 on every mutating endpoint for Engineer issue
        $endpoints = [
            ["/lapangan/issues/{$engIssue->id}/claim", ['workers' => ['Reza']]],
            ["/lapangan/issues/{$engIssue->id}/progress", ['comment' => 'Tes', 'workers' => ['Reza']]],
            ["/lapangan/issues/{$engIssue->id}/pending", ['reason' => 'Menunggu alat']],
            ["/lapangan/issues/{$engIssue->id}/resolve", ['note' => 'Selesai']],
            ["/lapangan/issues/{$engIssue->id}/transfer", ['to_department' => 'IT', 'reason' => 'Alihkan']],
        ];

        foreach ($endpoints as [$url, $payload]) {
            $this->actingAs($itUser)
                ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
                ->postJson($url, $payload)
                ->assertStatus(403);

            // Guest must also be blocked with 403
            auth()->logout();
            $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
                ->postJson($url, $payload)
                ->assertStatus(403);
        }

        // 4. Admin account (department = null) is permitted to manage
        $admin = $this->makeUser('admin', null, 'Admin Phillip');
        $this->actingAs($admin)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$engIssue->id}/claim", [
                'workers' => ['Andi'],
            ])
            ->assertStatus(200);
    }

    public function test_full_multi_phase_workflow_progress_comments_flexible_pending_and_4_contributors_accumulation(): void
    {
        $engUser = $this->makeUser('department', 'Engineering', 'Spv Budi');
        $issue = $this->makeEngineerIssue();

        // Phase 1: Claim (Open -> In Progress) with 2 initial workers
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers' => ['Andi', 'Budi'],
                'note'    => 'Bawa kunci pipa menuju lokasi',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('in_progress', $issue->status);
        $this->assertEquals(['Andi', 'Budi'], $issue->initial_workers);
        $this->assertEquals(['Andi', 'Budi'], $issue->active_workers);
        $this->assertEquals(['Andi', 'Budi'], $issue->progress_workers);
        $this->assertEquals(['Andi', 'Budi'], $issue->contributors);
        $this->assertCount(1, $issue->progress_logs);

        Http::assertSent(fn ($req) => str_contains($req->url(), 'notify-direct')
            && str_contains($req['message'] ?? '', 'Mulai Dikerjakan'));

        // Phase 2: In Progress comment + swap worker (add 3rd worker Citra, remove Andi), notify_reporter defaults to TRUE
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/progress", [
                'comment' => 'Membuka sambungan pipa utama, butuh bantuan Citra.',
                'workers' => ['Budi', 'Citra'],
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals(['Budi', 'Citra'], $issue->active_workers);
        $this->assertEquals(['Andi', 'Budi'], $issue->initial_workers); // Unchanged
        $this->assertEquals(['Andi', 'Budi', 'Citra'], $issue->progress_workers); // Accumulated
        $this->assertEquals(['Andi', 'Budi', 'Citra'], $issue->contributors);     // Accumulated
        $this->assertTrue($issue->progress_logs[1]['notified_wa']);
        $this->assertEquals(['Citra'], $issue->progress_logs[1]['added_workers']);
        $this->assertEquals(['Andi'], $issue->progress_logs[1]['removed_workers']);

        Http::assertSent(fn ($req) => str_contains($req->url(), 'notify-direct')
            && str_contains($req['message'] ?? '', 'Membuka sambungan pipa utama'));

        // Phase 2b: In Progress update with notify_reporter = false skips WA
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/progress", [
                'comment'         => 'Catatan internal cek ukuran drat.',
                'workers'         => ['Budi', 'Citra'],
                'notify_reporter' => false,
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertFalse($issue->progress_logs[2]['notified_wa']);
        Http::assertNotSent(fn ($req) => str_contains($req->url(), 'notify-direct')
            && str_contains($req['message'] ?? '', 'Catatan internal cek ukuran drat.'));

        // Phase 3: Pending (In Progress -> Pending) -> Pending again (update reason) -> preserves first pending_since
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", [
                'reason' => '',
            ])
            ->assertStatus(422);

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", [
                'reason' => 'Menunggu seal ukuran 3/4 dari gudang.',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $firstPendingSince = $issue->pending_since;
        $this->assertEquals('pending', $issue->status);
        $this->assertEquals('Menunggu seal ukuran 3/4 dari gudang.', $issue->pending_reason);
        $this->assertNotNull($firstPendingSince);

        // Update Pending again from Pending status
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", [
                'reason' => 'Stok gudang kosong, menunggu pengiriman boat dari Batam.',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('pending', $issue->status);
        $this->assertEquals('Stok gudang kosong, menunggu pengiriman boat dari Batam.', $issue->pending_reason);
        $this->assertEquals($firstPendingSince->toIso8601String(), $issue->pending_since->toIso8601String());

        // Phase 4: Resolve without photo (optional photo, required note) and adding 4th contributor Doni
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/resolve", [
                'note'          => '',
                'final_workers' => ['Budi', 'Citra', 'Doni'],
            ])
            ->assertStatus(422);

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/resolve", [
                'note'          => 'Seal baru dipasang, tekanan air sudah dites aman dan kering.',
                'final_workers' => ['Budi', 'Citra', 'Doni'],
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('resolved', $issue->status);
        $this->assertNull($issue->resolution_image_url); // Photo optional!
        $this->assertNull($issue->pending_reason);
        $this->assertNull($issue->pending_since);
        $this->assertEquals('Budi, Citra, Doni', $issue->resolved_by_name);
        $this->assertEquals(['Andi', 'Budi'], $issue->initial_workers);
        $this->assertEquals(['Andi', 'Budi', 'Citra'], $issue->progress_workers);
        $this->assertEquals(['Andi', 'Budi', 'Citra', 'Doni'], $issue->contributors);

        // Verify Option 4B Google Sheet row output has 4 unique contributors in column Q & separated phase columns
        $realSheetService = new LeanSheetDirectService();
        $row = $realSheetService->formatIssueRow($issue);
        $this->assertEquals('Andi, Budi', $row[10]);              // K: Pekerja Awal
        $this->assertEquals('Andi, Budi, Citra', $row[12]);       // M: Pekerja Selama Progress
        $this->assertEquals('Budi, Citra, Doni', $row[13]);       // N: Diselesaikan Oleh
        $this->assertEquals('Andi, Budi, Citra, Doni', $row[16]); // Q: Seluruh Kontributor (Evaluasi)
    }

    public function test_pending_from_open_and_transfer_to_another_department(): void
    {
        $engUser = $this->makeUser('department', 'Engineer', 'Spv Eng');
        $itUser = $this->makeUser('department', 'IT', 'Spv IT');
        $issue = $this->makeEngineerIssue();

        // Can go Pending directly from Open
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", [
                'reason' => 'Menunggu konfirmasi lokasi kamar tamu',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('pending', $issue->status);

        // Claim adds contributor before transfer
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers' => ['Hendra'],
            ])
            ->assertStatus(200);

        // Cannot transfer to same single department
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/transfer", [
                'to_department' => 'Engineer',
                'reason'        => 'Coba ke dept sama',
            ])
            ->assertStatus(422);

        // Transfer from Engineer -> IT
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/transfer", [
                'to_department' => 'IT',
                'reason'        => 'Kendala ternyata pada kabel router Wi-Fi',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals(['IT'], $issue->target_departments);
        $this->assertEquals('open', $issue->status);
        $this->assertEquals([], $issue->active_workers);
        $this->assertNull($issue->claimed_by_name);
        $this->assertEquals(['Hendra'], $issue->contributors); // Historical contributor preserved
        $this->assertCount(1, $issue->transfer_history);
        $this->assertEquals('IT', $issue->transfer_history[0]['to_department']);

        // Former owner (Engineer) is now forbidden (403); new owner (IT) can claim!
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", ['workers' => ['Hendra']])
            ->assertStatus(403);

        $this->actingAs($itUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", ['workers' => ['Dani']])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals(['Hendra', 'Dani'], $issue->contributors);
    }

    public function test_store_with_start_in_progress_populates_workers_contributors_and_logs(): void
    {
        $engUser = $this->makeUser('department', 'Engineer', 'Spv Budi');

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', [
                'location'           => 'TBR - Dermaga',
                'title'              => 'Papan dermaga patah',
                'description'        => 'Perlu paku dan ganti papan baru',
                'target_departments' => ['Engineer'],
                'reporter_name'      => 'Yusuf',
                'reporter_dept'      => 'Marine',
                'start_in_progress'  => true,
                'assigned_workers'   => ['Andi', 'Budi'],
            ])
            ->assertStatus(200);

        $issue = LeanIssue::latest('id')->firstOrFail();
        $this->assertEquals('in_progress', $issue->status);
        $this->assertEquals(['Andi', 'Budi'], $issue->initial_workers);
        $this->assertEquals(['Andi', 'Budi'], $issue->active_workers);
        $this->assertEquals(['Andi', 'Budi'], $issue->progress_workers);
        $this->assertEquals(['Andi', 'Budi'], $issue->contributors);
        $this->assertCount(1, $issue->progress_logs);
        $this->assertEquals('claim', $issue->progress_logs[0]['type']);
    }
}
