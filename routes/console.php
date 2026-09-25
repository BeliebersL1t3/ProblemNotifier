<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('calendar:sync-gcal')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('report:send-monthly')
    ->dailyAt('08:00')
    ->withoutOverlapping()
    ->runInBackground();

// Automatically prune expired sessions and finished queue batches to keep the database slim
Schedule::command('session:prune')
    ->daily()
    ->runInBackground();

Schedule::command('queue:prune-batches')
    ->daily()
    ->runInBackground();



