<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use App\Services\WebPushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PushSubscriptionController extends Controller
{
    /**
     * Get VAPID public key for browser PushManager subscription
     */
    public function getVapidPublicKey(): JsonResponse
    {
        $publicKey = config('services.webpush.vapid_public_key');
        return response()->json([
            'publicKey' => $publicKey,
        ]);
    }

    /**
     * Register or update a device's push subscription
     */
    public function subscribe(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint' => 'required|string',
            'keys.p256dh' => 'required|string',
            'keys.auth' => 'required|string',
            'content_encoding' => 'nullable|string',
            'device_name' => 'nullable|string',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $endpoint = $validated['endpoint'];
        $endpointHash = hash('sha256', $endpoint);

        $subscription = PushSubscription::updateOrCreate(
            [
                'user_id' => $user->id,
                'endpoint_hash' => $endpointHash,
            ],
            [
                'endpoint' => $endpoint,
                'public_key' => $validated['keys']['p256dh'],
                'auth_token' => $validated['keys']['auth'],
                'content_encoding' => $validated['content_encoding'] ?? 'aes128gcm',
                'user_agent' => substr((string) $request->header('User-Agent'), 0, 255),
                'device_name' => $validated['device_name'] ?? null,
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Notifikasi perangkat berhasil diaktifkan.',
            'subscription_id' => $subscription->id,
        ]);
    }

    /**
     * Unsubscribe a device
     */
    public function unsubscribe(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint' => 'required|string',
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $endpointHash = hash('sha256', $validated['endpoint']);
        PushSubscription::where('user_id', $user->id)
            ->where('endpoint_hash', $endpointHash)
            ->delete();

        return response()->json([
            'success' => true,
            'message' => 'Notifikasi perangkat berhasil dinonaktifkan.',
        ]);
    }

    /**
     * Send instant test push notification to user's registered devices
     */
    public function sendTest(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $subscriptions = PushSubscription::where('user_id', $user->id)->get();
        if ($subscriptions->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Belum ada perangkat terdaftar untuk akun ini. Aktifkan izin notifikasi terlebih dahulu.',
            ], 422);
        }

        $payload = [
            'title' => '🔔 Tes Notifikasi Telunas Fix',
            'body' => "Halo {$user->name}, notifikasi pop-up berhasil terhubung ke HP/PC Anda!",
            'icon' => '/logo.png',
            'badge' => '/logo.png',
            'tag' => 'test-notification-' . time(),
            'data' => [
                'url' => '/dashboard',
                'isTest' => true,
            ],
        ];

        $result = WebPushService::sendToSubscriptions($subscriptions, $payload);

        return response()->json([
            'success' => $result['success'] > 0,
            'result' => $result,
            'message' => $result['success'] > 0 
                ? 'Tes notifikasi berhasil dikirim ke perangkat Anda!' 
                : 'Pengiriman tes notifikasi gagal. Cek izin browser Anda.',
        ]);
    }

    /**
     * Get user's push notification status
     */
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();
        $deviceCount = $user ? PushSubscription::where('user_id', $user->id)->count() : 0;

        return response()->json([
            'has_subscription' => $deviceCount > 0,
            'active_devices' => $deviceCount,
        ]);
    }
}
