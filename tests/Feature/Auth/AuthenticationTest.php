<?php

namespace Tests\Feature\Auth;

use App\Http\Controllers\Auth\LoginOtpController;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('telunas.restrict_wifi', false);
        Config::set('telunas.login_otp_enabled', true);
        Config::set('telunas.login_otp_require_whatsapp', false);
        Config::set('telunas.registration_enabled', false);
    }

    public function test_login_screen_can_be_rendered_and_hides_registration_when_disabled(): void
    {
        $response = $this->get('/login');

        $response->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Auth/Login')
                ->where('canRegister', false)
            );
    }

    public function test_email_only_user_without_whatsapp_can_authenticate_during_transitional_phase(): void
    {
        $user = User::factory()->create([
            'whatsapp_number' => null,
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $response = $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticatedAs($user);
        $response->assertRedirect(route('lean.index', absolute: false));
    }

    public function test_email_only_user_is_blocked_when_require_whatsapp_is_enabled(): void
    {
        Config::set('telunas.login_otp_require_whatsapp', true);

        $user = User::factory()->create([
            'whatsapp_number' => null,
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $response = $this->from('/login')->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $this->assertGuest();
        $response->assertRedirect('/login');
        $response->assertSessionHasErrors('email');
    }

    public function test_users_with_whatsapp_must_complete_two_step_otp_login(): void
    {
        Http::fake([
            'http://localhost:3000/notify-direct' => Http::response(['success' => true], 200),
            '*'                                   => Http::response(['success' => true], 200),
        ]);

        $user = User::factory()->create([
            'whatsapp_number' => '081234567890',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        // Step 1: Email + Password succeeds credential check, triggers OTP, keeps user as Guest
        $loginResponse = $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $this->assertGuest();
        $loginResponse->assertRedirect(route('login.otp', absolute: false));
        $loginResponse->assertSessionHas(LoginOtpController::SESSION_KEY);

        $recorded = Http::recorded(fn ($req) => str_ends_with($req->url(), '/notify-direct'));
        $this->assertCount(1, $recorded);
        $sentMessage = (string) ($recorded[0][0]['message'] ?? '');
        $this->assertMatchesRegularExpression('/\*(\d{6})\*/', $sentMessage);
        preg_match('/\*(\d{6})\*/', $sentMessage, $matches);
        $otp = $matches[1];

        // OTP verification screen renders masked WhatsApp number
        $this->get('/login/otp')
            ->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Auth/VerifyOtp')
                ->where('maskedPhone', '0812••••890')
                ->where('attemptsRemaining', 5)
            );

        // Wrong OTP is rejected and decrements remaining attempts
        $badOtpResponse = $this->from('/login/otp')->post('/login/otp', [
            'otp' => '000000' === $otp ? '111111' : '000000',
        ]);
        $this->assertGuest();
        $badOtpResponse->assertSessionHasErrors('otp');

        // Correct OTP logs user in and redirects to dashboard
        $verifyResponse = $this->post('/login/otp', [
            'otp' => $otp,
        ]);

        $this->assertAuthenticatedAs($user);
        $verifyResponse->assertRedirect(route('lean.index', absolute: false));
        $verifyResponse->assertSessionMissing(LoginOtpController::SESSION_KEY);
    }

    public function test_otp_clears_challenge_after_max_failed_attempts(): void
    {
        Config::set('telunas.login_otp_max_attempts', 3);

        Http::fake([
            'http://localhost:3000/notify-direct' => Http::response(['success' => true], 200),
        ]);

        $user = User::factory()->create([
            'whatsapp_number' => '081234567891',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ])->assertRedirect(route('login.otp', absolute: false));

        $recorded = Http::recorded(fn ($req) => str_ends_with($req->url(), '/notify-direct'));
        preg_match('/\*(\d{6})\*/', (string) $recorded[0][0]['message'], $matches);
        $wrongOtp = $matches[1] === '111111' ? '222222' : '111111';

        $this->from('/login/otp')->post('/login/otp', ['otp' => $wrongOtp])->assertSessionHasErrors('otp');
        $this->from('/login/otp')->post('/login/otp', ['otp' => $wrongOtp])->assertSessionHasErrors('otp');

        $third = $this->from('/login/otp')->post('/login/otp', ['otp' => $wrongOtp]);
        $this->assertGuest();
        $third->assertRedirect(route('login', absolute: false));
        $third->assertSessionHasErrors('email');
        $third->assertSessionMissing(LoginOtpController::SESSION_KEY);
    }

    public function test_expired_otp_cannot_authenticate(): void
    {
        Config::set('telunas.login_otp_ttl_minutes', 5);

        Http::fake([
            'http://localhost:3000/notify-direct' => Http::response(['success' => true], 200),
        ]);

        $user = User::factory()->create([
            'whatsapp_number' => '081234567892',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $recorded = Http::recorded(fn ($req) => str_ends_with($req->url(), '/notify-direct'));
        preg_match('/\*(\d{6})\*/', (string) $recorded[0][0]['message'], $matches);
        $otp = $matches[1];

        $this->travel(6)->minutes();

        $response = $this->from('/login/otp')->post('/login/otp', ['otp' => $otp]);
        $this->assertGuest();
        $response->assertSessionHasErrors('otp');
    }

    public function test_otp_resend_enforces_cooldown_and_rotates_code(): void
    {
        Config::set('telunas.login_otp_resend_cooldown_seconds', 60);

        Http::fake([
            'http://localhost:3000/notify-direct' => Http::response(['success' => true], 200),
        ]);

        $user = User::factory()->create([
            'whatsapp_number' => '081234567893',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $firstRecorded = Http::recorded(fn ($req) => str_ends_with($req->url(), '/notify-direct'));
        preg_match('/\*(\d{6})\*/', (string) $firstRecorded[0][0]['message'], $m1);
        $firstOtp = $m1[1];

        // Immediate resend blocked by cooldown
        $earlyResend = $this->from('/login/otp')->post('/login/otp/resend');
        $earlyResend->assertSessionHasErrors('otp');

        // Advance past cooldown and resend
        $this->travel(65)->seconds();

        $resendResponse = $this->from('/login/otp')->post('/login/otp/resend');
        $resendResponse->assertRedirect('/login/otp');
        $resendResponse->assertSessionHas('status');

        $allRecorded = Http::recorded(fn ($req) => str_ends_with($req->url(), '/notify-direct'));
        $this->assertCount(2, $allRecorded);
        preg_match('/\*(\d{6})\*/', (string) $allRecorded[1][0]['message'], $m2);
        $secondOtp = $m2[1];

        // Verify with fresh OTP succeeds
        $this->post('/login/otp', ['otp' => $secondOtp])
            ->assertRedirect(route('lean.index', absolute: false));
        $this->assertAuthenticatedAs($user);
    }

    public function test_login_fails_safely_when_whatsapp_bot_is_offline(): void
    {
        Http::fake([
            'http://localhost:3000/notify-direct' => Http::response(['error' => 'Bot offline'], 503),
        ]);

        $user = User::factory()->create([
            'whatsapp_number' => '081234567894',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $response = $this->from('/login')->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $this->assertGuest();
        $response->assertRedirect('/login');
        $response->assertSessionHasErrors('email');
        $response->assertSessionMissing(LoginOtpController::SESSION_KEY);
    }

    public function test_login_otp_can_be_disabled_via_config_flag(): void
    {
        Config::set('telunas.login_otp_enabled', false);

        $user = User::factory()->create([
            'whatsapp_number' => '081234567895',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $response = $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticatedAs($user);
        $response->assertRedirect(route('lean.index', absolute: false));
    }

    public function test_otp_cancel_clears_session_and_redirects_to_login(): void
    {
        Http::fake([
            'http://localhost:3000/notify-direct' => Http::response(['success' => true], 200),
        ]);

        $user = User::factory()->create([
            'whatsapp_number' => '081234567896',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $this->post('/login', [
            'email'    => $user->email,
            'password' => 'password',
        ])->assertSessionHas(LoginOtpController::SESSION_KEY);

        $cancelResponse = $this->post('/login/otp/cancel');
        $this->assertGuest();
        $cancelResponse->assertRedirect(route('login', absolute: false));
        $cancelResponse->assertSessionMissing(LoginOtpController::SESSION_KEY);
    }

    public function test_users_can_not_authenticate_with_invalid_password(): void
    {
        $user = User::factory()->create([
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $this->post('/login', [
            'email'    => $user->email,
            'password' => 'wrong-password',
        ]);

        $this->assertGuest();
    }

    public function test_users_can_logout(): void
    {
        $user = User::factory()->create([
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $response = $this->actingAs($user)->post('/logout');

        $this->assertGuest();
        $response->assertRedirect(route('login', absolute: false));
    }
}
