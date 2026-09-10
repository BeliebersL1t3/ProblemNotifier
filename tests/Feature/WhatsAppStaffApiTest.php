<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WhatsAppStaffApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_directory_returns_users_with_whatsapp(): void
    {
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

        $response = $this->getJson('/api/staff-directory');

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ])
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.whatsapp_number', '628123456789')
            ->assertJsonPath('data.0.staff_name', 'Budi');
    }

    public function test_link_whatsapp_staff_requires_phone(): void
    {
        $response = $this->postJson('/api/link-whatsapp-staff', [
            'staff_name' => 'Budi',
            'department' => 'Engineer',
        ]);

        $response->assertStatus(400)
            ->assertJson([
                'success' => false,
                'message' => 'Phone required',
            ]);
    }

    public function test_link_whatsapp_staff_successfully_links_user(): void
    {
        $user = User::factory()->create([
            'name'            => 'Budi Santoso',
            'staff_name'      => 'Budi',
            'department'      => 'Engineer',
            'whatsapp_number' => null,
        ]);

        $response = $this->postJson('/api/link-whatsapp-staff', [
            'staff_name'      => 'Budi',
            'department'      => 'Engineer',
            'whatsapp_number' => '081234567890',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'user'    => [
                    'id'              => $user->id,
                    'whatsapp_number' => '6281234567890',
                ],
            ]);

        $this->assertEquals('6281234567890', $user->fresh()->whatsapp_number);
    }

    public function test_link_whatsapp_staff_rejects_overwrite_of_different_phone(): void
    {
        $user = User::factory()->create([
            'name'            => 'Budi Santoso',
            'staff_name'      => 'Budi',
            'department'      => 'Engineer',
            'whatsapp_number' => '628111111111',
        ]);

        $response = $this->postJson('/api/link-whatsapp-staff', [
            'staff_name'      => 'Budi',
            'department'      => 'Engineer',
            'whatsapp_number' => '082222222222',
        ]);

        $response->assertStatus(403)
            ->assertJson([
                'success' => false,
            ]);

        $this->assertEquals('628111111111', $user->fresh()->whatsapp_number);
    }

    public function test_reset_whatsapp_password_returns_password(): void
    {
        $user = User::factory()->create([
            'name'            => 'Agus HK',
            'staff_name'      => 'Agus',
            'department'      => 'Housekeeping',
            'whatsapp_number' => '628999999999',
            'raw_password'    => 'mysecret123',
        ]);

        $response = $this->postJson('/api/reset-whatsapp-password', [
            'whatsapp_number' => '08999999999',
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
        $response = $this->postJson('/api/reset-whatsapp-password', [
            'whatsapp_number' => '08000000000',
        ]);

        $response->assertStatus(404)
            ->assertJson([
                'success' => false,
            ]);
    }

    public function test_user_can_update_whatsapp_number_via_profile(): void
    {
        Http::fake();

        $user = User::factory()->create([
            'whatsapp_number' => null,
        ]);

        $response = $this->actingAs($user)
            ->patch('/profile/whatsapp', [
                'whatsapp_number' => '08555666777',
            ]);

        $response->assertRedirect('/profile');
        $this->assertEquals('628555666777', $user->fresh()->whatsapp_number);
    }
}
