<?php

namespace App\Http\Controllers;

use App\Models\DashboardNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class NotificationController extends Controller
{
    /**
     * Get recent notifications for the logged in user split by tab
     */
    public function getNotifications(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['tickets' => [], 'issues' => [], 'unread_count' => 0]);
        }

        $allNotifications = DashboardNotification::forUser($user)
            ->latest()
            ->take(40)
            ->get();

        $unreadCount = $allNotifications->where('is_read', false)->count();

        // Bandwidth Optimization: Return 304 Not Modified if notification data hasn't changed
        $etag = md5($allNotifications->map(fn($n) => $n->id . ':' . ($n->is_read ? '1' : '0') . ':' . $n->updated_at?->timestamp)->join(';') . '_' . $unreadCount);
        $clientEtag = trim((string)$request->header('If-None-Match'), '"');

        if (!empty($clientEtag) && $clientEtag === $etag) {
            return response('', 304)
                ->header('ETag', '"' . $etag . '"')
                ->header('Cache-Control', 'private, no-cache');
        }

        $issues = $allNotifications->filter(function ($n) {
            return $n->type === 'issue_progress';
        })->values();

        $tickets = $allNotifications->filter(function ($n) {
            return $n->type !== 'issue_progress';
        })->values();

        return response()->json([
            'tickets' => $tickets,
            'issues' => $issues,
            'unread_count' => $unreadCount,
        ])->header('ETag', '"' . $etag . '"')
          ->header('Cache-Control', 'private, no-cache');
    }

    /**
     * Mark a single notification as read
     */
    public function markAsRead(Request $request, $id): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $notification = DashboardNotification::forUser($user)->find($id);
        if (!$notification) {
            return response()->json(['error' => 'Notification not found or access denied'], 404);
        }

        $notification->update(['is_read' => true]);

        return response()->json([
            'success' => true,
            'id' => (int) $id,
            'is_read' => true,
        ]);
    }

    /**
     * Mark all notifications for this user as read
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $affected = DashboardNotification::forUser($user)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json([
            'success' => true,
            'affected' => $affected,
        ]);
    }
}
