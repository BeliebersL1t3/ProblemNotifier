<?php

namespace App\Console\Commands;

use App\Services\LeanSheetDirectService;
use Illuminate\Console\Command;

class SyncLeanSheetCommand extends Command
{
    protected $signature = 'telunas:sync-lean-sheet';
    protected $description = 'Synchronize all database issues into monthly tabs of the official Lean Google Spreadsheet';

    public function handle(LeanSheetDirectService $service): int
    {
        $this->info('Starting Lean Google Spreadsheet monthly sync...');
        $this->line('Spreadsheet ID: ' . $service->getSpreadsheetId());

        try {
            $result = $service->syncAllIssues();
            $this->info("Sync completed successfully!");
            $this->line("Total issues synced: " . $result['total_issues']);
            $this->table(
                ['Bulan', 'Jumlah Tiket Disinkron'],
                collect($result['by_month'])->map(fn($count, $month) => [$month, $count])->toArray()
            );
            $this->info("Spreadsheet URL: " . $result['spreadsheet_url']);
            return Command::SUCCESS;
        } catch (\Throwable $e) {
            $this->error("Failed to sync Lean sheet: " . $e->getMessage());
            return Command::FAILURE;
        }
    }
}
