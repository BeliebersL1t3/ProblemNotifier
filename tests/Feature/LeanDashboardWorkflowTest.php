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
        Config::set('services.bot.api_key', 'test-bot-secret');
        Config::set('services.bot.port', 3000);
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

            // Guest must also be blocked by auth middleware (401 Unauthenticated)
            auth()->logout();
            $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
                ->postJson($url, $payload)
                ->assertStatus(401);
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

        // Claim from Pending resumes as Progress & adds contributor before transfer
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers' => ['Hendra'],
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('progress', $issue->progress_logs[1]['type']);
        $this->assertTrue($issue->progress_logs[1]['notified_wa']);

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

    public function test_dashboard_actions_dispatch_reporter_dms_and_group_notifications_accurately(): void
    {
        $engUser = $this->makeUser('department', 'Engineer', 'Spv Budi');

        // 1. Dashboard Store -> DM to reporter AND /notify group (Dept + Location + Broadcast)
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', [
                'location'           => 'TBR - Villa 08',
                'title'              => 'AC Villa 08 tidak dingin',
                'description'        => 'Kompresor outdoor berisik dan angin hangat',
                'target_departments' => ['Engineer'],
                'reporter_name'      => 'Nadya',
                'reporter_dept'      => 'GR',
                'reporter_phone'     => '081234567890',
            ])
            ->assertStatus(200);

        $issue = LeanIssue::latest('id')->firstOrFail();

        Http::assertSent(fn ($req) => $req->hasHeader('X-Bot-Key', 'test-bot-secret')
            && str_ends_with($req->url(), '/notify-direct')
            && ($req['phone'] ?? '') === '6281234567890'
            && str_contains($req['message'] ?? '', 'Laporan Diterima'));

        Http::assertSent(fn ($req) => $req->hasHeader('X-Bot-Key', 'test-bot-secret')
            && str_ends_with($req->url(), '/notify')
            && ($req['departments'] ?? []) === ['Engineer']
            && ($req['location'] ?? '') === 'TBR - Villa 08'
            && ($req['includeLocation'] ?? false) === true
            && ($req['includeGeneral'] ?? false) === true
            && ($req['departmentOnly'] ?? true) === false);

        // 2. Dashboard Claim -> DM to reporter AND /notify group (Dept ONLY)
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers' => ['Andi', 'Budi'],
                'note'    => 'Bawa manifold gauge',
            ])
            ->assertStatus(200);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && ($req['departments'] ?? []) === ['Engineer']
            && ($req['departmentOnly'] ?? false) === true
            && str_contains($req['message'] ?? '', 'TIKET MULAI DIKERJAKAN'));

        // 3. Dashboard Progress with notify_reporter = false -> skips DM, STILL sends /notify group (Dept ONLY)
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/progress", [
                'comment'         => 'Pembersihan evaporator internal',
                'workers'         => ['Andi', 'Budi', 'Citra'],
                'notify_reporter' => false,
            ])
            ->assertStatus(200);

        Http::assertNotSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', 'Pembersihan evaporator internal'));

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && ($req['departments'] ?? []) === ['Engineer']
            && ($req['departmentOnly'] ?? false) === true
            && str_contains($req['message'] ?? '', 'Pembersihan evaporator internal'));

        // 4. Dashboard Pending -> DM + /notify group (Dept ONLY)
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", [
                'reason' => 'Menunggu freon R32 dari gudang',
            ])
            ->assertStatus(200);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', 'Menunggu freon R32 dari gudang'));

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && ($req['departmentOnly'] ?? false) === true
            && str_contains($req['message'] ?? '', 'Menunggu freon R32 dari gudang'));

        // 5. Dashboard Resolve -> DM + /notify group (Dept + Location + Broadcast with contributors)
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/resolve", [
                'note'          => 'Freon ditambah, suhu keluar normal 18C',
                'final_workers' => ['Budi', 'Citra', 'Doni'],
            ])
            ->assertStatus(200);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', 'SELESAI'));

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && ($req['departments'] ?? []) === ['Engineer']
            && ($req['includeLocation'] ?? false) === true
            && ($req['includeGeneral'] ?? false) === true
            && ($req['departmentOnly'] ?? true) === false
            && str_contains($req['message'] ?? '', 'Andi, Budi, Citra, Doni'));

        // 6. Transfer on a second open issue -> DM + TWO separate /notify group calls (Old dept released, New dept incoming)
        $transferIssue = $this->makeEngineerIssue([
            'title' => 'Panel kontrol router hang',
        ]);

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$transferIssue->id}/transfer", [
                'to_department' => 'IT',
                'reason'        => 'Perlu konfigurasi IP router oleh tim IT',
            ])
            ->assertStatus(200);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', 'Pengalihan Departemen Penangan'));

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && ($req['departments'] ?? []) === ['Engineer']
            && ($req['departmentOnly'] ?? false) === true
            && str_contains($req['message'] ?? '', 'TIKET DIALIHKAN KE DEPARTEMEN LAIN'));

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && ($req['departments'] ?? []) === ['IT']
            && ($req['departmentOnly'] ?? false) === true
            && str_contains($req['message'] ?? '', 'TIKET MASUK (DIALIHKAN DARI Engineer)'));

        // Info-Only WA rule: NO group/DM message should contain command hints
        Http::assertNotSent(function ($req) {
            $msg = strtolower((string) ($req['message'] ?? ''));
            return str_contains($msg, 'ketik ambil')
                || str_contains($msg, 'ketik selesai')
                || str_contains($msg, 'ketik pending')
                || str_contains($msg, 'reply pesan ini');
        });
    }

    public function test_store_and_legacy_notifications_resolve_missing_reporter_phone_from_staff_directory(): void
    {
        $engUser = $this->makeUser('department', 'Engineer', 'Spv Budi');

        User::factory()->create([
            'name'            => 'Nadya Pratiwi',
            'staff_name'      => 'Nadya Pratiwi',
            'role'            => 'department',
            'department'      => 'HR',
            'whatsapp_number' => '081299988877',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);

        User::factory()->create([
            'name'            => 'Budi Santoso',
            'staff_name'      => 'Budi Santoso',
            'role'            => 'department',
            'department'      => 'Engineer',
            'whatsapp_number' => '081111111111',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);

        User::factory()->create([
            'name'            => 'Budi Santoso',
            'staff_name'      => 'Budi Santoso',
            'role'            => 'department',
            'department'      => 'Finance',
            'whatsapp_number' => '082222222222',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);

        // Case A: Exact single-staff fallback on store() when reporter_phone is empty
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', [
                'location'           => 'Kantor',
                'title'              => 'AC ruang rapat kurang dingin',
                'description'        => 'Suhu stabil di 27 derajat',
                'target_departments' => ['Engineer'],
                'reporter_name'      => 'Nadya Pratiwi',
                'reporter_dept'      => 'HR',
                'reporter_phone'     => '',
            ])
            ->assertStatus(200);

        $nadyaIssue = LeanIssue::where('reporter_name', 'Nadya Pratiwi')->firstOrFail();
        $this->assertEquals('081299988877', $nadyaIssue->reporter_phone);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && ($req['phone'] ?? '') === '6281299988877'
            && str_contains($req['message'] ?? '', 'AC ruang rapat kurang dingin'));

        // Case B: Duplicate-name disambiguation by reporter_dept
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', [
                'location'           => 'Kantor',
                'title'              => 'Printer Finance macet',
                'description'        => 'Paper jam pada tray 1',
                'target_departments' => ['Engineer'],
                'reporter_name'      => 'Budi Santoso',
                'reporter_dept'      => 'Finance',
            ])
            ->assertStatus(200);

        $budiIssue = LeanIssue::where('reporter_name', 'Budi Santoso')->firstOrFail();
        $this->assertEquals('082222222222', $budiIssue->reporter_phone);

        // Case C: Legacy issue already stored in DB without reporter_phone still gets DM fallback on claim
        $legacyIssue = LeanIssue::create([
            'location'           => 'TBR - Staff House',
            'title'              => 'Pintu Staff House macet',
            'description'        => 'Engsel pintu berkarat',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Nadya Pratiwi',
            'reporter_dept'      => 'HR',
            'reporter_phone'     => null,
            'status'             => 'open',
        ]);

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$legacyIssue->id}/claim", [
                'workers' => ['Andi'],
            ])
            ->assertStatus(200);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && ($req['phone'] ?? '') === '6281299988877'
            && str_contains($req['message'] ?? '', 'Pintu Staff House macet'));
    }

    public function test_whatsapp_bot_v2_api_endpoints_prevent_duplicate_group_and_dm_notifications(): void
    {
        $botHeaders = ['X-Bot-Key' => 'test-bot-secret'];

        // 1. apiStore with source='whatsapp_bot' normalizes dept, stores phone, and triggers ZERO HTTP notifications
        $storeRes = $this->postJson('/api/lean/issues', [
            'title'          => 'Handuk vila kurang bersih',
            'description'    => 'Perlu penggantian 2 handuk mandi',
            'location'       => 'TBR - Villa 02',
            'department'     => 'Housekeeping',
            'reporter'       => 'Siti',
            'reporter_dept'  => 'GR',
            'reporter_phone' => '6281377788899',
            'source'         => 'whatsapp_bot',
        ], $botHeaders);

        $storeRes->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.department', 'HK')
            ->assertJsonPath('data.reporter_phone', '6281377788899');

        $issueCode = $storeRes->json('data.id');
        $issue = LeanIssue::latest('id')->firstOrFail();
        $this->assertEquals(['HK'], $issue->target_departments);
        $this->assertEquals('6281377788899', $issue->reporter_phone);

        Http::assertNothingSent();

        // Reset fake recorder between steps by re-faking Http cleanly
        Http::fake([
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
            '*'                       => Http::response(['success' => true], 200),
        ]);

        // 2. apiClaim sends centralized DM to reporter, ZERO /notify group spam
        $this->postJson("/api/lean/issues/{$issueCode}/claim", [
            'taker'      => 'Rina HK',
            'department' => 'Housekeeping',
        ], $botHeaders)->assertStatus(200);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && ($req['phone'] ?? '') === '6281377788899'
            && str_contains($req['message'] ?? '', 'Rina HK'));
        Http::assertNotSent(fn ($req) => str_ends_with($req->url(), '/notify'));

        // 3. apiPending accepts Bot V2 'pending_by' key, sends centralized DM, ZERO /notify group spam
        $this->postJson("/api/lean/issues/{$issueCode}/pending", [
            'reason'     => 'Menunggu stok handuk dari laundry utama',
            'pending_by' => 'Spv Rina',
        ], $botHeaders)->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('pending', $issue->status);
        $this->assertEquals('Spv Rina', $issue->progress_logs[1]['actor']);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && ($req['phone'] ?? '') === '6281377788899'
            && str_contains($req['message'] ?? '', 'Spv Rina'));
        Http::assertNotSent(fn ($req) => str_ends_with($req->url(), '/notify'));

        // 4. apiTransfer normalizes 'Engineering' -> 'Engineer', resets ACCs, returns reporter_phone, sends DM only
        $transferRes = $this->postJson("/api/lean/issues/{$issueCode}/transfer", [
            'to_department'  => 'Engineering',
            'reason'         => 'Mesin pemanas kamar mandi juga bermasalah',
            'transferred_by' => 'Spv Rina',
        ], $botHeaders);

        $transferRes->assertStatus(200)
            ->assertJsonPath('data.to_department', 'Engineer')
            ->assertJsonPath('data.reporter_phone', '6281377788899');

        $issue->refresh();
        $this->assertEquals(['Engineer'], $issue->target_departments);
        $this->assertArrayHasKey('Engineer', $issue->department_accs);
        $this->assertArrayNotHasKey('HK', $issue->department_accs);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && ($req['phone'] ?? '') === '6281377788899'
            && str_contains($req['message'] ?? '', 'Pengalihan Departemen Penangan'));
        Http::assertNotSent(fn ($req) => str_ends_with($req->url(), '/notify'));

        // 5. apiResolve sends DM only, ZERO /notify group spam
        $this->postJson("/api/lean/issues/{$issueCode}/resolve", [
            'solver'         => 'Andi Eng',
            'fixDescription' => 'Pemanas diganti dan area dibersihkan',
        ], $botHeaders)->assertStatus(200);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && ($req['phone'] ?? '') === '6281377788899'
            && str_contains($req['message'] ?? '', 'Andi Eng'));
        Http::assertNotSent(fn ($req) => str_ends_with($req->url(), '/notify'));
    }

    public function test_resuming_pending_issue_logs_progress_and_respects_wa_notify_toggle(): void
    {
        $engUser = $this->makeUser('department', 'Engineer', 'Spv Budi');
        $issue = $this->makeEngineerIssue([
            'status'          => 'pending',
            'pending_reason'  => 'Menunggu valve dari vendor',
            'pending_since'   => now(),
            'active_workers'  => ['Andi Eng'],
            'claimed_by_name' => 'Andi Eng',
            'claimed_by_dept' => 'Engineer',
        ]);

        // 1. Resume from Pending (default notify_reporter = true, empty note -> Progress label & WA sent)
        $res1 = $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers' => ['Andi Eng', 'Citra Eng'],
            ]);

        $res1->assertStatus(200)
            ->assertJsonPath('message', 'Isu dilanjutkan ke tahap Progress oleh Andi Eng, Citra Eng (Engineer).');

        $issue->refresh();
        $this->assertEquals('in_progress', $issue->status);
        $this->assertEquals('progress', $issue->progress_logs[0]['type']);
        $this->assertEquals('Melanjutkan kembali ke tahap Progress.', $issue->progress_logs[0]['message']);
        $this->assertTrue($issue->progress_logs[0]['notified_wa']);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', 'Laporan Dilanjutkan ke Tahap Progress')
            && str_contains($req['message'] ?? '', '*Progress*'));

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && ($req['departmentOnly'] ?? false) === true
            && str_contains($req['message'] ?? '', 'TIKET DILANJUTKAN KE PROGRESS')
            && str_contains($req['message'] ?? '', 'Progress')
            && !str_contains(strtolower($req['message'] ?? ''), 'ketik '));

        // Put back into Pending, then resume with notify_reporter = false and custom note
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", [
                'reason' => 'Tunggu tekanan pipa turun',
            ])
            ->assertStatus(200);

        Http::fake([
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
            '*'                       => Http::response(['success' => true], 200),
        ]);

        // 2. Resume with notify_reporter = false skips DM, notifies group, and records notified_wa = false
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers'         => ['Andi Eng', 'Citra Eng'],
                'note'            => 'Tekanan normal, lanjut pasang valve baru',
                'notify_reporter' => false,
            ])
            ->assertStatus(200);

        $issue->refresh();
        $latestLog = $issue->progress_logs[count($issue->progress_logs) - 1];
        $this->assertEquals('progress', $latestLog['type']);
        $this->assertEquals('Tekanan normal, lanjut pasang valve baru', $latestLog['message']);
        $this->assertFalse($latestLog['notified_wa']);

        Http::assertNotSent(fn ($req) => str_ends_with($req->url(), '/notify-direct'));
        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && str_contains($req['message'] ?? '', 'TIKET DILANJUTKAN KE PROGRESS')
            && str_contains($req['message'] ?? '', 'Tekanan normal, lanjut pasang valve baru'));

        // 3. When bot /notify-direct fails (503), notified_wa stays false
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", [
                'reason' => 'Pending untuk tes offline WA',
            ])
            ->assertStatus(200);

        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake([
            'http://localhost:3000/notify-direct' => Http::response(['success' => false], 503),
            'http://localhost:3000/notify'        => Http::response(['success' => true], 200),
            '*'                                   => Http::response(['success' => true], 200),
        ]);

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers'         => ['Andi Eng'],
                'note'            => 'Lanjut saat bot WA offline',
                'notify_reporter' => true,
            ])
            ->assertStatus(200);

        $issue->refresh();
        $offlineLog = $issue->progress_logs[count($issue->progress_logs) - 1];
        $this->assertEquals('progress', $offlineLog['type']);
        $this->assertFalse($offlineLog['notified_wa']);

        // 4. API claim on pending issue also records type='progress'
        $issue->update(['status' => 'pending', 'pending_reason' => 'Cek via API']);
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake([
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
            '*'                       => Http::response(['success' => true], 200),
        ]);

        $issueCode = \App\Http\Controllers\LeanController::formatIssueCode($issue);
        $this->postJson("/api/lean/issues/{$issueCode}/claim", [
            'taker'      => 'Budi API',
            'department' => 'Engineer',
        ], ['X-Bot-Key' => 'test-bot-secret'])->assertStatus(200);

        $issue->refresh();
        $apiLog = $issue->progress_logs[count($issue->progress_logs) - 1];
        $this->assertEquals('progress', $apiLog['type']);
        $this->assertEquals('Melanjutkan kembali ke tahap Progress via WhatsApp.', $apiLog['message']);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', 'Tahap Progress'));
        Http::assertNotSent(fn ($req) => str_ends_with($req->url(), '/notify'));
    }
}
