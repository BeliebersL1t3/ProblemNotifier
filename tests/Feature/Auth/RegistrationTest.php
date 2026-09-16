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
    }
}
