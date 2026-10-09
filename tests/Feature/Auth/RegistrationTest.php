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

    public function test_rejected_user_can_re_register_seamlessly(): void
    {
        $rejectedUser = \App\Models\User::factory()->create([
            'name' => 'Old Name',
            'email' => 'rejected@example.com',
            'whatsapp_number' => '081299990001',
            'department' => 'Kitchen',
            'role' => 'department',
            'approval_status' => 'rejected',
            'is_active' => false,
            'rejection_reason' => 'Data tidak lengkap',
        ]);

        // Phone check should report available: true
        $resPhone = $this->postJson('/register/check-phone', ['phone' => '081299990001']);
        $resPhone->assertStatus(200);
        $this->assertTrue($resPhone->json('available'));

        // Post re-registration with same email and phone
        $response = $this->post('/register', [
            'name' => 'Updated Name',
            'email' => 'rejected@example.com',
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
            'department' => 'Front Office',
            'subdivision' => 'Reception',
            'whatsapp_number' => '081299990001',
        ]);

        $response->assertRedirect(route('login'));

        $rejectedUser->refresh();
        $this->assertEquals('Updated Name', $rejectedUser->name);
        $this->assertEquals('Front Office', $rejectedUser->department);
        $this->assertEquals('pending_hod', $rejectedUser->approval_status);
        $this->assertFalse($rejectedUser->is_active);
        $this->assertNull($rejectedUser->rejection_reason);

        // Check new approval ticket created
        $this->assertDatabaseHas('approval_tickets', [
            'user_id' => $rejectedUser->id,
            'type' => 'account_registration',
            'department' => 'Front Office',
            'status' => 'pending_hod',
        ]);

        // Check audit log recorded
        $this->assertDatabaseHas('user_audit_logs', [
            'target_user_id' => $rejectedUser->id,
            'action' => 'USER_RE_REGISTERED',
        ]);
    }

    public function test_pending_user_blocks_re_registration_with_clear_message(): void
    {
        \App\Models\User::factory()->create([
            'email' => 'pending_hod@example.com',
            'whatsapp_number' => '081299990002',
            'approval_status' => 'pending_hod',
            'is_active' => false,
        ]);

        // Phone check should be unavailable and mention pending HOD
        $resPhone = $this->postJson('/register/check-phone', ['phone' => '081299990002']);
        $resPhone->assertStatus(200);
        $this->assertFalse($resPhone->json('available'));
        $this->assertStringContainsString('HOD', $resPhone->json('message'));

        // Registration form submission should fail with error
        $response = $this->post('/register', [
            'name' => 'Someone',
            'email' => 'pending_hod@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'department' => 'Kitchen',
            'whatsapp_number' => '081299990002',
        ]);

        $response->assertSessionHasErrors(['email', 'whatsapp_number']);
    }
}
