<?php

namespace App\Console\Commands;

use App\Services\GoogleService;
use Illuminate\Console\Command;

class ColorSheetRows extends Command
{
    protected $signature   = 'issues:color-rows {--reset : Reset all data rows to white and isolate status coloring to Column F}';
    protected $description = 'Color-code all existing rows in the active Google Sheet according to their category, or reset to clean white.';

    public function handle(GoogleService $google): int
    {
        $allSheets = $google->listSheets(true);

        if ($this->option('reset')) {
            $this->info("Resetting issue sheets to clean white background...");
            foreach ($allSheets as $sheetName) {
                try {
                    $google->resetIssueSheetRowColors($sheetName);
                    $this->line("  ✓ Restored clean look for sheet [{$sheetName}].");
                } catch (\Throwable $e) {
                    $this->warn("  ✗ Failed on [{$sheetName}]: " . $e->getMessage());
                }
            }
            $this->info("Done! Clean white rows restored across all sheets.");
            return Command::SUCCESS;
        }

        foreach ($allSheets as $sheetName) {
            $this->info("Applying department colors to rows in [{$sheetName}]...");
            try {
                $count = $google->colorSheetRowsByDepartment($sheetName);
                $this->info("  ✓ Applied department colors to {$count} rows and restored soft Status rules on [{$sheetName}].");
            } catch (\Throwable $e) {
                $this->warn("  ✗ Failed on [{$sheetName}]: " . $e->getMessage());
            }

            $google->clearCache($sheetName);
        }

        $this->newLine();
        $this->info("Done! Department colors restored and Status rules applied to Column F across all sheets.");

        return Command::SUCCESS;
    }
}
