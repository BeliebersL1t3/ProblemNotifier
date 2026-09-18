<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WhatsAppStaffApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_directory_requires_bot_api_key(): void
    {
        $response = $this->getJson('/api/staff-directory');
        $response->assertStatus(401);
    }

    public function test_staff_directory_returns_users_with_whatsapp(): void
    {
        $botKey = config('services.bot.api_key');

        // User with WhatsApp
        User::factory()->create([
            'name'            => 'Budi Engineer',
            'staff_name'      => 'Budi',
            'department'      => 'Engineer',
            'subdivision'     => 'Maintenance',
            'role'            => 'department',
            'whatsapp_number' => '628123456789',
        ]);

        // User without WhatsApp
        User::factory()->create([
            'name'            => 'No Phone User',
            'whatsapp_number' => null,
        ]);

        $response = $this->getJson('/api/staff-directory', [
            'X-Bot-Key' => $botKey,
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ])
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.whatsapp_number', '628123456789')
            ->assertJsonPath('data.0.staff_name', 'Budi');
    }

    public function test_deprecated_link_whatsapp_staff_route_is_not_found(): void
    {
        $response = $this->postJson('/api/link-whatsapp-staff', [
            'staff_name' => 'Budi',
            'department' => 'Engineer',
            'whatsapp_number' => '081234567890',
        ]);

        $response->assertStatus(404);
    }

    public function test_reset_whatsapp_password_returns_password(): void
    {
        $botKey = config('services.bot.api_key');

        $user = User::factory()->create([
            'name'            => 'Agus HK',
            'staff_name'      => 'Agus',
            'department'      => 'Housekeeping',
            'whatsapp_number' => '628999999999',
            'raw_password'    => 'mysecret123',
        ]);

        $response = $this->postJson('/api/reset-whatsapp-password', [
            'whatsapp_number' => '08999999999',
        ], [
            'X-Bot-Key' => $botKey,
        ]);

        $response->assertOk()
            ->assertJson([
                'success'    => true,
                'department' => 'Housekeeping',
                'password'   => 'mysecret123',
            ]);
    }

    public function test_reset_whatsapp_password_returns_404_if_not_found(): void
    {
        $botKey = config('services.bot.api_key');

        $response = $this->postJson('/api/reset-whatsapp-password', [
            'whatsapp_number' => '08000000000',
        ], [
            'X-Bot-Key' => $botKey,
        ]);

        $response->assertStatus(404)
            ->assertJson([
                'success' => false,
            ]);
    }

    public function test_admin_can_update_whatsapp_number_immediately(): void
    {
        Http::fake();

        $admin = User::factory()->create([
            'role'            => 'admin',
            'whatsapp_number' => null,
        ]);

        $response = $this->actingAs($admin)
            ->patch('/profile/whatsapp', [
                'whatsapp_number' => '08555666777',
            ]);

        $response->assertRedirect('/profile');
        $this->assertEquals('628555666777', $admin->fresh()->whatsapp_number);
    }

    public function test_regular_user_updating_whatsapp_creates_approval_ticket(): void
    {
        Http::fake();

        $user = User::factory()->create([
            'role'            => 'department',
            'department'      => 'Kitchen',
            'whatsapp_number' => '628111111111',
        ]);

        $response = $this->actingAs($user)
            ->patch('/profile/whatsapp', [
                'whatsapp_number' => '08555666777',
            ]);

        $response->assertRedirect('/profile');
        $this->assertEquals('628111111111', $user->fresh()->whatsapp_number);
        $this->assertDatabaseHas('approval_tickets', [
            'type'            => 'whatsapp_change',
            'user_id'         => $user->id,
            'current_value'   => '628111111111',
            'requested_value' => '628555666777',
            'status'          => 'pending_hod',
        ]);
    }
}
