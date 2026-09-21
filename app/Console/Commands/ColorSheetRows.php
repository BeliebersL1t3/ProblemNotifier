<?php

namespace App\Console\Commands;

use App\Services\GoogleService;
use Illuminate\Console\Command;

class ColorSheetRows extends Command
{
    protected $signature   = 'issues:color-rows';
    protected $description = 'Color-code all existing rows in the active Google Sheet according to their category/department palette.';

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

            $rowColors = [];
            foreach ($rows as $index => $row) {
                $rowIndex = $index + 2; // Row 1 is header
                $category = $row[4] ?? 'other'; // Column E is category
                $rowColors[$rowIndex] = $category;
            }

            try {
                $google->batchColorRows($rowColors);
                $this->info("  ✓ Applied category/department pastel colors to [{$sheetName}].");
            } catch (\Throwable $e) {
                $this->warn("  ✗ Failed on [{$sheetName}]: " . $e->getMessage());
            }

            try {
                $google->setupActiveSheetFormatting($sheetName);
                $this->info("  ✓ Verified Column F status rules on [{$sheetName}].");
            } catch (\Throwable $e) {
                $this->warn("  ✗ Could not apply rules to [{$sheetName}]: " . $e->getMessage());
            }

            $google->clearCache($sheetName);
        }

        $this->newLine();
        $this->info("Done! Colors synchronized across all sheets.");

        return Command::SUCCESS;
    }
}
