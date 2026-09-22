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
    public function getNotifications(Request $request): JsonResponse
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['tickets' => [], 'issues' => [], 'unread_count' => 0]);
        }

        $allNotifications = DashboardNotification::forUser($user)
            ->latest()
            ->take(40)
            ->get();

        $issues = $allNotifications->filter(function ($n) {
            return $n->type === 'issue_progress';
        })->values();

        $tickets = $allNotifications->filter(function ($n) {
            return $n->type !== 'issue_progress';
        })->values();

        $unreadCount = $allNotifications->where('is_read', false)->count();

        return response()->json([
            'tickets' => $tickets,
            'issues' => $issues,
            'unread_count' => $unreadCount,
        ]);
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
