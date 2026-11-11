<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppBotLauncher
{
    /**
     * Resolve configured WhatsApp Bot HTTP port.
     */
    public function port(): int
    {
        $port = (int) config('services.bot.port', 3000);

        return ($port > 0 && $port <= 65535) ? $port : 3000;
    }

    /**
     * Resolve strict allowlisted bot version ('v1' or 'v2').
     */
    public function resolveVersion(?string $version = null): string
    {
        $defaultVersion = strtolower(trim((string) config('services.bot.default_version', 'v2')));
        if (!in_array($defaultVersion, ['v1', 'v2'], true)) {
            $defaultVersion = 'v2';
        }

        if ($version === null || trim($version) === '') {
            return $defaultVersion;
        }

        $candidate = strtolower(trim($version));

        return in_array($candidate, ['v1', 'v2'], true) ? $candidate : $defaultVersion;
    }

    /**
     * Inspect local WhatsApp bot status safely (no sensitive QR/pairing secrets exposed).
     *
     * @return array{
     *   reachable: bool,
     *   connected: bool,
     *   state: 'offline'|'booting'|'needs_pairing'|'connected',
     *   raw_status: string,
     *   message: string
     * }
     */
    public function inspectStatus(): array
    {
        $port = $this->port();

        foreach (["http://127.0.0.1:{$port}/status", "http://localhost:{$port}/status"] as $url) {
            try {
                $response = Http::connectTimeout(1)->timeout(2)->get($url);
                if ($response->successful()) {
                    $data = $response->json();
                    if (!is_array($data)) {
                        Log::warning('[WhatsAppBotLauncher] Unexpected non-JSON response from bot status endpoint.', [
                            'url' => $url,
                        ]);
                        continue;
                    }

                    $connected = (bool) ($data['connected'] ?? false);
                    $rawStatus = strtolower(trim((string) ($data['status'] ?? ($connected ? 'connected' : 'booting'))));

                    if ($connected) {
                        return [
                            'reachable'  => true,
                            'connected'  => true,
                            'state'      => 'connected',
                            'raw_status' => 'connected',
                            'message'    => 'Bot WhatsApp aktif dan terhubung.',
                        ];
                    }

                    if (in_array($rawStatus, ['qr_ready', 'pairing_ready', 'unlinked', 'logged_out'], true)) {
                        return [
                            'reachable'  => true,
                            'connected'  => false,
                            'state'      => 'needs_pairing',
                            'raw_status' => $rawStatus,
                            'message'    => 'Bot sudah menyala, namun sesi WhatsApp sedang terputus atau belum ter-pair (butuh scan QR / pairing ulang).',
                        ];
                    }

                    return [
                        'reachable'  => true,
                        'connected'  => false,
                        'state'      => 'booting',
                        'raw_status' => $rawStatus !== '' ? $rawStatus : 'booting',
                        'message'    => 'Proses bot menyala dan sedang menghubungkan koneksi WhatsApp...',
                    ];
                }
            } catch (\Throwable $e) {
                Log::info("[WhatsAppBotLauncher] Probe {$url} unavailable: " . $e->getMessage());
            }
        }

        return [
            'reachable'  => false,
            'connected'  => false,
            'state'      => 'offline',
            'raw_status' => 'offline',
            'message'    => 'Bot WhatsApp sedang offline atau tidak dapat dijangkau.',
        ];
    }

    /**
     * Launch the configured WhatsApp bot process in the background if not already running.
     *
     * @return array{
     *   started: bool,
     *   already_running: bool,
     *   version: string,
     *   state: 'offline'|'booting'|'needs_pairing'|'connected',
     *   message: string
     * }
     */
    public function start(?string $version = null): array
    {
        $resolvedVersion = $this->resolveVersion($version);
        $currentStatus = $this->inspectStatus();

        if ($currentStatus['reachable']) {
            return [
                'started'         => false,
                'already_running' => true,
                'version'         => $resolvedVersion,
                'state'           => $currentStatus['state'],
                'message'         => $currentStatus['connected']
                    ? 'Bot sudah aktif dan berjalan.'
                    : $currentStatus['message'],
            ];
        }

        $botDir = base_path('whatsapp-bot');
        $script = ($resolvedVersion === 'v2') ? 'bot-v2.js' : 'bot.js';
        $logFile = $botDir . DIRECTORY_SEPARATOR . ($resolvedVersion === 'v2' ? 'bot_v2_runtime.log' : 'bot_runtime.log');
        $scriptPath = $botDir . DIRECTORY_SEPARATOR . $script;

        if (!is_dir($botDir) || !file_exists($scriptPath)) {
            Log::error('[WhatsAppBotLauncher] Bot directory or entrypoint script not found.', [
                'bot_dir'     => $botDir,
                'script_path' => $scriptPath,
            ]);
            throw new \RuntimeException("Skrip bot '{$script}' tidak ditemukan pada direktori whatsapp-bot.");
        }

        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            $cmd = 'start /B cmd /C "cd /D ' . escapeshellarg($botDir) . ' && node ' . $script . ' >> ' . escapeshellarg($logFile) . ' 2>&1"';
            $handle = popen($cmd, 'r');
            if ($handle === false) {
                Log::error('[WhatsAppBotLauncher] Failed launching Windows background bot process.', [
                    'version' => $resolvedVersion,
                ]);
                throw new \RuntimeException('Gagal menjalankan proses Bot WhatsApp di background (Windows popen failed).');
            }
            pclose($handle);
        } else {
            $cmd = 'cd ' . escapeshellarg($botDir) . ' && nohup node ' . $script . ' >> ' . escapeshellarg($logFile) . ' 2>&1 < /dev/null &';
            $output = [];
            $exitCode = 0;
            exec($cmd, $output, $exitCode);
            if ($exitCode !== 0) {
                Log::error('[WhatsAppBotLauncher] Failed launching Unix background bot process.', [
                    'version'   => $resolvedVersion,
                    'exit_code' => $exitCode,
                    'output'    => $output,
                ]);
                throw new \RuntimeException("Gagal menjalankan proses Bot WhatsApp di background (exit code {$exitCode}).");
            }
        }

        Log::info('[WhatsAppBotLauncher] Bot process launch triggered.', [
            'version' => $resolvedVersion,
            'script'  => $script,
        ]);

        return [
            'started'         => true,
            'already_running' => false,
            'version'         => $resolvedVersion,
            'state'           => 'booting',
            'message'         => ($resolvedVersion === 'v2')
                ? 'Perintah menyalakan Bot WA V2 berhasil dikirim. Bot sedang booting di background.'
                : 'Perintah menyalakan bot berhasil dikirim. Bot sedang booting di background.',
        ];
    }
}

