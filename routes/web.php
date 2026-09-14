<?php

use App\Http\Controllers\IssueController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\OperationsController;
use App\Http\Controllers\ProfileController;
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
    Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar'])->name('profile.avatar.update');
    Route::delete('/profile/avatar', [ProfileController::class, 'destroyAvatar'])->name('profile.avatar.destroy');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    Route::get('/users', [UserController::class, 'index'])->name('users.index');
});

// CampusFix API Endpoints
Route::prefix('api')->group(function () {
    Route::get('/staff-directory', [ProfileController::class, 'staffDirectory']);
    Route::post('/link-whatsapp-staff', [ProfileController::class, 'linkStaffFromWhatsApp']);
    Route::post('/reset-whatsapp-password', [ProfileController::class, 'resetPasswordViaWhatsApp']);
    Route::get('/issues', [IssueController::class, 'index']);
    Route::get('/issues/lookup/{id?}', [IssueController::class, 'lookup']);
    Route::post('/issues', [IssueController::class, 'store']);
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
    Route::match(['patch', 'post'], '/operations/{rowIndex}', [OperationsController::class, 'update']);
    Route::delete('/operations/{rowIndex}', [OperationsController::class, 'destroy']);
    // Admin User Management & Audit Logs
    Route::middleware('auth')->group(function () {
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::post('/users/batch-permissions', [UserController::class, 'batchUpdatePermissions']);
        Route::match(['put', 'patch', 'post'], '/users/{id}', [UserController::class, 'update']);
        Route::delete('/users/{id}', [UserController::class, 'destroy']);
        Route::post('/users/{id}/restore', [UserController::class, 'restore']);
        Route::post('/users/{id}/reset-password', [UserController::class, 'resetPassword']);
        Route::get('/user-audit-logs', [UserController::class, 'auditLogs']);
    });
});

require __DIR__.'/auth.php';

