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
        Cache::forget('telunas_server_public_ip');
    }

    public function test_local_ip_is_allowed(): void
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->get('/login');

        // Should not be 403 Forbidden
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
        $response = $this->withHeaders(['X-Forwarded-For' => '114.124.50.60'])
            ->get('/login');

        $response->assertStatus(403);
        $response->assertSee('Akses Khusus Jaringan Wi-Fi Telunas');
        $response->assertSee('114.124.50.60');
    }

    public function test_untrusted_external_ip_requesting_json_receives_403_json(): void
    {
        $response = $this->withHeaders(['X-Forwarded-For' => '114.124.50.60'])
            ->getJson('/api/issues');

        $response->assertStatus(403);
        $response->assertJson([
            'error' => 'Akses Ditolak',
        ]);
    }

    public function test_bot_api_key_bypasses_restriction(): void
    {
        Config::set('services.bot.api_key', 'test-secret-key-12345');

        $response = $this->withHeaders([
            'X-Bot-Api-Key' => 'test-secret-key-12345',
            'X-Forwarded-For' => '114.124.50.60',
        ])->get('/api/staff-directory');

        $this->assertNotEquals(403, $response->getStatusCode());
    }

    public function test_health_check_bypasses_restriction(): void
    {
        $response = $this->withHeaders(['X-Forwarded-For' => '114.124.50.60'])
            ->get('/up');

        $response->assertStatus(200);
    }
}
