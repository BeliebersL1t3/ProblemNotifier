<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\GoogleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Mockery;
use Tests\TestCase;

class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_reset_whatsapp_password_requires_phone_number(): void
    {
        $botKey = config('services.bot.api_key');
        $user = User::factory()->create([
            'whatsapp_number' => '628123456789',
            'is_active'       => true,
            'raw_password'    => 'mySecretPass123',
        ]);

        // Postman attack simulation: only providing user_id without phone
        $response = $this->postJson('/api/reset-whatsapp-password', [
            'user_id' => $user->id,
        ], [
            'X-Bot-Key' => $botKey,
        ]);

        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
            ]);
    }

    public function test_reset_whatsapp_password_rejects_mismatched_user_id(): void
    {
        $botKey = config('services.bot.api_key');
        $victim = User::factory()->create([
            'whatsapp_number' => '628111111111',
            'is_active'       => true,
            'raw_password'    => 'victimSecret',
        ]);
        $attacker = User::factory()->create([
            'whatsapp_number' => '628999999999',
            'is_active'       => true,
            'raw_password'    => 'attackerSecret',
        ]);

        // Postman attacker tries to fetch victim's password using attacker's phone with victim's user_id
        $response = $this->postJson('/api/reset-whatsapp-password', [
            'user_id'         => $victim->id,
            'whatsapp_number' => '628999999999',
        ], [
            'X-Bot-Key' => $botKey,
        ]);

        $response->assertStatus(403)
            ->assertJson([
                'success' => false,
            ]);
    }

    public function test_reset_whatsapp_password_succeeds_when_verified(): void
    {
        $botKey = config('services.bot.api_key');
        $user = User::factory()->create([
            'whatsapp_number' => '628123456789',
            'is_active'       => true,
        ]);

        $response = $this->postJson('/api/reset-whatsapp-password', [
            'user_id'         => $user->id,
            'whatsapp_number' => '08123456789',
        ], [
            'X-Bot-Key' => $botKey,
        ]);

        $response->assertOk()
            ->assertJson([
                'success'      => true,
                'is_temporary' => true,
            ]);

        $tempPassword = $response->json('password');
        $this->assertNotEmpty($tempPassword);
        $this->assertStringStartsWith('Telunas-', $tempPassword);

        $user->refresh();
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check($tempPassword, $user->password));
    }

    public function test_viewer_cannot_store_issues(): void
    {
        $viewer = User::factory()->create([
            'role'        => 'viewer',
            'permissions' => [
                'can_manage_issues' => false,
            ],
        ]);

        $response = $this->actingAs($viewer)->postJson('/api/issues', [
            'title'       => 'Unauthorized Issue',
            'description' => 'Test Desc',
            'location'    => 'Villa 1',
            'category'    => 'Maintenance',
            'department'  => 'Housekeeping',
            'reporter'    => 'Viewer User',
        ]);

        $response->assertStatus(403)
            ->assertJson([
                'success' => false,
            ]);
    }

    public function test_user_without_export_permission_cannot_send_pdf_report(): void
    {
        $user = User::factory()->create([
            'role'        => 'department',
            'permissions' => [
                'can_export_reports' => false,
            ],
        ]);

        $file = UploadedFile::fake()->create('report.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)->postJson('/api/export/email-pdf', [
            'pdf_file'   => $file,
            'subject'    => 'Test Subject',
            'recipients' => 'target@example.com',
        ]);

        $response->assertStatus(403)
            ->assertJson([
                'success' => false,
            ]);
    }

    public function test_user_without_calendar_permission_cannot_modify_operations(): void
    {
        $user = User::factory()->create([
            'role'        => 'department',
            'permissions' => [
                'can_access_calendar' => false,
            ],
        ]);

        $response = $this->actingAs($user)->postJson('/api/operations', [
            'dept'  => 'Engineer',
            'title' => 'Unauthorized Task',
        ]);

        $response->assertStatus(403)
            ->assertJson([
                'success' => false,
            ]);
    }

    public function test_security_headers_are_present_on_web_requests(): void
    {
        $response = $this->get('/login');

        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }

    public function test_avatar_upload_uses_safe_server_extension(): void
    {
        $user = User::factory()->create([
            'role'      => 'department',
            'is_active' => true,
        ]);

        $image = UploadedFile::fake()->image('test_photo.PNG', 200, 200);

        $response = $this->actingAs($user)->post('/profile/avatar', [
            'avatar' => $image,
        ], [
            'Accept' => 'application/json',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ]);

        $updatedUser = $user->fresh();
        $this->assertNotEmpty($updatedUser->avatar);
        // Extension should be lowercased safe extension (png)
        $this->assertStringEndsWith('.png', $updatedUser->avatar);

        // Clean up uploaded test avatar
        $avatarPath = public_path('uploads/avatars/' . $updatedUser->avatar);
        if (file_exists($avatarPath)) {
            @unlink($avatarPath);
        }
    }

    public function test_export_pdf_rejects_non_pdf_files(): void
    {
        $user = User::factory()->create([
            'role'        => 'admin',
            'is_active'   => true,
            'permissions' => ['can_export_reports' => true],
        ]);

        $fakeExe = UploadedFile::fake()->create('malicious.exe', 500, 'application/x-msdownload');

        $response = $this->actingAs($user)->postJson('/api/export/email-pdf', [
            'pdf_file'   => $fakeExe,
            'subject'    => 'Malicious file attempt',
            'recipients' => 'admin@example.com',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['pdf_file']);
    }

    public function test_google_oauth_sanitizes_external_open_redirect(): void
    {
        $user = User::factory()->create([
            'email' => 'admin@telunas.test',
        ]);

        $response = $this->actingAs($user)->get('/auth/google/redirect?return_to=https://attacker-controlled.site/evil');

        // Target stored in session should be sanitized to dashboard instead of external domain
        $sessionTarget = session('google_oauth_return_to');
        $this->assertNotEquals('https://attacker-controlled.site/evil', $sessionTarget);
        $this->assertEquals(route('dashboard'), $sessionTarget);
    }

    public function test_profile_update_cannot_bypass_whatsapp_ticket(): void
    {
        $user = User::factory()->create([
            'role'            => 'department',
            'is_active'       => true,
            'whatsapp_number' => '628111111111',
        ]);

        $response = $this->actingAs($user)->patch('/profile', [
            'name'            => 'Updated Name',
            'email'           => $user->email,
            'whatsapp_number' => '628999999999', // Attacker attempts to change WhatsApp directly
        ]);

        $user->refresh();
        $this->assertEquals('Updated Name', $user->name);
        // WhatsApp number MUST remain unchanged (requires ApprovalTicket)
        $this->assertEquals('628111111111', $user->whatsapp_number);
    }

    public function test_phone_check_does_not_leak_user_identity(): void
    {
        $user = User::factory()->create([
            'name'            => 'Secret Confidential Employee',
            'department'      => 'Finance Secret Dept',
            'whatsapp_number' => '628555555555',
        ]);

        $response = $this->postJson('/register/check-phone', [
            'phone' => '08555555555',
        ]);

        $response->assertOk()
            ->assertJson([
                'available' => false,
            ]);

        $message = $response->json('message');
        // Must NOT leak employee name or department
        $this->assertStringNotContainsString('Secret Confidential Employee', $message);
        $this->assertStringNotContainsString('Finance Secret Dept', $message);
        $this->assertStringContainsString('Nomor WhatsApp ini sudah terdaftar di sistem', $message);
    }

    public function test_csrf_blocks_session_request_without_token_and_allows_bot_key(): void
    {
        $user = User::factory()->create([
            'role'      => 'admin',
            'is_active' => true,
        ]);

        // 1. With CSRF middleware active, a session request without CSRF token must receive 419
        $response = $this->withMiddleware([\App\Http\Middleware\VerifyCsrfToken::class])
            ->actingAs($user)
            ->post('/api/issues', [
                'title' => 'CSRF Test Issue',
            ]);

        $response->assertStatus(419);

        // 2. A bot request with valid X-Bot-Key bypasses CSRF even with middleware active
        $botKey = config('services.bot.api_key');
        $botResponse = $this->withMiddleware([\App\Http\Middleware\VerifyCsrfToken::class])
            ->postJson('/api/issues', [
                'title' => 'Bot Test Issue',
            ], [
                'X-Bot-Key' => $botKey,
            ]);

        // Validation fails with 422 (because form fields are missing), proving CSRF was bypassed
        $this->assertNotEquals(419, $botResponse->status());
        $botResponse->assertStatus(422);
    }
}

