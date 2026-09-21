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
        $this->info("Starting Operations Google Sheets beautification...");

        try {
            $result = $google->formatAllOpsSheets();
            $this->info("✓ " . ($result['message'] ?? 'Successfully formatted sheets.'));
        } catch (\Throwable $e) {
            $this->error("Failed to format operations sheets: " . $e->getMessage());
            return Command::FAILURE;
        }

        return Command::SUCCESS;
    }
}
