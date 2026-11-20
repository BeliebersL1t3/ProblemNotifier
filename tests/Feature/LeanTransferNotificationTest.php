<?php

namespace Tests\Feature;

use App\Models\LeanIssue;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use App\Services\TicketNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LeanTransferNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('cache.default', 'array');
        Config::set('session.driver', 'array');
        Config::set('services.bot.api_key', 'test-bot-secret');
        Config::set('services.bot.port', 3000);

        $sheetMock = $this->createMock(LeanSheetDirectService::class);
        $sheetMock->method('syncIssueTransfer')->willReturn(true);
        $sheetMock->method('syncSingleIssue')->willReturn(true);
        $this->app->instance(LeanSheetDirectService::class, $sheetMock);

        $gasMock = $this->createMock(GoogleSheetsSyncService::class);
        $gasMock->method('syncIssue')->willReturn(true);
        $this->app->instance(GoogleSheetsSyncService::class, $gasMock);
    }

    public function test_tailscale_app_url_helper_resolves_correctly(): void
    {
        $url = TicketNotificationService::getTailscaleAppUrl('/lapangan?focus=ENG-123456-1');
        $this->assertEquals('https://msi.taile8cc1e.ts.net/lapangan?focus=ENG-123456-1', $url);
    }

    public function test_transfer_notifies_main_group_destination_group_source_group_and_reporter(): void
    {
        Http::fake([
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
            '*'                       => Http::response(['success' => true], 200),
        ]);

        $user = User::factory()->create([
            'name'            => 'Budi Spv',
            'role'            => 'department',
            'department'      => 'Engineer',
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);

        $issue = LeanIssue::create([
            'title'              => 'Keran bocor parah',
            'location'           => 'TBR - Villa 05',
            'reporter_name'      => 'Siti Pelapor',
            'reporter_phone'     => '081299998888',
            'target_departments' => ['Engineer'],
            'status'             => 'open',
            'image_url'          => '/uploads/lean/keran_bocor.jpg',
            'description'        => 'Air merembes di bawah wastafel',
        ]);

        $response = $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->postJson("/lapangan/issues/{$issue->id}/transfer", [
                'to_department' => 'Housekeeping',
                'reason'        => 'Bukan kerusakan pipa, perlu pembersihan menyeluruh',
            ]);

        $response->assertStatus(200);

        // 1. Verify reporter received DM with Tailscale link
        Http::assertSent(function (Request $request) {
            if ($request->url() === 'http://localhost:3000/notify-direct') {
                $body = $request->data();
                return str_contains($body['phone'] ?? '', '81299998888')
                    && str_contains($body['message'] ?? '', 'Pengalihan Departemen Penangan')
                    && str_contains($body['message'] ?? '', 'https://msi.taile8cc1e.ts.net/lapangan?focus=');
            }
            return false;
        });

        // 2. Verify Old Department Group received release notice with Tailscale link
        Http::assertSent(function (Request $request) {
            if ($request->url() === 'http://localhost:3000/notify') {
                $body = $request->data();
                $depts = $body['departments'] ?? [];
                return in_array('Engineer', $depts)
                    && str_contains($body['message'] ?? '', 'TIKET DIALIHKAN KE DEPARTEMEN LAIN')
                    && str_contains($body['message'] ?? '', 'https://msi.taile8cc1e.ts.net/lapangan?focus=');
            }
            return false;
        });

        // 3. Verify Destination Department Group received incoming notice with photo & Tailscale link
        Http::assertSent(function (Request $request) {
            if ($request->url() === 'http://localhost:3000/notify') {
                $body = $request->data();
                $depts = $body['departments'] ?? [];
                return in_array('HK', $depts)
                    && str_contains($body['message'] ?? '', 'TIKET MASUK (DIALIHKAN DARI Engineer)')
                    && ($body['imageUrl'] ?? '') === '/uploads/lean/keran_bocor.jpg'
                    && str_contains($body['message'] ?? '', 'https://msi.taile8cc1e.ts.net/lapangan?focus=');
            }
            return false;
        });

        // 4. Verify Main / General Group received operational update with photo & Tailscale link
        Http::assertSent(function (Request $request) {
            if ($request->url() === 'http://localhost:3000/notify') {
                $body = $request->data();
                return !empty($body['generalOnly'])
                    && str_contains($body['message'] ?? '', 'PENGALIHAN TIKET (UPDATE OPERASIONAL)')
                    && ($body['imageUrl'] ?? '') === '/uploads/lean/keran_bocor.jpg'
                    && str_contains($body['message'] ?? '', 'https://msi.taile8cc1e.ts.net/lapangan?focus=');
            }
            return false;
        });
    }
}
