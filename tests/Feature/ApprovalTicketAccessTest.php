<?php

namespace Tests\Feature;

use App\Models\ApprovalTicket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ApprovalTicketAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_regular_user_can_view_own_account_registration_ticket(): void
    {
        $user = User::factory()->create([
            'role' => 'department',
            'department' => 'Facility',
            'is_active' => true,
            'approval_status' => 'approved',
        ]);

        $ticket = ApprovalTicket::create([
            'ticket_number' => 'REG-20261002-0001',
            'type' => 'account_registration',
            'user_id' => $user->id,
            'department' => 'Facility',
            'staff_name' => $user->name,
            'email' => $user->email,
            'status' => 'approved',
        ]);

        $response = $this->actingAs($user)->get(route('tickets.index'));

        $response->assertStatus(200);
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Tickets/Index')
            ->has('tickets.data', 1)
            ->where('tickets.data.0.id', $ticket->id)
            ->where('myTicketsCount', 1)
        );
    }

    public function test_regular_user_cannot_view_other_users_account_registration_ticket(): void
    {
        $userA = User::factory()->create([
            'role' => 'department',
            'department' => 'Facility',
            'is_active' => true,
            'approval_status' => 'approved',
        ]);

        $userB = User::factory()->create([
            'role' => 'department',
            'department' => 'Housekeeping',
            'is_active' => true,
            'approval_status' => 'approved',
        ]);

        $ticketB = ApprovalTicket::create([
            'ticket_number' => 'REG-20261002-0002',
            'type' => 'account_registration',
            'user_id' => $userB->id,
            'department' => 'Housekeeping',
            'staff_name' => $userB->name,
            'email' => $userB->email,
            'status' => 'approved',
        ]);

        // User A views tickets list
        $response = $this->actingAs($userA)->get(route('tickets.index'));
        $response->assertStatus(200);
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Tickets/Index')
            ->has('tickets.data', 0)
            ->where('myTicketsCount', 0)
        );

        // User A tries to view User B's ticket via ?id=
        $responseId = $this->actingAs($userA)->get(route('tickets.index', ['id' => $ticketB->id]));
        $responseId->assertStatus(200);
        $responseId->assertInertia(fn (Assert $page) => $page
            ->component('Tickets/Index')
            ->has('tickets.data', 0)
        );
    }

    public function test_ticket_id_filter_works_for_own_ticket(): void
    {
        $user = User::factory()->create([
            'role' => 'department',
            'department' => 'Facility',
            'is_active' => true,
            'approval_status' => 'approved',
        ]);

        $ticket1 = ApprovalTicket::create([
            'ticket_number' => 'REG-20261002-0001',
            'type' => 'account_registration',
            'user_id' => $user->id,
            'department' => 'Facility',
            'staff_name' => $user->name,
            'email' => $user->email,
            'status' => 'approved',
        ]);

        $ticket2 = ApprovalTicket::create([
            'ticket_number' => 'PWD-20261002-0002',
            'type' => 'password_reset',
            'user_id' => $user->id,
            'department' => 'Facility',
            'staff_name' => $user->name,
            'email' => $user->email,
            'status' => 'pending_hod',
        ]);

        $response = $this->actingAs($user)->get(route('tickets.index', ['id' => $ticket1->id]));

        $response->assertStatus(200);
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Tickets/Index')
            ->has('tickets.data', 1)
            ->where('tickets.data.0.id', $ticket1->id)
            ->where('filters.id', (string)$ticket1->id)
        );
    }

    public function test_rejected_users_are_excluded_from_user_crud_index(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'is_active' => true,
            'approval_status' => 'approved',
        ]);

        $approvedUser = User::factory()->create([
            'name' => 'Active Worker',
            'role' => 'department',
            'is_active' => true,
            'approval_status' => 'approved',
        ]);

        $rejectedUser = User::factory()->create([
            'name' => 'Rejected Applicant',
            'role' => 'department',
            'is_active' => false,
            'approval_status' => 'rejected',
        ]);

        $response = $this->actingAs($admin)->getJson('/users');
        $response->assertStatus(200);

        $userIds = collect($response->json('data'))->pluck('id');
        $this->assertTrue($userIds->contains($approvedUser->id));
        $this->assertFalse($userIds->contains($rejectedUser->id));

        // Stats should also exclude rejected user
        $this->assertEquals(2, $response->json('stats.total_users')); // admin + approvedUser
    }
}
