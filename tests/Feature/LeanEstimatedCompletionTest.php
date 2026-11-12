<?php

namespace Tests\Feature;

use App\Http\Controllers\LeanController;
use App\Models\LeanIssue;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LeanEstimatedCompletionTest extends TestCase
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

        $sheetMock = $this->createMock(LeanSheetDirectService::class);
        $sheetMock->method('getMonthGids')->willReturn(['November' => 11111]);
        $sheetMock->method('syncSingleIssue')->willReturn(true);
        $this->app->instance(LeanSheetDirectService::class, $sheetMock);

        $gasMock = $this->createMock(GoogleSheetsSyncService::class);
        $gasMock->method('syncIssue')->willReturn(true);
        $this->app->instance(GoogleSheetsSyncService::class, $gasMock);

        Http::fake([
            'http://127.0.0.1:3000/*' => Http::response(['success' => true], 200),
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
            '*'                       => Http::response(['success' => true], 200),
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
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
            'location'           => 'TBR - Villa 05',
            'title'              => 'AC Kamar Utama Kurang Dingin',
            'description'        => 'Perlu pengecekan freon dan filter indoor',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Nadya',
            'reporter_dept'      => 'GR',
            'reporter_phone'     => '081234567890',
            'status'             => 'open',
        ], $overrides));
    }

    public function test_store_with_start_in_progress_parses_wib_eta_and_notifies_reporter_and_groups(): void
    {
        $engUser = $this->makeUser('department', 'Engineer', 'Spv Budi');

        $response = $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', [
                'location'                => 'TBR - Villa 05',
                'title'                   => 'Keran Wastafel Bocor',
                'description'             => 'Air menetes deras dari sambungan bawah',
                'target_departments'      => ['Engineer'],
                'reporter_name'           => 'Nadya',
                'reporter_dept'           => 'GR',
                'reporter_phone'          => '6281234567890',
                'start_in_progress'       => true,
                'assigned_workers'        => 'Andi, Budi',
                'estimated_completion_at' => '2026-11-12T15:30',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $issue = LeanIssue::first();
        $this->assertNotNull($issue);
        $this->assertEquals('in_progress', $issue->status);
        $this->assertNotNull($issue->estimated_completion_at);
        // Naive '2026-11-12T15:30' is interpreted as Asia/Jakarta (UTC+7) -> '2026-11-12 08:30:00' UTC
        $this->assertEquals('2026-11-12 08:30:00', $issue->estimated_completion_at->copy()->setTimezone('UTC')->format('Y-m-d H:i:s'));
        $this->assertEquals('2026-11-12 15:30', $issue->estimated_completion_at->copy()->setTimezone('Asia/Jakarta')->format('Y-m-d H:i'));
        $this->assertArrayHasKey('estimated_completion_at', $issue->progress_logs[0]);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', '*Perkiraan Selesai:* 12 Nov 2026, 15:30 WIB'));

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && str_contains($req['message'] ?? '', '*Perkiraan Selesai:* 12 Nov 2026, 15:30 WIB'));

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->get('/lapangan')
            ->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->where('issues.0.estimated_completion_at', $issue->estimated_completion_at->toIso8601String())
            );
    }

    public function test_store_ignores_eta_when_open_and_rejects_invalid_date_input(): void
    {
        $engUser = $this->makeUser('department', 'Engineer', 'Spv Budi');

        // 1. Open report (start_in_progress = false) does not store ETA
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', [
                'location'                => 'TPI - Main Jetty',
                'title'                   => 'Lampu Dermaga Mati',
                'target_departments'      => ['Engineer'],
                'reporter_name'           => 'Siti',
                'start_in_progress'       => false,
                'estimated_completion_at' => '2026-11-12T15:30',
            ])
            ->assertStatus(200);

        $issue = LeanIssue::first();
        $this->assertEquals('open', $issue->status);
        $this->assertNull($issue->estimated_completion_at);

        // 2. Invalid date input returns 422 validation error
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', [
                'location'                => 'TPI - Main Jetty',
                'title'                   => 'Lampu Bermasalah',
                'target_departments'      => ['Engineer'],
                'reporter_name'           => 'Siti',
                'start_in_progress'       => true,
                'estimated_completion_at' => 'bukan-format-tanggal',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['estimated_completion_at']);
    }

    public function test_full_unified_eta_lifecycle_claim_progress_only_eta_pending_resolve_sla_and_transfer(): void
    {
        $engUser = $this->makeUser('department', 'Engineer', 'Spv Budi');
        $issue = $this->makeEngineerIssue();

        // Phase 1: Claim sets ETA ('2026-11-12T14:00:00+07:00')
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers'                 => ['Andi'],
                'note'                    => 'Berangkat membawa peralatan AC',
                'estimated_completion_at' => '2026-11-12T14:00:00+07:00',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('2026-11-12 07:00:00', $issue->estimated_completion_at->copy()->setTimezone('UTC')->format('Y-m-d H:i:s'));

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', '*Perkiraan Selesai:* 12 Nov 2026, 14:00 WIB'));

        // Phase 2a: Submitting progress with exact same ETA + empty comment + unchanged workers still returns 422
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/progress", [
                'comment'                 => '',
                'workers'                 => ['Andi'],
                'estimated_completion_at' => '2026-11-12T14:00:00+07:00',
            ])
            ->assertStatus(422);

        // Phase 2b: Updating ETA alone (empty comment, unchanged workers) is accepted cleanly
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake([
            'http://127.0.0.1:3000/*' => Http::response(['success' => true], 200),
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
            '*'                       => Http::response(['success' => true], 200),
        ]);

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/progress", [
                'comment'                 => '',
                'workers'                 => ['Andi'],
                'estimated_completion_at' => '2026-11-12T16:45',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('2026-11-12 09:45:00', $issue->estimated_completion_at->copy()->setTimezone('UTC')->format('Y-m-d H:i:s'));
        $latestProgressLog = $issue->progress_logs[count($issue->progress_logs) - 1];
        $this->assertTrue($latestProgressLog['eta_changed']);
        $this->assertFalse($latestProgressLog['eta_cleared']);
        $this->assertStringContainsString('12 Nov 2026, 16:45 WIB', $latestProgressLog['message']);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', '*Perkiraan Selesai Diperbarui:* 12 Nov 2026, 16:45 WIB'));
        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify')
            && str_contains($req['message'] ?? '', '*Perkiraan Selesai Diperbarui:* 12 Nov 2026, 16:45 WIB'));

        // Phase 2c: Clearing ETA alone via clear_eta=true
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/progress", [
                'comment'   => '',
                'workers'   => ['Andi'],
                'clear_eta' => true,
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertNull($issue->estimated_completion_at);
        $clearLog = $issue->progress_logs[count($issue->progress_logs) - 1];
        $this->assertTrue($clearLog['eta_changed']);
        $this->assertTrue($clearLog['eta_cleared']);

        // Phase 3: Pending sets a new ETA for continuation/completion
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", [
                'reason'                  => 'Menunggu kapasitor pengganti tiba dari gudang besok',
                'estimated_completion_at' => '2026-11-13T10:00',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('pending', $issue->status);
        $this->assertEquals('2026-11-13 03:00:00', $issue->estimated_completion_at->copy()->setTimezone('UTC')->format('Y-m-d H:i:s'));

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', '*Perkiraan Selesai / Lanjut:* 13 Nov 2026, 10:00 WIB'));

        // Verify Google Sheets Column V (index 21) formats ETA in Asia/Jakarta WIB
        $realSheetService = new LeanSheetDirectService();
        $sheetRow = $realSheetService->formatIssueRow($issue);
        $this->assertCount(22, $sheetRow);
        $this->assertEquals('2026-11-13 10:00', $sheetRow[21]);

        // Phase 4: Resume from pending allows keeping or clearing ETA; let's keep it updated
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers'                 => ['Andi', 'Budi'],
                'estimated_completion_at' => '2026-11-13T11:30',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('in_progress', $issue->status);
        $this->assertEquals('2026-11-13 04:30:00', $issue->estimated_completion_at->copy()->setTimezone('UTC')->format('Y-m-d H:i:s'));

        // Phase 5a: Transfer to IT resets estimated_completion_at = null & records cleared_eta in log
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/transfer", [
                'to_department' => 'IT',
                'reason'        => 'Masalah ada pada modul controller Smart TV',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('open', $issue->status);
        $this->assertEquals(['IT'], $issue->target_departments);
        $this->assertNull($issue->estimated_completion_at);
        $transferLog = $issue->progress_logs[count($issue->progress_logs) - 1];
        $this->assertTrue($transferLog['eta_cleared']);

        // Former owner (Engineer) cannot mutate transferred issue anymore
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", ['workers' => ['Andi']])
            ->assertStatus(403);
    }

    public function test_resolve_retains_eta_and_evaluates_on_time_vs_overdue_sla(): void
    {
        $engUser = $this->makeUser('department', 'Engineer', 'Spv Budi');

        // 1. Resolved BEFORE ETA -> on_time
        $onTimeIssue = $this->makeEngineerIssue([
            'status'                  => 'in_progress',
            'active_workers'          => ['Andi'],
            'claimed_by_name'         => 'Andi',
            'claimed_by_dept'         => 'Engineer',
            'estimated_completion_at' => Carbon::parse('2026-11-12 15:00:00', 'Asia/Jakarta')->setTimezone('UTC'),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-12 14:40:00', 'Asia/Jakarta'));

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$onTimeIssue->id}/resolve", [
                'note'          => 'Selesai 20 menit lebih cepat dari target.',
                'final_workers' => ['Andi'],
            ])
            ->assertStatus(200);

        $onTimeIssue->refresh();
        $this->assertEquals('resolved', $onTimeIssue->status);
        $this->assertNotNull($onTimeIssue->estimated_completion_at);
        $this->assertEquals('on_time', $onTimeIssue->progress_logs[0]['sla_status']);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', '*Target Awal:* 12 Nov 2026, 15:00 WIB (Tepat Waktu)'));

        // 2. Resolved AFTER ETA -> overdue
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake([
            'http://127.0.0.1:3000/*' => Http::response(['success' => true], 200),
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
            '*'                       => Http::response(['success' => true], 200),
        ]);

        $overdueIssue = $this->makeEngineerIssue([
            'title'                   => 'Pompa Jetty Mati',
            'status'                  => 'in_progress',
            'active_workers'          => ['Budi'],
            'claimed_by_name'         => 'Budi',
            'claimed_by_dept'         => 'Engineer',
            'estimated_completion_at' => Carbon::parse('2026-11-12 15:00:00', 'Asia/Jakarta')->setTimezone('UTC'),
        ]);

        Carbon::setTestNow(Carbon::parse('2026-11-12 15:25:00', 'Asia/Jakarta'));

        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$overdueIssue->id}/resolve", [
                'note'          => 'Pompa sudah menyala kembali.',
                'final_workers' => ['Budi'],
            ])
            ->assertStatus(200);

        $overdueIssue->refresh();
        $this->assertEquals('overdue', $overdueIssue->progress_logs[0]['sla_status']);
        $this->assertNotNull($overdueIssue->estimated_completion_at);

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/notify-direct')
            && str_contains($req['message'] ?? '', '*Target Awal:* 12 Nov 2026, 15:00 WIB (Melewati Target)'));
    }

    public function test_bot_api_endpoints_preserve_eta_when_omitted_and_reset_on_transfer(): void
    {
        $botHeaders = ['X-Bot-Key' => 'test-bot-secret'];

        // 1. apiStore accepts optional estimated_completion_at
        $storeRes = $this->postJson('/api/lean/issues', [
            'title'                   => 'Mesin Kopi Resto Error',
            'description'             => 'Muncul kode E05',
            'location'                => 'TPI - Restoran',
            'department'              => 'Engineer',
            'reporter'                => 'Rina',
            'reporter_dept'           => 'GR',
            'reporter_phone'          => '6281377788899',
            'estimated_completion_at' => '2026-11-12T18:00',
        ], $botHeaders);

        $storeRes->assertStatus(200)
            ->assertJsonPath('data.status', 'open');
        $issueCode = $storeRes->json('data.id');
        $this->assertNotNull($storeRes->json('data.estimated_completion_at'));

        // 2. apiIndex returns estimated_completion_at
        $this->getJson('/api/lean/issues', $botHeaders)
            ->assertStatus(200)
            ->assertJsonPath('data.0.id', $issueCode)
            ->assertJsonPath('data.0.estimated_completion_at', $storeRes->json('data.estimated_completion_at'));

        // 3. apiClaim WITHOUT estimated_completion_at preserves existing ETA
        $claimRes = $this->postJson("/api/lean/issues/{$issueCode}/claim", [
            'taker'      => 'Andi Eng',
            'department' => 'Engineer',
        ], $botHeaders);

        $claimRes->assertStatus(200)
            ->assertJsonPath('data.estimated_completion_at', $storeRes->json('data.estimated_completion_at'));

        // 4. apiPending WITH new ETA updates ETA
        $pendingRes = $this->postJson("/api/lean/issues/{$issueCode}/pending", [
            'reason'                  => 'Menunggu heating element cadangan',
            'actor'                   => 'Andi Eng',
            'estimated_completion_at' => '2026-11-13T09:00',
        ], $botHeaders);

        $pendingRes->assertStatus(200);
        $issue = LeanController::findIssueByIdOrCode($issueCode);
        $this->assertEquals('2026-11-13 09:00', $issue->estimated_completion_at->copy()->setTimezone('Asia/Jakarta')->format('Y-m-d H:i'));

        // 5. apiResolve preserves ETA & logs SLA evaluation
        Carbon::setTestNow(Carbon::parse('2026-11-13 08:45:00', 'Asia/Jakarta'));
        $resolveRes = $this->postJson("/api/lean/issues/{$issueCode}/resolve", [
            'solver'         => 'Andi Eng',
            'fixDescription' => 'Element diganti dan dites normal',
        ], $botHeaders);

        $resolveRes->assertStatus(200)
            ->assertJsonPath('data.estimated_completion_at', $issue->estimated_completion_at->toIso8601String());

        $issue->refresh();
        $lastLog = $issue->progress_logs[count($issue->progress_logs) - 1];
        $this->assertEquals('on_time', $lastLog['sla_status']);

        // 6. apiTransfer resets estimated_completion_at to null
        $issue2 = $this->makeEngineerIssue([
            'estimated_completion_at' => Carbon::parse('2026-11-14 12:00:00', 'Asia/Jakarta')->setTimezone('UTC'),
        ]);
        $code2 = LeanController::formatIssueCode($issue2);

        $this->postJson("/api/lean/issues/{$code2}/transfer", [
            'to_department'  => 'IT',
            'reason'         => 'Ternyata kendala jaringan POS',
            'transferred_by' => 'Spv Eng',
        ], $botHeaders)->assertStatus(200);

        $issue2->refresh();
        $this->assertNull($issue2->estimated_completion_at);
    }
}
