<?php

use App\Http\Controllers\ApprovalTicketController;
use App\Http\Controllers\Auth\EmailUpdateController;
use App\Http\Controllers\BotControlController;
use App\Http\Controllers\LeanController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\PushSubscriptionController;
use App\Http\Controllers\TelunasWifiBypassController;
use App\Http\Controllers\UserController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', [LeanController::class, 'index'])
    ->middleware('auth')
    ->name('dashboard');

Route::get('/csrf-token', function () {
    return response()->json([
        'csrf_token' => csrf_token(),
    ]);
})->name('csrf.token');

// Legacy /dashboard deep links (Web Push / old bookmarks) redirect seamlessly to official '/' tracker
Route::get('/dashboard', function (Request $request) {
    $qs = $request->getQueryString();
    return redirect($qs ? '/?' . $qs : '/');
})->middleware('auth');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::patch('/profile/whatsapp', [ProfileController::class, 'updateWhatsApp'])->name('profile.whatsapp');
    Route::patch('/profile/notification-preferences', [ProfileController::class, 'updateNotificationPreferences'])->name('profile.notificationPreferences');
    Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar'])->name('profile.avatar.update');
    Route::delete('/profile/avatar', [ProfileController::class, 'destroyAvatar'])->name('profile.avatar.destroy');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    Route::get('/users', [UserController::class, 'index'])->name('users.index');

    // Approval Tickets - Disabled and Redirected to Dashboard
    Route::redirect('/tickets', '/')->name('tickets.index');
    Route::redirect('/approvals', '/');
    Route::get('/tickets/export-data', [ApprovalTicketController::class, 'exportData'])->name('tickets.exportData');
    Route::post('/tickets/sync-sheet', [ApprovalTicketController::class, 'syncSheet'])->name('tickets.syncSheet');
    Route::post('/tickets/whatsapp', [ApprovalTicketController::class, 'storeWhatsappTicket'])->name('tickets.whatsapp');
    Route::post('/tickets/password', [ApprovalTicketController::class, 'storePasswordResetTicket'])->name('tickets.password');
    Route::post('/tickets/department-transfer', [ApprovalTicketController::class, 'storeDepartmentTransferTicket'])->name('tickets.departmentTransfer');
    Route::post('/tickets/name-change', [ApprovalTicketController::class, 'storeNameChangeTicket'])->name('tickets.nameChange');
    Route::post('/tickets/{id}/hod-action', [ApprovalTicketController::class, 'hodAction'])->name('tickets.hodAction');
    Route::post('/tickets/{id}/admin-action', [ApprovalTicketController::class, 'adminAction'])->name('tickets.adminAction');
    Route::post('/tickets/check-whatsapp', [ApprovalTicketController::class, 'checkWhatsAppNumber'])->name('tickets.checkWhatsApp');

    // Dashboard Notifications Center
    Route::get('/notifications', [NotificationController::class, 'getNotifications'])->name('notifications.index');
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markAsRead'])->name('notifications.read');
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead'])->name('notifications.readAll');

    // Bot Status & Lifecycle Control (Admin Only for lifecycle actions)
    Route::get('/bot/status', [BotControlController::class, 'getBotStatus'])->name('bot.status');
    Route::post('/api/bot/start', [BotControlController::class, 'startBot'])->middleware('throttle:60,1');
    Route::post('/api/bot/stop', [BotControlController::class, 'stopBot'])->middleware('throttle:60,1');
    Route::post('/api/bot/restart', [BotControlController::class, 'restartBot'])->middleware('throttle:60,1');
    Route::get('/api/bot/logs', [BotControlController::class, 'getBotLogs'])->middleware('throttle:120,1');
    Route::get('/api/bot/auth-state', [BotControlController::class, 'getBotAuthState'])->middleware('throttle:120,1');
    Route::get('/api/bot/auth-stats', [BotControlController::class, 'getBotAuthStats'])->middleware('throttle:120,1');
    Route::post('/api/bot/cleanup', [BotControlController::class, 'cleanupBotAuth'])->middleware('throttle:30,1');
    Route::post('/api/bot/pair-phone', [BotControlController::class, 'pairBotPhone'])->middleware('throttle:30,1');
    Route::post('/api/bot/unlink', [BotControlController::class, 'unlinkBot'])->middleware('throttle:30,1');
    Route::get('/api/bot/public-contact', [BotControlController::class, 'getPublicBotContact'])->middleware('throttle:120,1');
});

