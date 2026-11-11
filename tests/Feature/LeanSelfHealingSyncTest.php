<?php

namespace Tests\Feature;

use App\Models\LeanIssue;
use App\Models\User;
use App\Services\LeanSheetDirectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LeanSelfHealingSyncTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('cache.default', 'array');
        Config::set('session.driver', 'array');
        Cache::flush();
    }

    public function test_issue_lifecycle_tracks_sheets_sync_status(): void
    {
        $issue = LeanIssue::create([
            'location'           => 'TBR Villa 1',
            'title'              => 'Pipa bocor',
            'description'        => 'Perlu perbaikan',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Nadya',
            'reporter_dept'      => 'HR',
            'status'             => 'open',
        ]);

        $this->assertTrue((bool) $issue->needs_sheets_sync);
        $this->assertNull($issue->sheets_synced_at);

        // Simulate successful sync
        $issue->markSheetsSynced();
        $issue->refresh();

        $this->assertFalse((bool) $issue->needs_sheets_sync);
        $this->assertNotNull($issue->sheets_synced_at);
        $this->assertNull($issue->sheets_sync_error);

        // Business update flips needs_sheets_sync back to true
        $issue->status = 'in_progress';
        $issue->save();
        $issue->refresh();
        $this->assertTrue((bool) $issue->needs_sheets_sync);

        // Mark synced again, then simulate failure
        $issue->markSheetsSynced();
        $issue->markSheetsSyncFailed('Network timeout error');
        $issue->refresh();

        $this->assertTrue((bool) $issue->needs_sheets_sync);
        $this->assertEquals('Network timeout error', $issue->sheets_sync_error);

        // Soft delete must mark needs_sheets_sync = true even if previously synced
        $issue->markSheetsSynced();
        $issue->deleted_by_name = 'Admin nih';
        $issue->save();
        $issue->markSheetsSynced();
        $issue->delete();

        $trashed = LeanIssue::withTrashed()->findOrFail($issue->id);
        $this->assertTrue($trashed->trashed());
        $this->assertTrue((bool) $trashed->needs_sheets_sync);

        // Restore must also mark needs_sheets_sync = true
        $trashed->markSheetsSynced();
        $trashed->restore();
        $trashed->refresh();
        $this->assertTrue((bool) $trashed->needs_sheets_sync);
    }

    public function test_reconcile_pending_issues_heals_active_and_soft_deleted_issues(): void
    {
        $activeIssue = LeanIssue::create([
            'location'           => 'TPI Pier',
            'title'              => 'Lampu mati',
            'description'        => 'Lampu dermaga mati',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Budi',
            'reporter_dept'      => 'Marine',
            'status'             => 'open',
        ]);

        $deletedIssue = LeanIssue::create([
            'location'           => 'Kantor',
            'title'              => 'AC panas',
            'description'        => 'AC ruang meeting',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Sari',
            'reporter_dept'      => 'Admin',
            'status'             => 'open',
            'deleted_by_name'    => 'Phillip',
        ]);
        $deletedIssue->delete();

        $syncedIds = [];
        $fakeService = new class($syncedIds, $deletedIssue->id) extends LeanSheetDirectService {
            public array $calls;
            private int $failOnceId;
            private bool $failedOnce = false;

            public function __construct(&$calls, int $failOnceId)
            {
                parent::__construct();
                $this->calls = &$calls;
                $this->failOnceId = $failOnceId;
            }

            public function syncSingleIssue(LeanIssue $issue): bool
            {
                $this->calls[] = $issue->id;
                if ($issue->id === $this->failOnceId && !$this->failedOnce) {
                    $this->failedOnce = true;
                    $issue->markSheetsSyncFailed('Temporary API failure');
                    return false;
                }
                $issue->markSheetsSynced();
                return true;
            }
        };

        // Pass 1: activeIssue succeeds, deletedIssue fails once
        $res1 = $fakeService->reconcilePendingIssues(10);
        $this->assertFalse($res1['success']);
        $this->assertEquals(1, $res1['synced']);
        $this->assertEquals(1, $res1['failed']);
        $this->assertEquals(1, $res1['remaining']);

        $this->assertFalse((bool) LeanIssue::find($activeIssue->id)->needs_sheets_sync);
        $this->assertTrue((bool) LeanIssue::withTrashed()->find($deletedIssue->id)->needs_sheets_sync);
        $this->assertEquals('Temporary API failure', LeanIssue::withTrashed()->find($deletedIssue->id)->sheets_sync_error);

        // Pass 2: deletedIssue self-heals
        $res2 = $fakeService->reconcilePendingIssues(10);
        $this->assertTrue($res2['success']);
        $this->assertEquals(1, $res2['synced']);
        $this->assertEquals(0, $res2['failed']);
        $this->assertEquals(0, $res2['remaining']);

        $healedDeleted = LeanIssue::withTrashed()->find($deletedIssue->id);
        $this->assertFalse((bool) $healedDeleted->needs_sheets_sync);
        $this->assertNull($healedDeleted->sheets_sync_error);
    }

    public function test_reconcile_clears_sheets_before_syncing_new_issues_when_pending_clear_exists(): void
    {
        LeanSheetDirectService::markPendingClear();

        $issue = LeanIssue::create([
            'location'           => 'TBR',
            'title'              => 'Post-reset issue',
            'description'        => 'Created after offline reset',
            'target_departments' => ['IT'],
            'reporter_name'      => 'Prima',
            'reporter_dept'      => 'IT',
            'status'             => 'open',
        ]);

        $events = [];
        $fakeService = new class($events) extends LeanSheetDirectService {
            public array $events;

            public function __construct(&$events)
            {
                parent::__construct();
                $this->events = &$events;
            }

            public function clearAllMonthlyData(): bool
            {
                $this->events[] = 'clear';
                Cache::forget('lean_sheets_pending_clear');
                return true;
            }

            public function syncSingleIssue(LeanIssue $issue): bool
            {
                $this->events[] = 'sync:' . $issue->id;
                $issue->markSheetsSynced();
                return true;
            }
        };

        $res = $fakeService->reconcilePendingIssues(10);
        $this->assertTrue($res['success']);
        $this->assertFalse(LeanSheetDirectService::hasPendingClear());
        $this->assertEquals(['clear', 'sync:' . $issue->id], $events);
    }

    public function test_auto_sync_endpoint_and_artisan_command(): void
    {
        $mock = $this->createMock(LeanSheetDirectService::class);
        $mock->expects($this->exactly(2))
            ->method('reconcilePendingIssues')
            ->willReturn([
                'success'   => true,
                'skipped'   => false,
                'synced'    => 2,
                'failed'    => 0,
                'remaining' => 0,
            ]);

        $this->app->instance(LeanSheetDirectService::class, $mock);

        $user = User::factory()->create([
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $response = $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/auto-sync');

        $response->assertStatus(200)
            ->assertJson([
                'success'   => true,
                'synced'    => 2,
                'failed'    => 0,
                'remaining' => 0,
            ]);

        $this->artisan('lean:reconcile-sheets')->assertExitCode(0);
    }

    public function test_lapangan_index_passes_needs_auto_reconcile_prop(): void
    {
        $mock = $this->createMock(LeanSheetDirectService::class);
        $mock->method('getMonthGids')->willReturn(['November' => 12345]);
        $this->app->instance(LeanSheetDirectService::class, $mock);

        $user = User::factory()->create([
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $issue = LeanIssue::create([
            'location'           => 'TBR',
            'title'              => 'Test prop',
            'description'        => 'Testing',
            'target_departments' => ['IT'],
            'reporter_name'      => 'Dedy',
            'reporter_dept'      => 'HR',
            'status'             => 'open',
        ]);

        // Unsynced issue -> needsAutoReconcile = true
        $resTrue = $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->get('/lapangan');
        $resTrue->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->where('needsAutoReconcile', true)
            );

        // Once synced -> needsAutoReconcile = false
        $issue->markSheetsSynced();
        $resFalse = $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->get('/lapangan');
        $resFalse->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->where('needsAutoReconcile', false)
            );
    }
}
