<?php

namespace Tests\Feature;

use App\Models\ApprovalTicket;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ApprovalTicketFeatureFlagTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('cache.default', 'array');
        Config::set('session.driver', 'array');
        Config::set('telunas.restrict_wifi', false);
        Config::set('telunas.approval_tickets_enabled', false);
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

    protected function makeDepartmentStaff(bool $isHod = false): User
    {
        return User::factory()->create([
            'name' => $isHod ? 'HOD Kitchen' : 'Staff Kitchen',
            'staff_name' => $isHod ? 'HOD Kitchen' : 'Staff Kitchen',
            'role' => 'department',
            'department' => 'Kitchen',
            'is_hod' => $isHod,
            'approval_status' => 'approved',
            'is_active' => true,
            'whatsapp_number' => $isHod ? '628111222333' : '628111222444',
        ]);
    }

    public function test_approval_tickets_feature_flag_defaults_to_false_across_authenticated_pages(): void
    {
        $admin = $this->makeAdmin();
        $staff = $this->makeDepartmentStaff();

        ApprovalTicket::create([
            'ticket_number' => 'NAM-20261112-0001',
            'type' => 'name_change',
            'user_id' => $staff->id,
            'department' => 'Kitchen',
            'staff_name' => $staff->name,
            'email' => $staff->email,
            'current_value' => $staff->name,
            'requested_value' => 'Updated Staff Name',
            'reason' => 'Old pending ticket',
            'status' => 'pending_hod',
        ]);

        $this->actingAs($admin)
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->where('features.approval_tickets', false)
            );

        $this->actingAs($admin)
            ->get(route('users.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Users')
                ->where('features.approval_tickets', false)
            );

        $this->actingAs($staff)
            ->get(route('profile.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Profile/Edit')
                ->where('features.approval_tickets', false)
                ->where('pendingTicket', null)
                ->where('pendingTransferTicket', null)
                ->where('pendingNameTicket', null)
            );
    }

    public function test_ticket_routes_and_staff_submissions_are_blocked_when_disabled(): void
    {
        $admin = $this->makeAdmin();
        $hod = $this->makeDepartmentStaff(true);
        $staff = $this->makeDepartmentStaff(false);

        $existingTicket = ApprovalTicket::create([
            'ticket_number' => 'TRN-20261112-0001',
            'type' => 'department_transfer',
            'user_id' => $staff->id,
            'department' => 'Kitchen',
            'staff_name' => $staff->name,
            'email' => $staff->email,
            'current_value' => 'Kitchen',
            'requested_value' => 'IT',
            'reason' => 'Rotation',
            'status' => 'pending_hod',
        ]);

        $this->actingAs($admin)
            ->get(route('tickets.index'))
            ->assertRedirect(route('dashboard'))
            ->assertSessionHas('status', __('telunas.approval_tickets_disabled'));

        $this->actingAs($staff)
            ->get('/approvals')
            ->assertRedirect('/tickets');

        $this->actingAs($admin)
            ->getJson(route('tickets.index'))
            ->assertStatus(403)
            ->assertJson(['success' => false]);

        $this->actingAs($admin)
            ->getJson(route('tickets.exportData'))
            ->assertStatus(403)
            ->assertJson(['success' => false]);

        $this->actingAs($admin)
            ->postJson(route('tickets.syncSheet'))
            ->assertStatus(403)
            ->assertJson(['success' => false]);

        $this->actingAs($hod)
            ->postJson(route('tickets.checkWhatsApp'), ['phone' => '081234567890'])
            ->assertStatus(403)
            ->assertJson(['success' => false]);

        $this->actingAs($staff)
            ->post(route('tickets.whatsapp'), ['whatsapp_number' => '08555111222'])
            ->assertStatus(403);

        $this->actingAs($staff)
            ->patch(route('profile.whatsapp'), ['whatsapp_number' => '08555111222'])
            ->assertStatus(403);

        $this->actingAs($staff)
            ->post(route('tickets.password'), ['reason' => 'Reset password'])
            ->assertStatus(403);

        $this->actingAs($staff)
            ->post(route('tickets.departmentTransfer'), [
                'target_department' => 'Engineering',
                'reason' => 'Transfer',
            ])
            ->assertStatus(403);

        $this->actingAs($staff)
            ->post(route('tickets.nameChange'), [
                'new_name' => 'New Staff Name',
                'reason' => 'Correction',
            ])
            ->assertStatus(403);

        $this->actingAs($hod)
            ->post(route('tickets.hodAction', $existingTicket->id), ['action' => 'approve'])
            ->assertStatus(403);

        $this->actingAs($admin)
            ->post(route('tickets.adminAction', $existingTicket->id), ['action' => 'approve'])
            ->assertStatus(403);

        $this->assertEquals(1, ApprovalTicket::count());
        $this->assertEquals('pending_hod', $existingTicket->fresh()->status);
        $this->assertEquals('628111222444', $staff->fresh()->whatsapp_number);
    }

    public function test_admin_and_hod_direct_whatsapp_and_bot_reset_remain_active_when_tickets_disabled(): void
    {
        $admin = $this->makeAdmin();
        $hod = $this->makeDepartmentStaff(true);
        $staff = $this->makeDepartmentStaff(false);

        $this->actingAs($admin)
            ->patch(route('profile.whatsapp'), ['whatsapp_number' => '08555666777'])
            ->assertRedirect(route('profile.edit'));
        $this->assertEquals('08555666777', $admin->fresh()->whatsapp_number);

        $this->actingAs($hod)
            ->patch(route('profile.whatsapp'), ['whatsapp_number' => '08555666888'])
            ->assertRedirect(route('profile.edit'));
        $this->assertEquals('08555666888', $hod->fresh()->whatsapp_number);

        $botKey = config('services.bot.api_key');
        $this->postJson('/api/reset-whatsapp-password', [
            'user_id' => $staff->id,
            'whatsapp_number' => '08111222444',
        ], [
            'X-Bot-Key' => $botKey,
        ])->assertOk()->assertJson(['success' => true]);
    }

    public function test_approval_tickets_can_be_re_enabled_via_config(): void
    {
        Config::set('telunas.approval_tickets_enabled', true);

        $admin = $this->makeAdmin();
        $staff = $this->makeDepartmentStaff(false);

        $this->actingAs($admin)
            ->get(route('tickets.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Tickets/Index')
                ->where('features.approval_tickets', true)
            );

        $this->actingAs($staff)
            ->post(route('tickets.nameChange'), [
                'new_name' => 'Staff Kitchen Updated',
                'reason' => 'Official HR spelling adjustment',
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('approval_tickets', [
            'user_id' => $staff->id,
            'type' => 'name_change',
            'requested_value' => 'Staff Kitchen Updated',
            'status' => 'pending_hod',
        ]);

        $this->actingAs($staff)
            ->get(route('profile.edit'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Profile/Edit')
                ->where('features.approval_tickets', true)
                ->where('pendingNameTicket.requested_value', 'Staff Kitchen Updated')
            );
    }
}
