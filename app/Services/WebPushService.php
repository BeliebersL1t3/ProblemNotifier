<?php

namespace App\Services;

use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\WebPush;

class WebPushService
{
    /**
     * Get configured WebPush client instance
     */
    protected static function getClient(): ?WebPush
    {
        // Windows OpenSSL configuration safety fallback
        if (PHP_OS_FAMILY === 'Windows' && !getenv('OPENSSL_CONF')) {
            $possibleCnf = 'C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\extras\ssl\openssl.cnf';
            if (file_exists($possibleCnf)) {
                putenv("OPENSSL_CONF={$possibleCnf}");
            }
        }

        $publicKey = config('services.webpush.vapid_public_key');
        $privateKey = config('services.webpush.vapid_private_key');
        $subject = config('services.webpush.vapid_subject', 'mailto:admin@telunasresorts.com');

        if (empty($publicKey) || empty($privateKey)) {
            Log::warning('WebPushService: VAPID keys are not configured in services.webpush.');
            return null;
        }

        $auth = [
            'VAPID' => [
                'subject' => $subject,
                'publicKey' => $publicKey,
                'privateKey' => $privateKey,
            ],
        ];

        return new WebPush($auth, [
            'TTL' => 86400, // 24 hours queue retention
        ]);
    }

    /**
     * Send Web Push notification to a collection or single PushSubscription
     */
    public static function sendToSubscriptions($subscriptions, array $payload): array
    {
        $webPush = self::getClient();
        if (!$webPush) {
            return ['success' => 0, 'failed' => 0, 'cleaned' => 0];
        }

        if ($subscriptions instanceof PushSubscription) {
            $subscriptions = collect([$subscriptions]);
        }

        if (empty($subscriptions) || count($subscriptions) === 0) {
            return ['success' => 0, 'failed' => 0, 'cleaned' => 0];
        }

        $jsonPayload = json_encode(array_merge([
            'icon' => '/logo.png',
            'badge' => '/logo.png',
            'vibrate' => [200, 100, 200],
            'timestamp' => round(microtime(true) * 1000),
        ], $payload));

        $subMap = [];
        foreach ($subscriptions as $sub) {
            try {
                $webPushSub = $sub->toWebPushSubscription();
                $webPush->queueNotification($webPushSub, $jsonPayload);
                $subMap[$sub->endpoint] = $sub->id;
            } catch (\Throwable $e) {
                Log::warning("WebPushService subscription queue error: {$e->getMessage()}");
            }
        }

        $successCount = 0;
        $failedCount = 0;
        $cleanedIds = [];

        try {
            foreach ($webPush->flush() as $report) {
                $endpoint = $report->getEndpoint();
                if ($report->isSuccess()) {
                    $successCount++;
                } else {
                    $failedCount++;
                    Log::info("WebPush dispatch notice for {$endpoint}: {$report->getReason()}");

                    // If device unsubscribed or subscription expired (404/410), delete stale subscription
                    if ($report->isSubscriptionExpired() && isset($subMap[$endpoint])) {
                        $cleanedIds[] = $subMap[$endpoint];
                    }
                }
            }

            if (!empty($cleanedIds)) {
                PushSubscription::whereIn('id', $cleanedIds)->delete();
            }
        } catch (\Throwable $e) {
            Log::error("WebPushService flush execution failed: {$e->getMessage()}");
        }

        return [
            'success' => $successCount,
            'failed' => $failedCount,
            'cleaned' => count($cleanedIds),
        ];
    }

    /**
     * Send notification to a specific user
     */
    public static function notifyUser(int $userId, array $payload): array
    {
        $subs = PushSubscription::where('user_id', $userId)->get();
        return self::sendToSubscriptions($subs, $payload);
    }

    /**
     * Send notification to multiple users
     */
    public static function notifyUsers(array $userIds, array $payload): array
    {
        $subs = PushSubscription::whereIn('user_id', $userIds)->get();
        return self::sendToSubscriptions($subs, $payload);
    }

    /**
     * Send notification to all active staff in a department and/or admins
     */
    public static function notifyDepartment(string $department, array $payload, ?int $exceptUserId = null): array
    {
        $query = User::where(function ($q) use ($department) {
            $q->where('department', $department)
              ->orWhere('role', 'admin')
              ->orWhere('can_view_all_departments', 1);
        });

        if ($exceptUserId) {
            $query->where('id', '!=', $exceptUserId);
        }

        $userIds = $query->pluck('id')->toArray();
        return self::notifyUsers($userIds, $payload);
    }

    /**
     * Send high-priority broadcast for new issue or SOS
     */
    public static function notifyNewIssue(array $issue, ?int $reportedByUserId = null): array
    {
        $isEmergency = !empty($issue['is_emergency']) || (!empty($issue['priority']) && strtolower($issue['priority']) === 'urgent');
        $title = $isEmergency 
            ? "🚨 DARURAT (SOS): " . ($issue['title'] ?? 'Tiket Baru')
            : "🔔 Tiket Baru: " . ($issue['title'] ?? 'Isu Baru');

        $dept = $issue['department'] ?? 'General';
        $location = $issue['location'] ?? 'Lokasi Umum';
        $body = "Dept: {$dept} | Lokasi: {$location}" . (!empty($issue['reporter']) ? " | Pelapor: {$issue['reporter']}" : "");

        $issueId = $issue['id'] ?? '';
        $url = $issueId ? "/dashboard?issue=" . urlencode($issueId) : "/dashboard";

        $payload = [
            'title' => $title,
            'body' => $body,
            'icon' => '/logo.png',
            'badge' => '/logo.png',
            'tag' => 'issue-' . ($issueId ?: uniqid()),
            'data' => [
                'url' => $url,
                'issueId' => $issueId,
                'isEmergency' => $isEmergency,
            ],
            'requireInteraction' => $isEmergency, // Persistent on screen if emergency
        ];

        return self::notifyDepartment($dept, $payload, $reportedByUserId);
    }

    /**
     * Send notification when an issue is claimed (taken)
     */
    public static function notifyIssueTaken(array $issue, string $takerName, ?int $takerUserId = null): array
    {
        $issueId = $issue['id'] ?? '';
        $title = "👷 Isu Sedang Dikerjakan (#{$issueId})";
        $body = "{$takerName} mulai menangani: " . ($issue['title'] ?? 'Isu') . " di " . ($issue['location'] ?? 'lokasi');
        $url = "/dashboard?issue=" . urlencode($issueId);

        $payload = [
            'title' => $title,
            'body' => $body,
            'icon' => '/logo.png',
            'tag' => 'issue-taken-' . $issueId,
            'data' => [
                'url' => $url,
                'issueId' => $issueId,
            ],
        ];

        // Notify department team and admins
        $dept = $issue['department'] ?? '';
        return self::notifyDepartment($dept, $payload, $takerUserId);
    }

    /**
     * Send notification when an issue is solved
     */
    public static function notifyIssueSolved(array $issue, string $solverName, ?int $solverUserId = null): array
    {
        $issueId = $issue['id'] ?? '';
        $title = "✅ Isu Selesai (#{$issueId})";
        $body = "Diselesaikan oleh {$solverName}: " . ($issue['title'] ?? 'Isu');
        $url = "/dashboard?issue=" . urlencode($issueId);

        $payload = [
            'title' => $title,
            'body' => $body,
            'icon' => '/logo.png',
            'tag' => 'issue-solved-' . $issueId,
            'data' => [
                'url' => $url,
                'issueId' => $issueId,
            ],
        ];

        $dept = $issue['department'] ?? '';
        return self::notifyDepartment($dept, $payload, $solverUserId);
    }
}
