<?php

namespace Tests\Feature;

use App\Models\LeanIssue;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
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
        Config::set('telunas.registration_enabled', true);

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
            ->post('/lapangan/issues', [
                'title' => 'CSRF Test Issue',
            ]);

        $response->assertStatus(419);

        // 2. A bot request with valid X-Bot-Key bypasses CSRF even with middleware active
        $botKey = config('services.bot.api_key');
        $botResponse = $this->withMiddleware([\App\Http\Middleware\VerifyCsrfToken::class])
            ->postJson('/api/lean/issues', [
                'title' => 'Bot Test Issue',
            ], [
                'X-Bot-Key' => $botKey,
            ]);

        // Validation fails with 422 (because required form fields are missing), proving CSRF was bypassed
        $this->assertNotEquals(419, $botResponse->status());
        $botResponse->assertStatus(422);
    }

    public function test_viewer_role_is_rejected_by_validation(): void
    {
        $admin = User::factory()->create([
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $response = $this->actingAs($admin)->postJson('/api/users', [
            'name'            => 'Viewer Test',
            'email'           => 'viewertest@telunas.com',
            'password'        => 'password123',
            'role'            => 'viewer',
            'whatsapp_number' => '081234567890',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['role']);
    }

    public function test_admin_cannot_self_demote(): void
    {
        $admin = User::factory()->create([
            'role'      => 'admin',
            'is_active' => true,
        ]);

        $response = $this->actingAs($admin)->putJson("/api/users/{$admin->id}", [
            'name'            => $admin->name,
            'email'           => $admin->email,
            'role'            => 'department',
            'department'      => 'IT',
            'whatsapp_number' => '081234567890',
        ]);

        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
                'message' => 'Anda tidak dapat menurunkan peran (demote) akun Admin Anda sendiri.',
            ]);
    }

    public function test_cannot_demote_or_delete_last_active_admin(): void
    {
        // Keep exactly one active admin
        User::where('role', 'admin')->update(['is_active' => false]);
        $soleAdmin = User::factory()->create([
            'role'      => 'admin',
            'is_active' => true,
        ]);

        // Attempt to soft-delete the sole admin (acting as a secondary admin for the call)
        $secondaryAdmin = User::factory()->create([
            'role'      => 'admin',
            'is_active' => true,
        ]);

        // Now delete secondaryAdmin so soleAdmin is the only one left
        $secondaryAdmin->delete();

        // Acting as another user to test deleting soleAdmin
        $actingAdmin = User::factory()->create([
            'role'      => 'admin',
            'is_active' => true,
        ]);

        // If we delete soleAdmin when actingAdmin is active, it passes, but if soleAdmin is the ONLY one:
        $actingAdmin->is_active = false;
        $actingAdmin->save();

        $response = $this->actingAs($actingAdmin)->deleteJson("/api/users/{$soleAdmin->id}");
        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
                'message' => 'Tidak dapat menghapus atau meng-archive akun Administrator aktif terakhir di sistem.',
            ]);
    }

    public function test_department_user_with_null_permissions_inherits_default_department_scoping(): void
    {
        $deptUser = User::factory()->create([
            'role'        => 'department',
            'department'  => 'Kitchen',
            'permissions' => null,
            'is_active'   => true,
        ]);

        $this->assertFalse($deptUser->canViewDepartment('Housekeeping'));
        $this->assertFalse($deptUser->canViewDepartment('IT'));
        $this->assertTrue($deptUser->canViewDepartment('Kitchen'));
    }

    public function test_guests_are_blocked_from_root_and_lapangan_routes(): void
    {
        $issue = LeanIssue::create([
            'location'           => 'TBR Villa 5',
            'title'              => 'AC Rusak',
            'description'        => 'Perlu cek',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Budi',
            'reporter_dept'      => 'HK',
            'status'             => 'open',
        ]);

        $this->get('/')->assertRedirect('/login');
        $this->get('/dashboard')->assertRedirect('/login');
        $this->get('/lapangan')->assertRedirect('/login');
        $this->postJson('/lapangan/issues', ['title' => 'Guest Spam'])->assertStatus(401);
        $this->deleteJson("/lapangan/issues/{$issue->id}")->assertStatus(401);
    }

    public function test_root_renders_lean_dashboard_and_legacy_dashboard_redirects_with_query_params(): void
    {
        $sheetMock = $this->createMock(LeanSheetDirectService::class);
        $sheetMock->method('getMonthGids')->willReturn(['November' => 11111]);
        $this->app->instance(LeanSheetDirectService::class, $sheetMock);

        $user = User::factory()->create([
            'role'            => 'department',
            'department'      => 'Engineer',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $this->actingAs($user)->get('/')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Lean/Index'));

        $this->actingAs($user)->get('/dashboard?dept=Engineer&issue=ENG-1')
            ->assertRedirect('/?dept=Engineer&issue=ENG-1');
    }

    public function test_api_lean_endpoints_require_valid_bot_key(): void
    {
        Config::set('services.bot.api_key', 'secure-bot-key-999');

        $this->getJson('/api/lean/issues')->assertStatus(401);
        $this->postJson('/api/lean/issues', ['title' => 'No Key'])->assertStatus(401);
        $this->getJson('/api/lean/issues', ['X-Bot-Key' => 'wrong-key'])->assertStatus(401);

        $this->getJson('/api/lean/issues', ['X-Bot-Key' => 'secure-bot-key-999'])
            ->assertOk()
            ->assertJson(['success' => true]);
    }

    public function test_other_department_cannot_delete_lean_issue_and_owner_or_admin_can(): void
    {
        $sheetMock = $this->createMock(LeanSheetDirectService::class);
        $sheetMock->method('deleteSingleIssue')->willReturn(true);
        $this->app->instance(LeanSheetDirectService::class, $sheetMock);

        $gasMock = $this->createMock(GoogleSheetsSyncService::class);
        $gasMock->method('syncIssue')->willReturn(true);
        $this->app->instance(GoogleSheetsSyncService::class, $gasMock);

        $itUser = User::factory()->create([
            'name'            => 'Staff IT',
            'staff_name'      => 'Rama IT',
            'role'            => 'department',
            'department'      => 'IT',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);
        $engUser = User::factory()->create([
            'name'            => 'Staff Eng',
            'staff_name'      => 'Budi Eng',
            'role'            => 'department',
            'department'      => 'Engineering',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);
        $adminUser = User::factory()->create([
            'name'            => 'Super Admin',
            'role'            => 'admin',
            'department'      => null,
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $engIssue = LeanIssue::create([
            'location'           => 'TBR Villa 8',
            'title'              => 'Pompa air bocor',
            'description'        => 'Cek pipa utama',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Siti',
            'reporter_dept'      => 'HK',
            'status'             => 'open',
        ]);

        // Legacy sandbox reset endpoint has been permanently removed
        $this->actingAs($adminUser)->postJson('/lapangan/reset')->assertStatus(404);

        // Other department user cannot delete Engineer issue
        $this->actingAs($itUser)->deleteJson("/lapangan/issues/{$engIssue->id}")->assertStatus(403);
        $this->assertDatabaseHas('lean_issues', ['id' => $engIssue->id, 'deleted_at' => null]);

        // Owning department can delete, and deleted_by_name uses authenticated user rather than client input
        $this->actingAs($engUser)->deleteJson("/lapangan/issues/{$engIssue->id}", [
            'deleted_by' => 'Spoofed General Manager',
        ])->assertOk();

        $engIssue->refresh();
        $this->assertSoftDeleted('lean_issues', ['id' => $engIssue->id]);
        $this->assertEquals('Budi Eng', $engIssue->deleted_by_name);

        // Admin can also delete another department's issue
        $otherIssue = LeanIssue::create([
            'location'           => 'TPI Villa 2',
            'title'              => 'AC tidak dingin',
            'description'        => 'Periksa freon',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Andi',
            'reporter_dept'      => 'HK',
            'status'             => 'open',
        ]);
        $this->actingAs($adminUser)->deleteJson("/lapangan/issues/{$otherIssue->id}")->assertOk();
        $this->assertSoftDeleted('lean_issues', ['id' => $otherIssue->id]);
    }

    public function test_non_admin_cannot_control_bot_even_for_version_v2(): void
    {
        $deptUser = User::factory()->create([
            'role'            => 'department',
            'department'      => 'Engineer',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $this->actingAs($deptUser)->postJson('/api/bot/start', ['version' => 'v2'])->assertStatus(403);
        $this->actingAs($deptUser)->postJson('/api/bot/stop', ['version' => 'v2'])->assertStatus(403);
        $this->actingAs($deptUser)->postJson('/api/bot/restart', ['version' => 'v2'])->assertStatus(403);
        $this->actingAs($deptUser)->getJson('/api/bot/logs?version=v2')->assertStatus(403);
    }

    public function test_telunas_set_whatsapp_command_normalizes_and_prevents_conflicts(): void
    {
        $user1 = User::factory()->create([
            'email'           => 'spv1@telunasresorts.com',
            'whatsapp_number' => null,
        ]);
        $user2 = User::factory()->create([
            'email'           => 'spv2@telunasresorts.com',
            'whatsapp_number' => '6281298765432',
        ]);

        $this->artisan('telunas:set-whatsapp', [
            'email' => 'spv1@telunasresorts.com',
            'phone' => '6281234567890',
        ])->assertExitCode(0);

        $user1->refresh();
        $this->assertEquals('081234567890', $user1->whatsapp_number);

        // Duplicate across 08xx / 628xx fails
        $this->artisan('telunas:set-whatsapp', [
            'email' => 'spv1@telunasresorts.com',
            'phone' => '081298765432',
        ])->assertExitCode(1);

        // Clear option removes WhatsApp number
        $this->artisan('telunas:set-whatsapp', [
            'email'   => 'spv1@telunasresorts.com',
            '--clear' => true,
        ])->assertExitCode(0);

        $user1->refresh();
        $this->assertNull($user1->whatsapp_number);
    }
}

