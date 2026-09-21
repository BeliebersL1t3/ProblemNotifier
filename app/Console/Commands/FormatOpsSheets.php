<?php

namespace App\Console\Commands;

use App\Services\GoogleService;
use Illuminate\Console\Command;

class FormatOpsSheets extends Command
{
    protected $signature = 'ops:format-sheets {--reset-issues : Also reset issue sheets to clean white rows with Column F status styling}';
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

        if ($this->option('reset-issues')) {
            $this->info("Resetting issue sheets to clean white background with status highlights...");
            try {
                $allSheets = $google->listSheets(true);
                foreach ($allSheets as $sheetName) {
                    $google->resetIssueSheetRowColors($sheetName);
                    $this->line("  ✓ Restored clean look for issue sheet [{$sheetName}].");
                }
                $this->info("✓ Issue sheets restored successfully.");
            } catch (\Throwable $e) {
                $this->warn("Failed to reset some issue sheets: " . $e->getMessage());
            }
        }

        return Command::SUCCESS;
    }
}
