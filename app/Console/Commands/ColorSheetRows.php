<?php

namespace App\Console\Commands;

use App\Services\GoogleService;
use Illuminate\Console\Command;

class ColorSheetRows extends Command
{
    protected $signature   = 'issues:color-rows';
    protected $description = 'Color-code all existing rows in the active Google Sheet according to their category.';

    public function handle(GoogleService $google): int
    {
        $allSheets = $google->listSheets(true);

        foreach ($allSheets as $sheetName) {
            $google->setSheet($sheetName);
            $rows = $google->getRows(true);
            if (empty($rows)) {
                $this->info("Skipping empty sheet [{$sheetName}].");
                continue;
            }

            $this->info("Processing " . count($rows) . " rows in sheet [{$sheetName}]...");

            // 1. Re-color each row by its category
            foreach ($rows as $index => $row) {
                $rowIndex = $index + 2; // Row 1 is header
                $category = $row[4] ?? 'other'; // Column E is category
                try {
                    $google->colorRowByCategory($rowIndex, $category);
                    $this->line("  ✓ Row {$rowIndex} [{$category}] colored");
                    usleep(150000); // 0.15s delay to prevent API quota limits
                } catch (\Throwable $e) {
                    $this->warn("  ✗ Row {$rowIndex} failed: " . $e->getMessage());
                }
            }

            // 2. Clear old whole-row rules & apply conditional format ONLY to Column F
            try {
                $google->setupActiveSheetFormatting($sheetName);
                $this->info("  ✓ Applied Column F status rules, text wrapping & top alignment to [{$sheetName}].");
            } catch (\Throwable $e) {
                $this->warn("  ✗ Could not apply rules to [{$sheetName}]: " . $e->getMessage());
            }

            $google->clearCache($sheetName);
        }

        $this->newLine();
        $this->info("Done! Category colors restored and Status rules isolated to Column F across all sheets.");

        return Command::SUCCESS;
    }
}
