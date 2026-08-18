<?php

use App\Http\Controllers\IssueController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ProfileController;
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
    return Inertia::render('Analytics');
})->middleware(['auth', 'verified'])->name('analytics');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

// CampusFix API Endpoints
Route::prefix('api')->group(function () {
    Route::get('/issues', [IssueController::class, 'index']);
    Route::post('/issues', [IssueController::class, 'store']);
    Route::post('/issues/{rowIndex}/claim', [IssueController::class, 'claim']);
    Route::post('/issues/{rowIndex}/pending', [IssueController::class, 'pending']);
    Route::post('/issues/{rowIndex}/resolve', [IssueController::class, 'resolve']);
    Route::post('/issues/{rowIndex}/category', [IssueController::class, 'updateCategory']);
    // Sheet (period/year) management
    Route::get('/sheets', [IssueController::class, 'listSheets']);
    Route::post('/sheets', [IssueController::class, 'createSheet']);
    Route::delete('/sheets', [IssueController::class, 'deleteSheet']);
    // Categories management
    Route::get('/categories', [CategoryController::class, 'index']);
    Route::post('/categories', [CategoryController::class, 'store']);
    Route::post('/categories/delete-and-reassign', [CategoryController::class, 'destroyAndReassign']);
});

require __DIR__.'/auth.php';

