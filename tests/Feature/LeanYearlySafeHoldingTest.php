<?php

namespace Tests\Feature;

use App\Models\LeanIssue;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LeanYearlySafeHoldingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('cache.default', 'array');
        Config::set('session.driver', 'array');

        $gasMock = $this->createMock(GoogleSheetsSyncService::class);
        $this->app->instance(GoogleSheetsSyncService::class, $gasMock);

        Http::fake(['*' => Http::response(['success' => true], 200)]);
    }

    public function test_unconnected_future_year_returns_null_and_holds_sync(): void
    {
        $service = app(LeanSheetDirectService::class);

        // 2026 is connected default
        $this->assertNotNull($service->getSpreadsheetIdForYear(2026));

        // 2029 is not connected, must return null (Opsi 1: Safe Holding)
        $this->assertNull($service->getSpreadsheetIdForYear(2029));

        // Create an issue explicitly in 2029 using withoutTimestamps
        $targetDate = Carbon::parse('2029-03-15 10:00:00');
        $issue2029 = new LeanIssue([
            'title'              => 'Future issue 2029',
            'location'           => 'Villa 10',
            'reporter_name'      => 'Ahmad',
            'target_departments' => ['Engineer'],
            'needs_sheets_sync'  => true,
        ]);
        $issue2029->timestamps = false;
        $issue2029->created_at = $targetDate;
        $issue2029->updated_at = $targetDate;
        $issue2029->save();

        $this->assertEquals(2029, (int) $issue2029->created_at->format('Y'));

        $synced = $service->syncSingleIssue($issue2029);

        // Sync must fail safely without exceptions (Safe Holding)
        $this->assertFalse($synced);

        $issue2029->refresh();
        $this->assertTrue($issue2029->needs_sheets_sync);
        $this->assertStringContainsString('2029 belum terhubung', (string) $issue2029->sheets_sync_error);

        // Unconnected year helper must report 2029 with 1 ticket
        $unconnected = $service->getUnconnectedYearsWithPendingIssues();
        $this->assertArrayHasKey('2029', $unconnected);
        $this->assertEquals(1, $unconnected['2029']);
    }
}
