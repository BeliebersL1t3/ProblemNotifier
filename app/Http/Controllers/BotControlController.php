<?php

namespace App\Http\Controllers;

use App\Services\WhatsAppBotLauncher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class BotControlController extends Controller
{
    private function botPort(): int
    {
        $port = (int) config('services.bot.port', 3000);
        return ($port > 0 && $port <= 65535) ? $port : 3000;
    }

    private function botApiKey(): string
    {
        return (string) config('services.bot.api_key', '');
    }

    private function isAdminUser($user): bool
    {
        if (!$user) {
            return false;
        }
        return method_exists($user, 'isAdmin') ? $user->isAdmin() : ($user->role === 'admin');
    }

    public function getBotStatus()
    {
        $port = $this->botPort();
        foreach (["http://127.0.0.1:{$port}/status", "http://localhost:{$port}/status"] as $url) {
            try {
                $response = Http::timeout(2.0)->get($url);
                if ($response->successful()) {
                    $data = $response->json();
                    if (!empty($data['phone'])) {
                        $clean = preg_replace('/[^0-9]/', '', (string) $data['phone']);
                        $data['wa_url'] = "https://wa.me/{$clean}";
                    } else {
                        $data['wa_url'] = null;
                    }
                    return response()->json($data);
                }
            } catch (\Throwable $e) {
                Log::debug("[BotControlController] Status probe failed for {$url}: " . $e->getMessage());
            }
        }

        return response()->json(['connected' => false, 'status' => 'offline', 'wa_url' => null], 200);
    }

    public function startBot(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat menyalakan bot.'], 403);
        }

        try {
            $result = app(WhatsAppBotLauncher::class)->start('v2');

            return response()->json([
                'success' => true,
                'message' => $result['message'],
            ]);
        } catch (\Throwable $e) {
            Log::error('BotControlController::startBot failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Gagal menyalakan bot WhatsApp: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function stopBot(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat mematikan bot.'], 403);
        }

        $port = $this->botPort();
        $apiKey = $this->botApiKey();

        // 1. Try graceful shutdown via HTTP
        try {
            Http::timeout(2.0)
                ->withHeaders(['X-Bot-Key' => $apiKey])
                ->post("http://127.0.0.1:{$port}/shutdown");
        } catch (\Throwable $e) {
            Log::info('[BotControlController] Graceful HTTP shutdown skipped/failed, falling back to port kill: ' . $e->getMessage());
        }

        // 2. Fallback: Force kill process listening on bot port if still active
        usleep(500000);
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            $out = @shell_exec("netstat -ano | findstr :{$port}");
            if ($out) {
                $lines = explode("\n", trim($out));
                foreach ($lines as $line) {
                    if (preg_match('/LISTENING\s+(\d+)/i', $line, $m)) {
                        $pid = $m[1];
                        @shell_exec("taskkill /F /PID {$pid}");
                    }
                }
            }
        } else {
            @shell_exec("fuser -k {$port}/tcp");
        }

        return response()->json([
            'success' => true,
            'message' => 'Bot berhasil dimatikan.'
        ]);
    }

    public function restartBot(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat me-restart bot.'], 403);
        }

        $this->stopBot($request);
        sleep(2);
        return $this->startBot($request);
    }

    public function getBotLogs(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat melihat log bot.'], 403);
        }

        $logFile = base_path('whatsapp-bot' . DIRECTORY_SEPARATOR . 'bot_v2_runtime.log');

        if (!file_exists($logFile)) {
            return response()->json(['success' => true, 'logs' => ['Belum ada log runtime yang tercatat.']]);
        }

        $content = @file_get_contents($logFile);
        if (!$content) {
            return response()->json(['success' => true, 'logs' => []]);
        }

        $lines = explode("\n", trim($content));
        $recent = array_slice($lines, -40);

        return response()->json(['success' => true, 'logs' => $recent]);
    }

    public function getBotAuthState(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat memeriksa state otentikasi bot.'], 403);
        }

        $port = $this->botPort();
        $apiKey = $this->botApiKey();

        foreach (["http://127.0.0.1:{$port}/auth-state", "http://localhost:{$port}/auth-state"] as $url) {
            try {
                $response = Http::timeout(3.0)
                    ->withHeaders(['X-Bot-Key' => $apiKey])
                    ->get($url);
                if ($response->successful()) {
                    return response()->json($response->json());
                }
            } catch (\Throwable $e) {
                Log::debug("[BotControlController] auth-state probe failed for {$url}: " . $e->getMessage());
            }
        }

        return response()->json([
            'success' => false,
            'connected' => false,
            'status' => 'offline',
            'phone' => null,
            'qr' => null,
            'pairingCode' => null,
            'message' => 'Bot service offline atau tidak merespons.'
        ], 200);
    }

    public function pairBotPhone(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat menghubungkan nomor bot baru.'], 403);
        }

        $validated = $request->validate([
            'phone' => 'required|string|min:8|max:30',
        ]);

        $port = $this->botPort();
        $apiKey = $this->botApiKey();

        // Auto start bot if not running
        try {
            $check = Http::timeout(1.0)->get("http://127.0.0.1:{$port}/status");
            if (!$check->successful()) {
                $this->startBot($request);
                sleep(2);
            }
        } catch (\Throwable $e) {
            Log::info('[BotControlController] Bot offline before pairing, triggering startBot: ' . $e->getMessage());
            $this->startBot($request);
            sleep(2);
        }

        try {
            $response = Http::timeout(15.0)
                ->withHeaders(['X-Bot-Key' => $apiKey])
                ->post("http://127.0.0.1:{$port}/request-pairing-code", [
                    'phone' => $validated['phone'],
                ]);

            if ($response->successful()) {
                return response()->json($response->json());
            }

            return response()->json([
                'success' => false,
                'message' => $response->json('error') ?? 'Gagal meminta kode pairing dari bot.'
            ], $response->status());
        } catch (\Throwable $e) {
            Log::warning('[BotControlController] pairBotPhone HTTP failure: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Gagal berkomunikasi dengan WhatsApp bot service: ' . $e->getMessage()
            ], 500);
        }
    }

    public function unlinkBot(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat memutuskan sesi bot.'], 403);
        }

        $port = $this->botPort();
        $apiKey = $this->botApiKey();

        try {
            $response = Http::timeout(10.0)
                ->withHeaders(['X-Bot-Key' => $apiKey])
                ->post("http://127.0.0.1:{$port}/unlink");

            if ($response->successful()) {
                return response()->json($response->json());
            }

            return response()->json([
                'success' => false,
                'message' => $response->json('error') ?? 'Gagal memutuskan sesi bot.'
            ], $response->status());
        } catch (\Throwable $e) {
            Log::warning('[BotControlController] HTTP unlink failed, falling back to manual auth dir reset: ' . $e->getMessage());
            try {
                $botDir = base_path('whatsapp-bot');
                $authDir = $botDir . DIRECTORY_SEPARATOR . 'auth_info_baileys';
                $this->stopBot($request);
                sleep(1);
                if (file_exists($authDir)) {
                    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                        @shell_exec("rmdir /s /q " . escapeshellarg($authDir));
                    } else {
                        @shell_exec("rm -rf " . escapeshellarg($authDir));
                    }
                }
                $this->startBot($request);
                return response()->json([
                    'success' => true,
                    'message' => 'Sesi bot berhasil di-reset secara manual. Bot sedang booting ulang.'
                ]);
            } catch (\Throwable $e2) {
                Log::error('[BotControlController] Manual auth reset failed: ' . $e2->getMessage());
                return response()->json([
                    'success' => false,
                    'message' => 'Gagal me-reset sesi bot: ' . $e2->getMessage()
                ], 500);
            }
        }
    }

    public function getPublicBotContact(Request $request)
    {
        $port = $this->botPort();
        foreach (["http://127.0.0.1:{$port}/status", "http://localhost:{$port}/status"] as $url) {
            try {
                $response = Http::timeout(1.5)->get($url);
                if ($response->successful()) {
                    $json = $response->json();
                    $phone = $json['phone'] ?? null;
                    $clean = $phone ? preg_replace('/[^0-9]/', '', (string) $phone) : null;
                    return response()->json([
                        'success' => true,
                        'connected' => (bool) ($json['connected'] ?? false),
                        'phone' => $phone,
                        'name' => $json['name'] ?? null,
                        'wa_url' => $clean ? "https://wa.me/{$clean}" : null
                    ]);
                }
            } catch (\Throwable $e) {
                Log::debug("[BotControlController] Public contact probe failed for {$url}: " . $e->getMessage());
            }
        }

        return response()->json([
            'success' => true,
            'connected' => false,
            'phone' => null,
            'name' => null,
            'wa_url' => null
        ]);
    }

    public function getBotAuthStats(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat melihat statistik sesi bot.'], 403);
        }

        $port = $this->botPort();
        $apiKey = $this->botApiKey();

        // 1. Try fetching from running bot process
        try {
            $response = Http::timeout(3.0)
                ->withHeaders(['X-Bot-Key' => $apiKey])
                ->get("http://127.0.0.1:{$port}/cleanup-stats");
            if ($response->successful()) {
                return response()->json($response->json());
            }
        } catch (\Throwable $e) {
            Log::info('Bot service offline or not responding for cleanup-stats, falling back to disk inspection: ' . $e->getMessage());
        }

        // 2. Fallback: inspect directory (SQLite DB or legacy multi-file JSONs) directly on disk
        $authDir = base_path('whatsapp-bot' . DIRECTORY_SEPARATOR . 'auth_info_baileys');
        if (!is_dir($authDir)) {
            return response()->json([
                'success' => true,
                'stats' => [
                    'exists' => false,
                    'storageMode' => 'none',
                    'credsStatus' => 'missing',
                    'totalFiles' => 0,
                    'totalKeys' => 0,
                    'totalSizeKB' => 0,
                    'totalSizeMB' => 0,
                    'breakdown' => []
                ]
            ]);
        }

        $entries = scandir($authDir);
        if ($entries === false) {
            Log::warning("Failed scanning WhatsApp bot auth directory: {$authDir}");
            return response()->json([
                'success' => false,
                'message' => 'Gagal membaca direktori sesi bot pada disk.'
            ], 500);
        }

        $totalBytes = 0;
        $fileCount = 0;
        $jsonFiles = [];

        foreach ($entries as $file) {
            if ($file === '.' || $file === '..') continue;
            $fullPath = $authDir . DIRECTORY_SEPARATOR . $file;
            if (!is_file($fullPath)) continue;

            $fileCount++;
            $size = filesize($fullPath);
            if ($size !== false) {
                $totalBytes += $size;
            }
            if (str_ends_with($file, '.json')) {
                $jsonFiles[] = $file;
            }
        }

        $dbPath = $authDir . DIRECTORY_SEPARATOR . 'baileys_auth.sqlite';
        if (is_file($dbPath) && class_exists(\PDO::class) && extension_loaded('pdo_sqlite')) {
            $breakdown = [];
            $totalKeys = 0;
            $credsStatus = 'missing';
            $pdo = null;

            try {
                $dsn = 'sqlite:' . $dbPath;
                $roOptions = [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION];
                if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS') && defined('PDO::SQLITE_OPEN_READONLY')) {
                    $roOptions[\PDO::SQLITE_ATTR_OPEN_FLAGS] = \PDO::SQLITE_OPEN_READONLY;
                }

                try {
                    $pdo = new \PDO($dsn, null, null, $roOptions);
                } catch (\Throwable $roErr) {
                    Log::warning('Read-only SQLite stats inspection hit WAL/lock, retrying standard open: ' . $roErr->getMessage());
                    $pdo = new \PDO($dsn, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
                }

                $keyStmt = $pdo->query('SELECT category, COUNT(*) AS cnt FROM auth_keys GROUP BY category');
                if ($keyStmt) {
                    foreach ($keyStmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                        $cat = (string) ($row['category'] ?? 'other');
                        $cnt = (int) ($row['cnt'] ?? 0);
                        $breakdown[$cat] = $cnt;
                        $totalKeys += $cnt;
                    }
                }

                $credsStmt = $pdo->prepare("SELECT value FROM auth_meta WHERE key = 'creds' LIMIT 1");
                if ($credsStmt && $credsStmt->execute()) {
                    $rawCreds = $credsStmt->fetchColumn();
                    if (is_string($rawCreds) && $rawCreds !== '') {
                        $credsJson = json_decode($rawCreds, true);
                        if (is_array($credsJson)) {
                            $credsStatus = !empty($credsJson['registered']) ? 'registered' : 'unregistered';
                        } else {
                            $credsStatus = 'corrupted';
                        }
                    }
                }
            } catch (\Throwable $sqlErr) {
                Log::warning('Failed inspecting baileys_auth.sqlite via PHP PDO: ' . $sqlErr->getMessage());
                $credsStatus = 'error';
            } finally {
                $pdo = null;
            }

            return response()->json([
                'success' => true,
                'stats' => [
                    'exists' => true,
                    'storageMode' => 'sqlite',
                    'credsStatus' => $credsStatus,
                    'totalFiles' => $fileCount,
                    'totalKeys' => $totalKeys,
                    'totalSizeKB' => (int) round($totalBytes / 1024),
                    'totalSizeMB' => round($totalBytes / (1024 * 1024), 2),
                    'breakdown' => $breakdown
                ]
            ]);
        }

        // Legacy multi-file JSON stats fallback
        $knownCategories = [
            'app-state-sync-version',
            'app-state-sync-key',
            'sender-key-memory',
            'identity-key',
            'lid-mapping',
            'device-list',
            'sender-key',
            'pre-key',
            'session',
            'tctoken',
        ];
        $breakdown = [];
        $totalKeys = 0;

        foreach ($jsonFiles as $file) {
            if ($file === 'creds.json' || $file === 'creds.json.bak') continue;
            $baseName = substr($file, 0, -5);
            $matchedCategory = 'other';
            foreach ($knownCategories as $cat) {
                if (str_starts_with($baseName, $cat . '-')) {
                    $matchedCategory = $cat;
                    break;
                }
            }
            if ($matchedCategory === 'other' && str_contains($baseName, '-')) {
                $matchedCategory = explode('-', $baseName, 2)[0] ?: 'other';
            }
            $breakdown[$matchedCategory] = ($breakdown[$matchedCategory] ?? 0) + 1;
            $totalKeys++;
        }

        $credsStatus = 'missing';
        $credsPath = $authDir . DIRECTORY_SEPARATOR . 'creds.json';
        if (is_file($credsPath)) {
            $rawCreds = file_get_contents($credsPath);
            $credsJson = is_string($rawCreds) ? json_decode($rawCreds, true) : null;
            $credsStatus = is_array($credsJson)
                ? (!empty($credsJson['registered']) ? 'registered' : 'unregistered')
                : 'corrupted';
        }

        return response()->json([
            'success' => true,
            'stats' => [
                'exists' => true,
                'storageMode' => 'multifile',
                'credsStatus' => $credsStatus,
                'totalFiles' => $fileCount,
                'totalKeys' => $totalKeys,
                'totalSizeKB' => (int) round($totalBytes / 1024),
                'totalSizeMB' => round($totalBytes / (1024 * 1024), 2),
                'breakdown' => $breakdown
            ]
        ]);
    }

    public function cleanupBotAuth(Request $request)
    {
        if (!$this->isAdminUser($request->user())) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat membersihkan file sesi bot.'], 403);
        }

        $port = $this->botPort();
        $apiKey = $this->botApiKey();

        // 1. Try running cleanup via running bot
        try {
            $response = Http::timeout(10.0)
                ->withHeaders(['X-Bot-Key' => $apiKey])
                ->post("http://127.0.0.1:{$port}/cleanup-auth");
            if ($response->successful()) {
                return response()->json($response->json());
            }
        } catch (\Throwable $e) {
            Log::info('Bot service offline or not responding for cleanup-auth, executing via Node runner: ' . $e->getMessage());
        }

        // 2. Fallback: run housekeeping directly via node script
        $botDir = base_path('whatsapp-bot');
        $scriptPath = $botDir . DIRECTORY_SEPARATOR . 'housekeeping.js';
        if (file_exists($scriptPath)) {
            $cdPrefix = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? 'cd /D ' : 'cd ';
            $nodeCmd = "node -e \"const { cleanAuthFolder } = require('./housekeeping'); console.log(JSON.stringify(cleanAuthFolder()));\"";
            $output = shell_exec($cdPrefix . escapeshellarg($botDir) . " && " . $nodeCmd);
            if (is_string($output) && trim($output) !== '') {
                $lines = array_reverse(array_filter(array_map('trim', explode("\n", $output))));
                foreach ($lines as $line) {
                    if (str_starts_with($line, '{') && str_ends_with($line, '}')) {
                        $json = json_decode($line, true);
                        if (is_array($json)) {
                            return response()->json($json);
                        }
                    }
                }
                if (preg_match('/\{[\s\S]*\}/', $output, $matches)) {
                    $json = json_decode($matches[0], true);
                    if (is_array($json)) {
                        return response()->json($json);
                    }
                }
                Log::warning('Unexpected non-JSON output from Node housekeeping cleanup: ' . substr($output, 0, 500));
            }
        }

        return response()->json([
            'success' => false,
            'message' => 'Gagal menjalankan pembersihan database sesi bot.'
        ], 500);
    }
}

