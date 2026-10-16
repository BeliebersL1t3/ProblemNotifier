<?php

namespace App\Console\Commands;

use App\Http\Middleware\RestrictToTelunasNetwork;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\IpUtils;

class TelunasWifiIpCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'telunas:wifi-ip 
                            {--test= : Test whether a given IP address would be allowed or blocked}
                            {--refresh : Force refresh the cached server public WAN IP}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Inspect and test Telunas Wi-Fi network access restriction settings and WAN IP';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $middleware = app(RestrictToTelunasNetwork::class);

        if ($this->option('refresh')) {
            Cache::forget('telunas_server_public_ip');
            $this->info('Cleared cached server public WAN IP.');
        }

        $enabled = config('telunas.restrict_wifi', true);
        $configuredIps = config('telunas.allowed_ips', 'auto');
        $detectedIp = $middleware->getServerPublicIp();

        $this->info('--- Telunas Wi-Fi Restriction Status ---');
        $this->line('Restriction Enabled: ' . ($enabled ? '<fg=green>YES</>' : '<fg=yellow>NO (Disabled)</>'));
        $this->line('Configured Allowed IPs: ' . (is_array($configuredIps) ? implode(', ', $configuredIps) : $configuredIps));
        $this->line('Current Server Public WAN IP: <fg=cyan>' . ($detectedIp ?: 'Unable to detect') . '</>');

        $testIp = $this->option('test');
        if ($testIp) {
            $this->newLine();
            $this->info("--- Testing IP Address: {$testIp} ---");

            if ($testIp === '127.0.0.1' || $testIp === '::1' || IpUtils::isPrivateIp($testIp)) {
                $this->line("<fg=green>ALLOWED</> (Direct Local / Private LAN IP)");
                return 0;
            }

            // Test against allowed IPs
            $rawConfig = config('telunas.allowed_ips', 'auto');
            $items = is_array($rawConfig) ? $rawConfig : array_map('trim', explode(',', (string) $rawConfig));
            $allowed = [];
            $needsAuto = false;

            foreach ($items as $item) {
                $item = trim($item);
                if (strtolower($item) === 'auto') {
                    $needsAuto = true;
                } elseif (!empty($item)) {
                    $allowed[] = $item;
                }
            }

            if (($needsAuto || empty($allowed)) && $detectedIp) {
                $allowed[] = $detectedIp;
            }

            if (IpUtils::checkIp($testIp, $allowed)) {
                $this->line("<fg=green>ALLOWED</> (Matches Telunas Wi-Fi network IP: {$detectedIp})");
            } else {
                $this->line("<fg=red>BLOCKED</> (IP does not match Telunas Wi-Fi network)");
            }
        }

        return 0;
    }
}
