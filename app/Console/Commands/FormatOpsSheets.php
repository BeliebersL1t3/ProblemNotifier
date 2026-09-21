<?php

namespace App\Console\Commands;

use App\Services\GoogleService;
use Illuminate\Console\Command;

class FormatOpsSheets extends Command
{
    protected $signature = 'ops:format-sheets';
    protected $description = 'Format and beautify all Operations Google Sheets tabs (Ops_*) with navy headers, borders, and status colors.';

    public function handle(GoogleService $google): int
    {
        $this->info("Starting Operations Google Sheets beautification & notes migration...");

        try {
            $migration = $google->migrateOpsNotesToScheduleBlocks();
            $this->info("✓ " . ($migration['message'] ?? 'Successfully migrated notes & schedule blocks.'));
        } catch (\Throwable $e) {
            $this->error("Failed to migrate operations notes: " . $e->getMessage());
            return Command::FAILURE;
        }

        return Command::SUCCESS;
    }
}
