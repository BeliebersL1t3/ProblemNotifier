<?php

use App\Http\Controllers\ApprovalTicketController;
use App\Http\Controllers\Auth\EmailUpdateController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ExportEmailController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\IssueController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\OperationsController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ReportScheduleController;
use App\Http\Controllers\UserController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return redirect()->route('login');
});

Route::get('/dashboard', function () {
    return Inertia::render('Dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

Route::get('/analytics', function () {
    $user = auth()->user();
    if ($user && !$user->hasPermission('can_access_analytics')) {
        return redirect()->route('dashboard')->with('error', 'Akses ke halaman Analytics dibatasi oleh Administrator.');
    }
    return Inertia::render('Analytics');
})->middleware(['auth', 'verified'])->name('analytics');

Route::get('/operations', function () {
    return redirect()->route('calendar');
})->middleware(['auth', 'verified'])->name('operations');

Route::get('/calendar', function () {
    $user = auth()->user();
    if ($user && !$user->hasPermission('can_access_calendar')) {
        return redirect()->route('dashboard')->with('error', 'Akses ke Kalender Operasional dibatasi oleh Administrator.');
    }
    return Inertia::render('Calendar');
})->middleware(['auth', 'verified'])->name('calendar');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::patch('/profile/whatsapp', [ProfileController::class, 'updateWhatsApp'])->name('profile.whatsapp');
    Route::patch('/profile/notification-preferences', [ProfileController::class, 'updateNotificationPreferences'])->name('profile.notificationPreferences');
    Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar'])->name('profile.avatar.update');
    Route::delete('/profile/avatar', [ProfileController::class, 'destroyAvatar'])->name('profile.avatar.destroy');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    Route::get('/users', [UserController::class, 'index'])->name('users.index');

    // Approval Tickets
    Route::get('/tickets', [ApprovalTicketController::class, 'index'])->name('tickets.index');
    Route::get('/tickets/export-data', [ApprovalTicketController::class, 'exportData'])->name('tickets.exportData');
    Route::post('/tickets/sync-sheet', [ApprovalTicketController::class, 'syncSheet'])->name('tickets.syncSheet');
    Route::post('/tickets/whatsapp', [ApprovalTicketController::class, 'storeWhatsappTicket'])->name('tickets.whatsapp');
    Route::post('/tickets/password', [ApprovalTicketController::class, 'storePasswordResetTicket'])->name('tickets.password');
    Route::post('/tickets/department-transfer', [ApprovalTicketController::class, 'storeDepartmentTransferTicket'])->name('tickets.departmentTransfer');
    Route::post('/tickets/{id}/hod-action', [ApprovalTicketController::class, 'hodAction'])->name('tickets.hodAction');
    Route::post('/tickets/{id}/admin-action', [ApprovalTicketController::class, 'adminAction'])->name('tickets.adminAction');

    // Dashboard Notifications Center
    Route::get('/notifications', [NotificationController::class, 'getNotifications'])->name('notifications.index');
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markAsRead'])->name('notifications.read');
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead'])->name('notifications.readAll');

    // PDF Export Email Dispatch
    Route::get('/api/export/recipients', [ExportEmailController::class, 'getRecipients'])->name('export.recipients');
    Route::post('/api/export/email-pdf', [ExportEmailController::class, 'sendPdfReport'])->middleware('throttle:10,1')->name('export.emailPdf');

    // Automated Monthly Report Scheduling (Admin & HOD)
    Route::get('/api/report-schedule', [ReportScheduleController::class, 'getSettings'])->name('report.schedule.get');
    Route::post('/api/report-schedule', [ReportScheduleController::class, 'updateSettings'])->name('report.schedule.update');
    Route::post('/api/report-schedule/test', [ReportScheduleController::class, 'testDispatch'])->middleware('throttle:5,1')->name('report.schedule.test');

    // Mandatory Real Email Transition
    Route::post('/api/user/update-real-email', [EmailUpdateController::class, 'updateRealEmail'])->name('user.updateRealEmail');

    // Google OAuth (Gmail API) Connection
    Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect'])->name('google.redirect');
    Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback'])->name('google.callback');
    Route::post('/auth/google/disconnect', [GoogleAuthController::class, 'disconnect'])->name('google.disconnect');
    Route::get('/api/google/status', [GoogleAuthController::class, 'status'])->name('google.status');
});

// CampusFix API Endpoints
Route::prefix('api')->group(function () {
    // Strictly Bot-Only Endpoints
    Route::middleware('bot.key')->group(function () {
        Route::get('/staff-directory', [ProfileController::class, 'staffDirectory']);
        Route::post('/reset-whatsapp-password', [ProfileController::class, 'resetPasswordViaWhatsApp'])->middleware('throttle:15,1');
    });

    // Endpoints Accessible by Logged-in Web Users OR Authenticated WhatsApp Bot
    Route::middleware('bot.or.auth')->group(function () {
        Route::get('/issues', [IssueController::class, 'index']);
        Route::get('/issues/lookup/{id?}', [IssueController::class, 'lookup']);
        Route::post('/issues', [IssueController::class, 'store'])->middleware('throttle:45,1');
        Route::match(['post', 'patch'], '/issues/{rowIndex}/update', [IssueController::class, 'update']);
        Route::delete('/issues/{rowIndex}', [IssueController::class, 'destroy']);
        Route::post('/issues/{rowIndex}/claim', [IssueController::class, 'claim']);
        Route::post('/issues/{rowIndex}/pending', [IssueController::class, 'pending']);
        Route::post('/issues/{rowIndex}/resolve', [IssueController::class, 'resolve']);
        Route::post('/issues/{rowIndex}/restore', [IssueController::class, 'restore']);
        Route::post('/issues/{rowIndex}/category', [IssueController::class, 'updateCategory']);

        // Sheet (period/year) management
        Route::get('/sheets', [IssueController::class, 'listSheets']);
        Route::post('/sheets', [IssueController::class, 'createSheet']);
        Route::delete('/sheets', [IssueController::class, 'deleteSheet']);

        // Categories management
        Route::get('/categories', [CategoryController::class, 'index']);
        Route::post('/categories', [CategoryController::class, 'store']);
        Route::post('/categories/delete-and-reassign', [CategoryController::class, 'destroyAndReassign']);

        // Operations — Department Work Board
        Route::get('/operations', [OperationsController::class, 'index']);
        Route::post('/operations', [OperationsController::class, 'store']);
        Route::post('/operations/sync-calendar', [OperationsController::class, 'syncCalendar']);
        Route::post('/operations/pull-calendar', [OperationsController::class, 'pullCalendar']);
        Route::post('/operations/restore-task', [OperationsController::class, 'restoreTask']);
        Route::get('/operations/calendar-logs', [OperationsController::class, 'calendarLogs']);
        Route::post('/operations/format-sheets', [OperationsController::class, 'formatSheets']);
        Route::match(['patch', 'post'], '/operations/{rowIndex}', [OperationsController::class, 'update']);
        Route::delete('/operations/{rowIndex}', [OperationsController::class, 'destroy']);
    });
    // Admin User Management & Audit Logs
    Route::middleware('auth')->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::post('/users/batch-permissions', [UserController::class, 'batchUpdatePermissions']);
        Route::match(['put', 'patch', 'post'], '/users/{id}', [UserController::class, 'update']);
        Route::delete('/users/{id}', [UserController::class, 'destroy']);
        Route::post('/users/{id}/restore', [UserController::class, 'restore']);
        Route::post('/users/{id}/reset-password', [UserController::class, 'resetPassword']);
        Route::post('/users/{id}/toggle-hod', [UserController::class, 'toggleHod']);
        Route::get('/user-audit-logs', [UserController::class, 'auditLogs']);
    });
});

require __DIR__.'/auth.php';

