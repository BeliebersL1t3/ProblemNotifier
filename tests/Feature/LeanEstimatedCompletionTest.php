<?php

namespace Tests\Feature;

use App\Models\LeanIssue;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
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
        Config::set('services.bot.owner_whatsapp', '08113861133');
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

    public function test_dashboard_store_defaults_to_in_progress_and_starts_auto_timer_without_manual_eta(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-18 10:00:00', 'Asia/Jakarta'));
        $engUser = User::factory()->create([
            'name'            => 'Spv Budi',
            'staff_name'      => 'Spv Budi',
            'role'            => 'department',
            'department'      => 'Engineer',
            'is_hod'          => true,
            'hod_title'       => 'Supervisor Engineer',
            'whatsapp_number' => '081234567890',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);

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
                'assigned_workers'        => 'Andi, Budi',
                // Legacy manual ETA input must be ignored
                'estimated_completion_at' => '2026-11-18T15:30',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $issue = LeanIssue::latest('id')->first();
        $this->assertNotNull($issue);
        $this->assertEquals('in_progress', $issue->status);
        $this->assertNull($issue->estimated_completion_at);
        $this->assertNotNull($issue->last_progress_at);
        $this->assertNotNull($issue->claimed_at);
        $this->assertEquals('Andi, Budi', $issue->claimed_by_name);

        // Inertia payload exposes automatic timer fields cleanly
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->get('/lapangan')
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->where('issues.0.status', 'in_progress')
                ->where('issues.0.last_progress_at', $issue->last_progress_at->toIso8601String())
                ->where('issues.0.escalation_group_count', 0)
                ->where('issues.0.escalation_owner_count', 0)
            );
    }

    public function test_dashboard_store_still_preserves_open_status_when_start_in_progress_is_false(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-18 10:00:00', 'Asia/Jakarta'));
        $engUser = User::factory()->create([
            'name'            => 'Spv Budi',
            'staff_name'      => 'Spv Budi',
            'role'            => 'department',
            'department'      => 'Engineer',
            'is_hod'          => true,
            'hod_title'       => 'Supervisor Engineer',
            'whatsapp_number' => '081234567890',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);

        $response = $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', [
                'location'           => 'TBR - Villa 08',
                'title'              => 'Lampu Balkon Padam',
                'target_departments' => ['Engineer'],
                'reporter_name'      => 'Nadya',
                'start_in_progress'  => false,
            ]);

        $response->assertStatus(200);
        $issue = LeanIssue::latest('id')->first();
        $this->assertEquals('open', $issue->status);
        $this->assertNull($issue->claimed_at);
        $this->assertNotNull($issue->last_progress_at);
    }

    public function test_auto_escalation_triggers_1h_group_and_3h_owner_without_duplicates_and_resets_on_progress(): void
    {
        $start = Carbon::parse('2026-11-18 09:00:00', 'Asia/Jakarta')->setTimezone(config('app.timezone'));
        Carbon::setTestNow($start);

        $engUser = User::factory()->create([
            'name'            => 'Spv Budi',
            'staff_name'      => 'Spv Budi',
            'role'            => 'department',
            'department'      => 'Engineer',
            'is_hod'          => true,
            'hod_title'       => 'Supervisor Engineer',
            'whatsapp_number' => '081234567890',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);
        $issue = LeanIssue::create([
            'location'           => 'TPI - Jetty',
            'title'              => 'Pompa Jetty Mati',
            'description'        => 'Perlu pengecekan motor pompa',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Taufik',
            'reporter_dept'      => 'OE',
            'status'             => 'in_progress',
            'claimed_by_name'    => 'Spv Budi',
            'claimed_by_dept'    => 'Engineer',
            'claimed_at'         => $start,
            'last_progress_at'   => $start,
            'active_workers'     => ['Spv Budi'],
        ]);

        // 1. At 59 minutes: no escalation yet
        Carbon::setTestNow($start->copy()->addMinutes(59));
        Artisan::call('lean:check-escalations');
        Http::assertNothingSent();

        // 2. At 60 minutes (1 hour): Supervisor DM escalation fires once (NOT sent to group /notify)
        Carbon::setTestNow($start->copy()->addMinutes(60));
        Artisan::call('lean:check-escalations');

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/notify-direct')
                && ($request['phone'] ?? '') === '6281234567890'
                && str_contains((string) ($request['message'] ?? ''), 'ESKALASI SUPERVISOR (1 JAM TANPA KABAR)');
        });
        Http::assertNotSent(function ($request) {
            return str_ends_with($request->url(), '/notify');
        });
        $issue->refresh();
        $this->assertNotNull($issue->group_escalated_at);
        $this->assertNull($issue->owner_escalated_at);
        $this->assertEquals(1, $issue->escalation_group_count);
        $this->assertEquals(0, $issue->escalation_owner_count);

        // Running again at 90 minutes does NOT re-send group alert
        Http::fake(['*' => Http::response(['success' => true], 200)]);
        Carbon::setTestNow($start->copy()->addMinutes(90));
        Artisan::call('lean:check-escalations');
        Http::assertNothingSent();

        // 3. At 180 minutes (3 hours): Owner escalation fires directly to 628113861133
        Carbon::setTestNow($start->copy()->addMinutes(180));
        Artisan::call('lean:check-escalations');

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/notify-direct')
                && ($request['phone'] ?? '') === '628113861133'
                && str_contains((string) ($request['message'] ?? ''), 'ESKALASI OWNER (3 JAM TANPA KABAR)');
        });
        $issue->refresh();
        $this->assertNotNull($issue->owner_escalated_at);
        $this->assertEquals(1, $issue->escalation_owner_count);

        // Running again at 200 minutes does NOT duplicate owner alert
        Http::fake(['*' => Http::response(['success' => true], 200)]);
        Carbon::setTestNow($start->copy()->addMinutes(200));
        Artisan::call('lean:check-escalations');
        Http::assertNothingSent();

        // 4. Supervisor posts Update Progress -> resets timer to 0, clears escalation flags, preserves historical counts
        $updateTime = $start->copy()->addMinutes(210);
        Carbon::setTestNow($updateTime);
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/progress", [
                'comment' => 'Motor pompa sedang dibongkar untuk ganti bearing',
                'workers' => ['Spv Budi'],
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertNull($issue->group_escalated_at);
        $this->assertNull($issue->owner_escalated_at);
        $this->assertEquals(1, $issue->escalation_group_count);
        $this->assertEquals(1, $issue->escalation_owner_count);
        $this->assertTrue($issue->last_progress_at->equalTo($updateTime));

        // 5. After another 60 minutes with no further progress, a fresh 1h Supervisor DM reminder fires!
        Http::fake(['*' => Http::response(['success' => true], 200)]);
        Carbon::setTestNow($updateTime->copy()->addMinutes(60));
        Artisan::call('lean:check-escalations');

        Http::assertSent(fn ($req) => str_contains($req->url(), '/notify-direct') && ($req['phone'] ?? '') === '6281234567890');
        $issue->refresh();
        $this->assertEquals(2, $issue->escalation_group_count);
    }

    public function test_pending_pauses_timer_and_resume_restarts_and_resolve_keeps_full_duration(): void
    {
        $start = Carbon::parse('2026-11-18 08:00:00', 'Asia/Jakarta')->setTimezone(config('app.timezone'));
        Carbon::setTestNow($start);

        $engUser = User::factory()->create([
            'name'            => 'Spv Budi',
            'staff_name'      => 'Spv Budi',
            'role'            => 'department',
            'department'      => 'Engineer',
            'is_hod'          => true,
            'hod_title'       => 'Supervisor Engineer',
            'whatsapp_number' => '081234567890',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);
        $issue = LeanIssue::create([
            'location'           => 'TPI - Kitchen',
            'title'              => 'Chiller Kurang Dingin',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Chef Ricky',
            'reporter_dept'      => 'Kitchen',
            'status'             => 'in_progress',
            'claimed_by_name'    => 'Spv Budi',
            'claimed_by_dept'    => 'Engineer',
            'claimed_at'         => $start,
            'last_progress_at'   => $start,
            'active_workers'     => ['Spv Budi'],
        ]);

        // Mark Pending at +20m
        Carbon::setTestNow($start->copy()->addMinutes(20));
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", [
                'reason' => 'Menunggu kompresor dari Batam',
            ])
            ->assertStatus(200);

        // Even 6 hours later while still Pending, ZERO escalations fire!
        Http::fake(['*' => Http::response(['success' => true], 200)]);
        Carbon::setTestNow($start->copy()->addHours(6));
        Artisan::call('lean:check-escalations');
        Http::assertNothingSent();

        // Resume from Pending via Claim at +6h -> timer restarts fresh from 0
        $resumeTime = $start->copy()->addHours(6);
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", [
                'workers' => ['Spv Budi'],
                'note'    => 'Kompresor tiba, lanjut pemasangan',
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('in_progress', $issue->status);
        $this->assertTrue($issue->last_progress_at->equalTo($resumeTime));

        // 30 minutes after resume: still under 1h -> no escalation
        Http::fake(['*' => Http::response(['success' => true], 200)]);
        Carbon::setTestNow($resumeTime->copy()->addMinutes(30));
        Artisan::call('lean:check-escalations');
        Http::assertNothingSent();

        // Resolve at +7h from original creation -> full created_at -> resolved_at duration (7h) preserved, no further escalation
        $resolveTime = $start->copy()->addHours(7);
        Carbon::setTestNow($resolveTime);
        $this->actingAs($engUser)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/resolve", [
                'note'          => 'Kompresor terpasang dan suhu normal 4C',
                'final_workers' => ['Spv Budi'],
            ])
            ->assertStatus(200);

        $issue->refresh();
        $this->assertEquals('resolved', $issue->status);
        $this->assertEquals(420, (int) $issue->created_at->diffInMinutes($issue->resolved_at));

        Http::fake(['*' => Http::response(['success' => true], 200)]);
        Carbon::setTestNow($resolveTime->copy()->addHours(5));
        Artisan::call('lean:check-escalations');
        Http::assertNothingSent();
    }

    public function test_1h_escalation_fails_over_to_another_active_supervisor_when_primary_resigns(): void
    {
        $start = Carbon::parse('2026-11-18 09:00:00', 'Asia/Jakarta')->setTimezone(config('app.timezone'));
        Carbon::setTestNow($start);

        // Resigned / inactive primary supervisor
        User::factory()->create([
            'name'            => 'Spv Resigned',
            'staff_name'      => 'Spv Resigned',
            'role'            => 'department',
            'department'      => 'Engineer',
            'is_hod'          => true,
            'hod_title'       => 'Supervisor Engineer',
            'whatsapp_number' => '081211110000',
            'approval_status' => 'approved',
            'is_active'       => false,
        ]);

        // Active backup supervisor in the same department
        User::factory()->create([
            'name'            => 'Spv Pengganti',
            'staff_name'      => 'Spv Pengganti',
            'role'            => 'department',
            'department'      => 'Engineer',
            'is_hod'          => true,
            'hod_title'       => 'Supervisor Engineer',
            'whatsapp_number' => '081299998888',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);

        LeanIssue::create([
            'location'           => 'TPI - Powerhouse',
            'title'              => 'Panel Listrik Panas',
            'description'        => 'Suhu panel naik',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Taufik',
            'reporter_dept'      => 'OE',
            'status'             => 'open',
            'last_progress_at'   => $start,
        ]);

        Carbon::setTestNow($start->copy()->addMinutes(60));
        Artisan::call('lean:check-escalations');

        Http::assertSent(fn ($req) => str_contains($req->url(), '/notify-direct') && ($req['phone'] ?? '') === '6281299998888');
        Http::assertNotSent(fn ($req) => ($req['phone'] ?? '') === '6281211110000');
    }

    public function test_1h_escalation_fails_over_to_admin_when_no_active_supervisor_in_department(): void
    {
        $start = Carbon::parse('2026-11-18 10:00:00', 'Asia/Jakarta')->setTimezone(config('app.timezone'));
        Carbon::setTestNow($start);

        // Resigned supervisor in Kitchen (no other active supervisor in Kitchen)
        User::factory()->create([
            'name'            => 'Spv Kitchen Resign',
            'staff_name'      => 'Spv Kitchen Resign',
            'role'            => 'department',
            'department'      => 'Kitchen',
            'is_hod'          => true,
            'whatsapp_number' => '081255550000',
            'approval_status' => 'approved',
            'is_active'       => false,
        ]);

        // Active Admin fallback
        User::factory()->create([
            'name'            => 'Admin Telunas',
            'staff_name'      => 'Admin Telunas',
            'role'            => 'admin',
            'department'      => null,
            'whatsapp_number' => '081277776666',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);

        LeanIssue::create([
            'location'           => 'TPI - Kitchen',
            'title'              => 'Kompor Gas Bocor',
            'description'        => 'Selang kompor perlu diganti',
            'target_departments' => ['Kitchen'],
            'reporter_name'      => 'Chef Andi',
            'reporter_dept'      => 'Kitchen',
            'status'             => 'open',
            'last_progress_at'   => $start,
        ]);

        Carbon::setTestNow($start->copy()->addMinutes(60));
        Artisan::call('lean:check-escalations');

        Http::assertSent(function ($req) {
            return str_contains($req->url(), '/notify-direct')
                && ($req['phone'] ?? '') === '6281277776666'
                && str_contains((string) ($req['message'] ?? ''), 'AUTO-FAILOVER');
        });
        Http::assertNotSent(fn ($req) => ($req['phone'] ?? '') === '6281255550000');
    }
}
