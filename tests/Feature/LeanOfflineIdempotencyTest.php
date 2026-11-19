<?php

namespace Tests\Feature;

use App\Models\LeanIssue;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LeanOfflineIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

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

    protected function makeUser(string $role = 'department', ?string $department = 'Engineer', string $name = 'Phillip'): User
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

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_offline_sync_with_client_uuid_is_idempotent(): void
    {
        $user = $this->makeUser();
        $uuid = 'test-client-uuid-12345';
        $payload = [
            'client_uuid'        => $uuid,
            'title'              => 'Kericuhan Pendingin Mesin',
            'location'           => 'TBR - Ngk icing',
            'reporter_name'      => 'Phillip',
            'reporter_dept'      => 'Engineer',
            'target_departments' => ['Engineer'],
            'start_in_progress'  => '1',
        ];

        // 1st request (simulating initial send from outbox)
        $resp1 = $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', $payload);

        $resp1->assertOk()
            ->assertJson([
                'success' => true,
            ]);

        $this->assertDatabaseCount('lean_issues', 1);
        $firstIssueId = $resp1->json('issue.id');
        $this->assertNotNull($firstIssueId);

        $createdIssue = LeanIssue::find($firstIssueId);
        $this->assertEquals($uuid, $createdIssue->client_uuid);

        // 2nd request with exact same client_uuid (simulating retry after fake timeout)
        $resp2 = $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', $payload);

        $resp2->assertOk()
            ->assertJson([
                'success'      => true,
                'deduplicated' => true,
            ]);

        // Still exactly 1 issue in database!
        $this->assertDatabaseCount('lean_issues', 1);
        $this->assertEquals($firstIssueId, $resp2->json('issue.id'));
    }

    public function test_failsafe_deduplication_catches_duplicate_within_3_minutes(): void
    {
        $user = $this->makeUser();
        $payload = [
            'title'              => 'Lampu Mati di Villa 10',
            'location'           => 'Villa 10',
            'reporter_name'      => 'Budi Leader',
            'reporter_dept'      => 'Housekeeping',
            'target_departments' => ['Engineer'],
            'start_in_progress'  => '1',
        ];

        // 1st request (no client_uuid)
        $resp1 = $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', $payload);

        $resp1->assertOk()->assertJson(['success' => true]);
        $this->assertDatabaseCount('lean_issues', 1);
        $originalId = $resp1->json('issue.id');

        // 2nd request immediately (e.g. double-click submit)
        $resp2 = $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson('/lapangan/issues', $payload);

        $resp2->assertOk()
            ->assertJson([
                'success'      => true,
                'deduplicated' => true,
            ]);

        $this->assertDatabaseCount('lean_issues', 1);
        $this->assertEquals($originalId, $resp2->json('issue.id'));
    }

    public function test_api_store_with_client_uuid_is_idempotent(): void
    {
        $uuid = 'bot-client-uuid-999';
        $payload = [
            'client_uuid' => $uuid,
            'title'       => 'Pipa Bocor Koridor',
            'location'    => 'Koridor Utama',
            'department'  => 'Engineer',
            'reporter'    => 'Rudi',
            'source'      => 'whatsapp_bot',
        ];

        $headers = ['X-Bot-Key' => 'test-bot-secret'];
        $resp1 = $this->postJson('/api/lean/issues', $payload, $headers);
        $resp1->assertOk()->assertJson(['success' => true]);

        $this->assertDatabaseCount('lean_issues', 1);
        $rawId = $resp1->json('data.raw_id');

        // Retry with same client_uuid
        $resp2 = $this->postJson('/api/lean/issues', $payload, $headers);
        $resp2->assertOk()
            ->assertJson([
                'success'      => true,
                'deduplicated' => true,
            ]);

        $this->assertDatabaseCount('lean_issues', 1);
        $this->assertEquals($rawId, $resp2->json('data.raw_id'));
    }
}
