<?php

namespace App\Console\Commands;

use App\Http\Controllers\OperationsController;
use App\Models\CalendarSyncLog;
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
            $created = $result['created'] ?? 0;
            $updated = $result['updated'] ?? 0;
            $deleted = $result['deleted'] ?? 0;

            $this->info("Calendar sync completed: {$created} created, {$updated} updated, {$deleted} marked deleted.");

            if (!empty($result['newlyDeletedTasks'])) {
                $count = count($result['newlyDeletedTasks']);
                $this->info("Sending WhatsApp & Dashboard alerts for {$count} newly deleted tasks...");
                $operationsController->sendCalendarDeletionNotification($result['newlyDeletedTasks']);
            }

            if ($created > 0 || $updated > 0 || $deleted > 0) {
                CalendarSyncLog::record(
                    action: 'AUTO_SYNC',
                    performedBy: 'System Scheduler',
                    status: 'success',
                    details: [
                        'created_tasks' => $created,
                        'updated_tasks' => $updated,
                        'deleted_tasks' => $deleted,
                    ],
                    message: "Auto-sync berhasil: {$created} jadwal baru, {$updated} diperbarui, {$deleted} ditandai dihapus."
                );
            }

            return 0;
        } catch (\Throwable $e) {
            $this->error("Failed to sync Google Calendar: " . $e->getMessage());

            CalendarSyncLog::record(
                action: 'AUTO_SYNC',
                performedBy: 'System Scheduler',
                status: 'failed',
                message: $e->getMessage()
            );

            return 1;
        }
    }
}
