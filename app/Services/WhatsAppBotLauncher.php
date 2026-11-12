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
     * Resolve bot runtime version (Bot V2 is the official runtime).
     */
    public function resolveVersion(?string $version = null): string
    {
        return 'v2';
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
                            'message'    => __('telunas.bot_status_connected'),
                        ];
                    }

                    if (in_array($rawStatus, ['qr_ready', 'pairing_ready', 'unlinked', 'logged_out'], true)) {
                        return [
                            'reachable'  => true,
                            'connected'  => false,
                            'state'      => 'needs_pairing',
                            'raw_status' => $rawStatus,
                            'message'    => __('telunas.bot_status_needs_pairing'),
                        ];
                    }

                    return [
                        'reachable'  => true,
                        'connected'  => false,
                        'state'      => 'booting',
                        'raw_status' => $rawStatus !== '' ? $rawStatus : 'booting',
                        'message'    => __('telunas.bot_status_booting'),
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
            'message'    => __('telunas.bot_status_offline'),
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
                    ? __('telunas.bot_already_running')
                    : $currentStatus['message'],
            ];
        }

        $botDir = base_path('whatsapp-bot');
        $script = 'bot-v2.js';
        $logFile = $botDir . DIRECTORY_SEPARATOR . 'bot_v2_runtime.log';
        $scriptPath = $botDir . DIRECTORY_SEPARATOR . $script;

        if (!is_dir($botDir) || !file_exists($scriptPath)) {
            Log::error('[WhatsAppBotLauncher] Bot directory or entrypoint script not found.', [
                'bot_dir'     => $botDir,
                'script_path' => $scriptPath,
            ]);
            throw new \RuntimeException(__('telunas.bot_script_missing', ['script' => $script]));
        }

        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            $cmd = 'start /B cmd /C "cd /D ' . escapeshellarg($botDir) . ' && node ' . $script . ' >> ' . escapeshellarg($logFile) . ' 2>&1"';
            $handle = popen($cmd, 'r');
            if ($handle === false) {
                Log::error('[WhatsAppBotLauncher] Failed launching Windows background bot process.', [
                    'version' => $resolvedVersion,
                ]);
                throw new \RuntimeException(__('telunas.bot_win_popen_failed'));
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
                throw new \RuntimeException(__('telunas.bot_unix_exec_failed', ['code' => $exitCode]));
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
            'message'         => __('telunas.bot_launch_v2_ok'),
        ];
    }
}

