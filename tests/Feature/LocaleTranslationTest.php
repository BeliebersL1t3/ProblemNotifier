<?php

namespace Tests\Feature;

use App\Http\Controllers\Auth\LoginOtpController;
use App\Models\LeanIssue;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use App\Services\WhatsAppBotLauncher;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LocaleTranslationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('cache.default', 'array');
        Config::set('session.driver', 'array');
        Config::set('telunas.restrict_wifi', false);
        Config::set('telunas.login_otp_enabled', true);
        Config::set('telunas.login_otp_require_whatsapp', false);
        Config::set('telunas.registration_enabled', false);
        Config::set('services.bot.api_key', 'test-bot-secret');
        Config::set('services.bot.port', 3000);
        Cache::flush();

        $sheetMock = $this->createMock(LeanSheetDirectService::class);
        $sheetMock->method('getMonthGids')->willReturn(['November' => 11111]);
        $sheetMock->method('syncSingleIssue')->willReturn(true);
        $this->app->instance(LeanSheetDirectService::class, $sheetMock);

        $gasMock = $this->createMock(GoogleSheetsSyncService::class);
        $gasMock->method('syncIssue')->willReturn(true);
        $this->app->instance(GoogleSheetsSyncService::class, $gasMock);
    }

    protected function makeUser(string $role = 'department', ?string $department = 'Engineer', string $name = 'Spv Engineer'): User
    {
        return User::factory()->create([
            'name'            => $name,
            'staff_name'      => $name,
            'role'            => $role,
            'department'      => $department,
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);
    }

    public function test_default_locale_is_indonesian_and_invalid_values_fallback_to_id(): void
    {
        $this->get('/login')
            ->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Auth/Login')
                ->where('locale', 'id')
            );

        // Invalid or traversal attempts in cookie/header must safely fallback to 'id'
        $this->withUnencryptedCookie('telunas_locale', '../en')
            ->withHeaders(['X-Telunas-Locale' => 'fr'])
            ->get('/login')
            ->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Auth/Login')
                ->where('locale', 'id')
            );
    }

    public function test_cookie_and_header_switch_locale_and_header_takes_precedence(): void
    {
        $user = $this->makeUser('department', 'Engineer', 'Andi Eng');

        // Unencrypted telunas_locale cookie sets English for /login and /lapangan
        $this->withUnencryptedCookie('telunas_locale', 'en')
            ->get('/login')
            ->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Auth/Login')
                ->where('locale', 'en')
            );

        // X-Telunas-Locale header (even uppercase/whitespace) overrides cookie
        $issue = LeanIssue::create([
            'location'           => 'TPI - Villa 02',
            'title'              => 'AC Not Cooling',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Budi',
            'status'             => 'open',
        ]);
        $issue->created_at = Carbon::now()->subHours(2);
        $issue->save();

        $this->actingAs($user)
            ->withUnencryptedCookie('telunas_locale', 'id')
            ->withHeaders(['X-Telunas-Locale' => ' EN '])
            ->get('/lapangan')
            ->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->where('locale', 'en')
                ->where('issues.0.created_at_human', fn ($human) => str_contains(strtolower((string) $human), 'ago'))
            );

        // Switching back to Indonesian via header overrides an 'en' cookie
        $this->actingAs($user)
            ->withUnencryptedCookie('telunas_locale', 'en')
            ->withHeaders(['X-Telunas-Locale' => 'id'])
            ->get('/lapangan')
            ->assertStatus(200)
            ->assertInertia(fn (Assert $page) => $page
                ->component('Lean/Index')
                ->where('locale', 'id')
                ->where('issues.0.created_at_human', fn ($human) => str_contains(strtolower((string) $human), 'yang lalu'))
            );
    }

    public function test_login_and_registration_disabled_messages_respect_locale(): void
    {
        $user = User::factory()->create([
            'whatsapp_number' => '081234567890',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        // Wrong password in English vs Indonesian
        $enWrongPwd = $this->withHeaders(['X-Telunas-Locale' => 'en'])
            ->from('/login')
            ->post('/login', [
                'email'    => $user->email,
                'password' => 'wrong-password',
            ]);
        $enWrongPwd->assertSessionHasErrors([
            'email' => 'These credentials do not match our records.',
        ]);

        $idWrongPwd = $this->withHeaders(['X-Telunas-Locale' => 'id'])
            ->from('/login')
            ->post('/login', [
                'email'    => $user->email,
                'password' => 'wrong-password',
            ]);
        $idWrongPwd->assertSessionHasErrors([
            'email' => 'Email atau kata sandi yang Anda masukkan salah.',
        ]);

        // Registration disabled message respects cookie locale (flush prior sticky defaultHeaders)
        $this->flushHeaders()
            ->withUnencryptedCookie('telunas_locale', 'en')
            ->get('/register')
            ->assertRedirect(route('login', absolute: false))
            ->assertSessionHas('status', 'Self-registration is currently disabled by the Administrator. Please contact Admin to create an account.');

        $this->withHeaders(['X-Telunas-Locale' => 'en'])
            ->postJson('/register/check-phone', ['whatsapp_number' => '08123456789'])
            ->assertStatus(403)
            ->assertJson([
                'message' => 'Self-registration is currently disabled.',
            ]);
    }

    public function test_otp_mismatch_and_resend_cooldown_messages_respect_locale(): void
    {
        Config::set('telunas.login_otp_resend_cooldown_seconds', 60);
        Config::set('telunas.login_otp_max_attempts', 5);

        $user = User::factory()->create([
            'whatsapp_number' => '081234567891',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:3000/*' => Http::response(['success' => true], 200),
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
        ]);

        $this->withHeaders(['X-Telunas-Locale' => 'en'])
            ->post('/login', [
                'email'    => $user->email,
                'password' => 'password',
            ])
            ->assertRedirect(route('login.otp', absolute: false));

        $recorded = Http::recorded(fn ($req) => str_ends_with($req->url(), '/notify-direct'));
        $this->assertCount(1, $recorded);
        preg_match('/\*(\d{6})\*/', (string) ($recorded[0][0]['message'] ?? ''), $matches);
        $this->assertArrayHasKey(1, $matches);
        $wrongOtp = $matches[1] === '111111' ? '222222' : '111111';

        $verifyRes = $this->withHeaders(['X-Telunas-Locale' => 'en'])
            ->from('/login/otp')
            ->post('/login/otp', ['otp' => $wrongOtp]);
        $verifyRes->assertRedirect('/login/otp');
        $verifyRes->assertSessionHasErrors([
            'otp' => 'Invalid OTP code. Remaining attempts: 4.',
        ]);

        // Immediate resend cooldown in English
        $resendRes = $this->withHeaders(['X-Telunas-Locale' => 'en'])
            ->from('/login/otp')
            ->post('/login/otp/resend');
        $resendRes->assertRedirect('/login/otp');
        $resendRes->assertSessionHasErrors('otp');
        $resendError = session('errors')->first('otp');
        $this->assertStringContainsString('Please wait', $resendError);
    }

    public function test_admin_pre_otp_bot_recovery_and_launcher_messages_respect_locale(): void
    {
        // Unauthenticated recovery call returns localized unauthorized JSON
        $this->withHeaders(['X-Telunas-Locale' => 'en'])
            ->postJson('/login/bot-start')
            ->assertStatus(403)
            ->assertJson([
                'status'  => 'unauthorized',
                'message' => 'Admin bot recovery session was not found or has expired. Please re-enter your Admin email & password.',
            ]);

        // WhatsAppBotLauncher inspects needs_pairing cleanly in English and Indonesian
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:3000/status' => Http::response(['status' => 'qr_ready'], 200),
            'http://localhost:3000/status' => Http::response(['status' => 'qr_ready'], 200),
        ]);
        app()->setLocale('en');
        $launcherStatus = app(WhatsAppBotLauncher::class)->inspectStatus();
        $this->assertSame('needs_pairing', $launcherStatus['state']);
        $this->assertSame(
            'Bot is running, but its WhatsApp session is disconnected or unpaired (QR / pairing required).',
            $launcherStatus['message']
        );

        app()->setLocale('id');
        $launcherStatusId = app(WhatsAppBotLauncher::class)->inspectStatus();
        $this->assertSame(
            'Bot sudah menyala, namun sesi WhatsApp sedang terputus atau belum ter-pair (butuh scan QR / pairing ulang).',
            $launcherStatusId['message']
        );
    }

    public function test_admin_login_offline_bot_recovery_hint_respects_locale(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:3000/*' => Http::response(['error' => 'Offline'], 503),
            'http://localhost:3000/*' => Http::response(['error' => 'Offline'], 503),
        ]);

        $admin = User::factory()->create([
            'role'            => 'admin',
            'whatsapp_number' => '08113861133',
            'is_active'       => true,
            'approval_status' => 'approved',
        ]);

        $this->withHeaders(['X-Telunas-Locale' => 'en'])
            ->from('/login')
            ->post('/login', [
                'email'    => $admin->email,
                'password' => 'password',
            ])
            ->assertSessionHas(LoginOtpController::BOT_RECOVERY_SESSION_KEY)
            ->assertSessionHasErrors([
                'email' => 'The WhatsApp Bot is currently offline so the login OTP could not be sent. Click "Activate Bot" at the bottom-left corner to start the bot and dispatch the OTP.',
            ]);
    }

    public function test_lean_workflow_responses_translate_to_english_while_keeping_indonesian_whatsapp_notifications(): void
    {
        Http::fake([
            'http://localhost:3000/*' => Http::response(['success' => true], 200),
            '*'                       => Http::response(['success' => true], 200),
        ]);

        $engUser = $this->makeUser('department', 'Engineer', 'Andi Eng');
        $itUser = $this->makeUser('department', 'IT', 'Siti IT');
        $issue = LeanIssue::create([
            'location'           => 'TBR - Villa 05',
            'title'              => 'Shower Valve Leak',
            'target_departments' => ['Engineer'],
            'reporter_name'      => 'Nadya',
            'reporter_dept'      => 'HR',
            'reporter_phone'     => '081234567890',
            'status'             => 'open',
        ]);

        // Cross-department access denial in English
        $this->actingAs($itUser)
            ->withHeaders(['X-Telunas-Locale' => 'en'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", ['workers' => ['Budi']])
            ->assertStatus(403);

        // Claim in English
        $this->actingAs($engUser)
            ->withHeaders(['X-Telunas-Locale' => 'en'])
            ->postJson("/lapangan/issues/{$issue->id}/claim", ['workers' => ['Andi', 'Budi']])
            ->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Issue claimed and started by Andi, Budi (Engineer).',
            ]);

        // Pending empty reason & valid pending in English
        $this->actingAs($engUser)
            ->withHeaders(['X-Telunas-Locale' => 'en'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", ['reason' => ''])
            ->assertStatus(422)
            ->assertJson([
                'success' => false,
                'message' => 'Pending reason is required.',
            ]);

        $this->actingAs($engUser)
            ->withHeaders(['X-Telunas-Locale' => 'en'])
            ->postJson("/lapangan/issues/{$issue->id}/pending", ['reason' => 'Waiting valve delivery'])
            ->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Issue marked as Pending.',
            ]);

        // Transfer & Resolve in English
        $this->actingAs($engUser)
            ->withHeaders(['X-Telunas-Locale' => 'en'])
            ->postJson("/lapangan/issues/{$issue->id}/resolve", [
                'note'          => 'Valve replaced cleanly.',
                'final_workers' => ['Andi'],
            ])
            ->assertStatus(200)
            ->assertJson([
                'success' => true,
                'message' => 'Issue successfully marked as resolved!',
            ]);

        // Verify WhatsApp notifications stayed Indonesian per operational policy
        Http::assertSent(fn ($req) => str_contains($req->url(), 'notify-direct')
            && str_contains((string) ($req['message'] ?? ''), 'Mulai Dikerjakan'));
        Http::assertSent(fn ($req) => str_contains($req->url(), 'notify-direct')
            && str_contains((string) ($req['message'] ?? ''), 'SELESAI'));

        // Bot API endpoint with X-Telunas-Locale: en
        $this->withHeaders([
            'X-Bot-Key'        => 'test-bot-secret',
            'X-Telunas-Locale' => 'en',
        ])->postJson('/api/lean/issues/99999/claim', ['staff_name' => 'Bot'])
            ->assertStatus(404)
            ->assertJson([
                'success' => false,
                'message' => 'Issue not found.',
            ]);
    }
}
