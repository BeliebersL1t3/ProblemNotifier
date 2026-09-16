<?php

namespace App\Console\Commands;

use App\Http\Controllers\OperationsController;
use App\Services\GoogleService;
use Illuminate\Console\Command;

class SyncGoogleCalendar extends Command
{
    protected $signature = 'calendar:sync-gcal';
    protected $description = 'Pull updates and deletions from Google Calendar to Google Sheets and notify on deleted tasks';

    public function handle(GoogleService $googleService, OperationsController $operationsController)
    {
        $this->info("Starting Google Calendar synchronization...");

        try {
            $result = $googleService->pullFromGoogleCalendar();
            $updated = $result['updated'] ?? 0;
            $deleted = $result['deleted'] ?? 0;

            $this->info("Calendar sync completed: {$updated} updated, {$deleted} marked deleted.");

            if (!empty($result['newlyDeletedTasks'])) {
                $count = count($result['newlyDeletedTasks']);
                $this->info("Sending WhatsApp & Dashboard alerts for {$count} newly deleted tasks...");
                $operationsController->sendCalendarDeletionNotification($result['newlyDeletedTasks']);
            }

            return 0;
        } catch (\Throwable $e) {
            $this->error("Failed to sync Google Calendar: " . $e->getMessage());
            return 1;
        }
    }
}
