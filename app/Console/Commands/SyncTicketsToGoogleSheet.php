<?php

namespace App\Console\Commands;

use App\Services\TicketSheetService;
use Illuminate\Console\Command;

class SyncTicketsToGoogleSheet extends Command
{
    protected $signature = 'tickets:sync-sheet';
    protected $description = 'Sync all approval tickets from database to Google Spreadsheet';

    public function handle(TicketSheetService $service)
    {
        $this->info("Starting Google Sheet sync for ticketing history...");

        try {
            $count = $service->syncAllTickets();
            $this->info("Successfully synced {$count} tickets to Google Sheet!");
            return 0;
        } catch (\Throwable $e) {
            $this->error("Failed to sync tickets: " . $e->getMessage());
            return 1;
        }
    }
}
