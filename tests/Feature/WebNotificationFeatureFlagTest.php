<?php

namespace Tests\Feature;

use App\Models\DashboardNotification;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class WebNotificationFeatureFlagTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('cache.default', 'array');
        Config::set('session.driver', 'array');
        Config::set('telunas.restrict_wifi', false);
        Config::set('telunas.web_notifications_enabled', false);
        Cache::flush();

        $sheetMock = $this->createMock(LeanSheetDirectService::class);
        $sheetMock->method('getMonthGids')->willReturn(['November' => 11111]);
        $sheetMock->method('syncSingleIssue')->willReturn(true);
        $this->app->instance(LeanSheetDirectService::class, $sheetMock);

        $gasMock = $this->createMock(GoogleSheetsSyncService::class);
        $gasMock->method('syncIssue')->willReturn(true);
        $this->app->instance(GoogleSheetsSyncService::class, $gasMock);

        Http::fake([
            '*' => Http::response(['success' => true], 200),
        ]);
    }

    protected function makeAdmin(): User
    {
        return User::factory()->create([
            'name' => 'Admin Test',
            'staff_name' => 'Admin Test',
            'role' => 'admin',
            'department' => null,
            'approval_status' => 'approved',
            'is_active' => true,
            'whatsapp_number' => '628123456789',
        ]);
    }

    public function test_web_notifications_feature_flag_defaults_to_false_across_authenticated_pages(): void
    {
        $admin = $this->makeAdmin();

        $this->actingAs($admin)
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->where('features.web_notifications', false)
            );

        $this->actingAs($admin)
            ->get(route('tickets.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Tickets/Index')
                ->where('features.web_notifications', false)
            );

        $this->actingAs($admin)
            ->get(route('users.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Users')
                ->where('features.web_notifications', false)
            );

        $this->actingAs($admin)
            ->get(route('profile.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Profile/Edit')
                ->where('features.web_notifications', false)
            );
    }

    public function test_web_notifications_feature_flag_can_be_re_enabled_via_config(): void
    {
        $admin = $this->makeAdmin();
        Config::set('telunas.web_notifications_enabled', true);

        $this->actingAs($admin)
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->where('features.web_notifications', true)
            );

        $this->actingAs($admin)
            ->get(route('profile.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Profile/Edit')
                ->where('features.web_notifications', true)
            );
    }

    public function test_backend_notification_endpoints_and_whatsapp_preferences_remain_ready_while_web_ui_is_disabled(): void
    {
        $admin = $this->makeAdmin();

        DashboardNotification::create([
            'user_id' => $admin->id,
            'type' => 'issue_progress',
            'title' => 'Isu Baru',
            'message' => 'Siap digunakan saat notifikasi web diaktifkan ulang.',
            'is_read' => false,
        ]);

        // Backend notification feed remains intact for future re-activation
        $this->actingAs($admin)
            ->getJson(route('notifications.index'))
            ->assertOk()
            ->assertJsonPath('unread_count', 1);

        // WhatsApp notification preference toggle remains fully operational
        $this->actingAs($admin)
            ->patch(route('profile.notificationPreferences'), [
                'notify_whatsapp_tickets' => false,
            ])
            ->assertRedirect();

        $this->assertFalse((bool) $admin->fresh()->notify_whatsapp_tickets);
    }
}