// Telunas Issue Tracker API Endpoints
Route::prefix('api')->group(function () {
    // Strictly Bot-Only Endpoints
    Route::middleware('bot.key')->group(function () {
        Route::get('/staff-directory', [ProfileController::class, 'staffDirectory']);
        Route::post('/reset-whatsapp-password', [ProfileController::class, 'resetPasswordViaWhatsApp'])->middleware('throttle:15,1');
    });

    // Bot Status endpoint accessible by Logged-in Web Users OR Authenticated WhatsApp Bot
    Route::middleware('bot.or.auth')->group(function () {
        Route::get('/bot/status', [BotControlController::class, 'getBotStatus']);
    });

    // Admin User Management, Audit Logs & Web Push Notifications
    Route::middleware('auth')->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::post('/users/batch-permissions', [UserController::class, 'batchUpdatePermissions']);
        Route::match(['post', 'delete'], '/users/batch-destroy', [UserController::class, 'batchDestroy']);
        Route::post('/users/batch-restore', [UserController::class, 'batchRestore']);
        Route::match(['put', 'patch', 'post'], '/users/{id}', [UserController::class, 'update']);
        Route::delete('/users/{id}', [UserController::class, 'destroy']);
        Route::post('/users/{id}/restore', [UserController::class, 'restore']);
        Route::post('/users/{id}/reset-password', [UserController::class, 'resetPassword']);
        Route::post('/users/{id}/toggle-hod', [UserController::class, 'toggleHod']);
        Route::get('/user-audit-logs', [UserController::class, 'auditLogs']);
        Route::post('/user-audit-logs/sync-sheet', [UserController::class, 'syncAuditSheet']);

        // Web Push Subscriptions & Mobile Pop-up Notifications
        Route::get('/push-subscriptions/vapid-public-key', [PushSubscriptionController::class, 'getVapidPublicKey']);
        Route::post('/push-subscriptions', [PushSubscriptionController::class, 'subscribe']);
        Route::post('/push-subscriptions/delete', [PushSubscriptionController::class, 'unsubscribe']);
        Route::post('/push-subscriptions/test', [PushSubscriptionController::class, 'sendTest']);
    });
});

// Telunas Wi-Fi Restriction & Leader Bypass Routes
Route::get('/telunas-wifi-required', [TelunasWifiBypassController::class, 'show'])->name('telunas.wifi.required');
Route::post('/telunas-wifi-bypass', [TelunasWifiBypassController::class, 'verify'])->middleware('throttle:5,1')->name('telunas.wifi.bypass');

// Official Issue Tracker Routes — Mandatory Authentication
Route::middleware('auth')->group(function () {
    Route::get('/lapangan', [LeanController::class, 'index'])->name('lean.index');
    Route::post('/lapangan/issues', [LeanController::class, 'store'])->name('lean.store');
    Route::post('/lapangan/issues/{issue}/acc', [LeanController::class, 'acc'])->name('lean.acc');
    Route::post('/lapangan/issues/{issue}/claim', [LeanController::class, 'claim'])->name('lean.claim');
    Route::post('/lapangan/issues/{issue}/progress', [LeanController::class, 'updateProgress'])->name('lean.progress');
    Route::post('/lapangan/issues/{issue}/pending', [LeanController::class, 'pending'])->name('lean.pending');
    Route::post('/lapangan/issues/{issue}/resolve', [LeanController::class, 'resolve'])->name('lean.resolve');
    Route::post('/lapangan/issues/{issue}/transfer', [LeanController::class, 'transfer'])->name('lean.transfer');
    Route::delete('/lapangan/issues/{issue}', [LeanController::class, 'destroy'])->name('lean.destroy');
    Route::post('/lapangan/sync-sheets', [LeanController::class, 'syncGoogleSheets'])->name('lean.sync.sheets');
    Route::post('/lapangan/auto-sync', [LeanController::class, 'autoSyncSheets'])->name('lean.auto.sync');
});

// Dedicated API endpoints for WhatsApp Bot V2 (Strictly protected by X-Bot-Key)
Route::middleware('bot.key')->group(function () {
    Route::get('/api/lean/issues', [LeanController::class, 'apiIndex'])->name('lean.api.index');
    Route::post('/api/lean/issues', [LeanController::class, 'apiStore'])->name('lean.api.store');
    Route::post('/api/lean/issues/{id}/claim', [LeanController::class, 'apiClaim'])->name('lean.api.claim');
    Route::post('/api/lean/issues/{id}/resolve', [LeanController::class, 'apiResolve'])->name('lean.api.resolve');
    Route::post('/api/lean/issues/{id}/transfer', [LeanController::class, 'apiTransfer'])->name('lean.api.transfer');
    Route::post('/api/lean/issues/{id}/pending', [LeanController::class, 'apiPending'])->name('lean.api.pending');
});

require __DIR__.'/auth.php';


