<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class RestrictToTelunasNetworkTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Config::set('app.key', 'base64:f8s1J0O1q4W8sXJ7q4W8sXJ7q4W8sXJ7q4W8sXJ7q4U=');
        Config::set('cache.default', 'array');
        Config::set('session.driver', 'array');
        Config::set('telunas.restrict_wifi', true);
        Config::set('telunas.allowed_ips', '103.76.22.205');
        Config::set('trustedproxy.proxies', null);
        Cache::forget('telunas_server_public_ip');
    }

    public function test_wifi_restriction_can_be_disabled_for_public_cloud_hosting(): void
    {
        Config::set('telunas.restrict_wifi', false);

        $response = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->get('/login');

        $response->assertStatus(200);
    }

    public function test_local_ip_is_allowed(): void
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->get('/login');

        $this->assertNotEquals(403, $response->getStatusCode());
    }

    public function test_private_lan_ip_is_allowed(): void
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => '192.168.1.45'])
            ->get('/login');

        $this->assertNotEquals(403, $response->getStatusCode());
    }

    public function test_telunas_wifi_public_ip_is_allowed(): void
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => '103.76.22.205'])
            ->get('/login');

        $this->assertNotEquals(403, $response->getStatusCode());
    }

    public function test_untrusted_external_ip_is_blocked_with_custom_view(): void
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->get('/login');

        $response->assertStatus(403);
        $response->assertSee('Akses Khusus Jaringan Wi-Fi Telunas');
        $response->assertSee('114.124.50.60');
    }

    public function test_spoofed_x_forwarded_for_header_is_ignored_when_trusted_proxies_is_null(): void
    {
        Config::set('trustedproxy.proxies', null);

        $response = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->withHeaders(['X-Forwarded-For' => '192.168.1.45'])
            ->get('/login');

        $response->assertStatus(403);
        $response->assertSee('114.124.50.60');
    }

    public function test_forwarded_ip_is_evaluated_when_trusted_proxy_is_explicitly_configured(): void
    {
        Config::set('trustedproxy.proxies', '*');

        $response = $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->withHeaders(['X-Forwarded-For' => '114.124.50.60'])
            ->get('/login');

        $response->assertStatus(403);
        $response->assertSee('114.124.50.60');
    }

    public function test_untrusted_external_ip_requesting_json_receives_403_json(): void
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->getJson('/api/issues');

        $response->assertStatus(403);
        $response->assertJson([
            'error' => 'Akses Ditolak',
        ]);
    }

    public function test_bot_api_key_headers_bypass_restriction(): void
    {
        Config::set('services.bot.api_key', 'test-secret-key-12345');

        $resLegacyHeader = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->withHeaders(['X-Bot-Api-Key' => 'test-secret-key-12345'])
            ->get('/api/staff-directory');
        $this->assertNotEquals(403, $resLegacyHeader->getStatusCode());

        $resPrimaryHeader = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->withHeaders(['X-Bot-Key' => 'test-secret-key-12345'])
            ->get('/api/staff-directory');
        $this->assertNotEquals(403, $resPrimaryHeader->getStatusCode());
    }

    public function test_health_check_bypasses_restriction(): void
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->get('/up');

        $response->assertStatus(200);
    }

    public function test_external_ip_with_inertia_header_gets_409_hard_redirect(): void
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->withHeaders(['X-Inertia' => 'true'])
            ->get('/dashboard');

        $response->assertStatus(409);
        $this->assertEquals(url('/telunas-wifi-required'), $response->headers->get('X-Inertia-Location'));
    }

    public function test_leader_bypass_with_wrong_passcode_fails(): void
    {
        Config::set('telunas.bypass_passcode', 'SuperSecretPasscode123');

        $response = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->from('/telunas-wifi-required')
            ->post('/telunas-wifi-bypass', [
                'passcode' => 'WrongPasscode',
            ]);

        $response->assertRedirect('/telunas-wifi-required');
        $response->assertSessionHasErrors('passcode');
    }

    public function test_leader_bypass_with_correct_passcode_grants_access(): void
    {
        Config::set('telunas.bypass_passcode', 'SuperSecretPasscode123');
        Config::set('telunas.bypass_hours', 24);

        $response = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->from('/telunas-wifi-required')
            ->post('/telunas-wifi-bypass', [
                'passcode' => 'SuperSecretPasscode123',
            ]);

        $response->assertRedirect('/');
        $response->assertCookie('telunas_bypass_token');
        $response->assertSessionHas('telunas_wifi_bypass_until');

        // Subsequent requests from the same external IP with the session should now be allowed
        $followUp = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.60'])
            ->get('/login');

        $this->assertNotEquals(403, $followUp->getStatusCode());
    }

    public function test_bypass_endpoint_is_rate_limited(): void
    {
        Config::set('telunas.bypass_passcode', 'SuperSecretPasscode123');

        for ($i = 0; $i < 5; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.77'])
                ->from('/telunas-wifi-required')
                ->post('/telunas-wifi-bypass', ['passcode' => 'WrongPasscode']);
        }

        $blocked = $this->withServerVariables(['REMOTE_ADDR' => '114.124.50.77'])
            ->from('/telunas-wifi-required')
            ->post('/telunas-wifi-bypass', ['passcode' => 'WrongPasscode']);

        $blocked->assertStatus(429);
    }
}
