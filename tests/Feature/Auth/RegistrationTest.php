<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_screen_can_be_rendered(): void
    {
        $response = $this->get('/register');

        $response->assertStatus(200);
    }

    public function test_new_users_can_register(): void
    {
        $response = $this->post('/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
            'department' => 'Kitchen',
            'whatsapp_number' => '6281234567890',
        ]);

        $this->assertGuest();
        $response->assertRedirect(route('login'));
        $this->assertDatabaseHas('users', [
            'email' => 'test@example.com',
            'department' => 'Kitchen',
            'approval_status' => 'pending_hod',
            'is_active' => false,
        ]);
        $this->assertDatabaseHas('approval_tickets', [
            'type' => 'account_registration',
            'email' => 'test@example.com',
            'status' => 'pending_hod',
        ]);

        $registeredUser = \App\Models\User::where('email', 'test@example.com')->first();
        $this->assertFalse($registeredUser->hasPermission('can_view_all_departments'));
    }

    public function test_registration_rejects_invalid_phone_formats(): void
    {
        $invalidNumbers = ['1234678', '0211234567', '081234', '08012345678'];

        foreach ($invalidNumbers as $badNumber) {
            $response = $this->post('/register', [
                'name' => 'Bad Number User',
                'email' => 'bad' . rand(100, 999) . '@example.com',
                'password' => 'password',
                'password_confirmation' => 'password',
                'department' => 'Kitchen',
                'whatsapp_number' => $badNumber,
            ]);

            $response->assertSessionHasErrors('whatsapp_number');
        }
    }

    public function test_check_phone_api_validates_indonesian_mobile_format(): void
    {
        // Invalid number like 1234678
        $resInvalid = $this->postJson('/register/check-phone', ['phone' => '1234678']);
        $resInvalid->assertStatus(200);
        $resInvalid->assertJson([
            'valid' => false,
            'available' => false,
        ]);

        // Valid Indonesian mobile number
        $resValid = $this->postJson('/register/check-phone', ['phone' => '081234567890']);
        $resValid->assertStatus(200);
        $this->assertTrue($resValid->json('valid'));
        $this->assertTrue($resValid->json('available'));
    }
}
