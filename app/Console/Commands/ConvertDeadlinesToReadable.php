<?php

namespace App\Console\Commands;

use App\Services\GoogleService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class ConvertDeadlinesToReadable extends Command
{
    protected $signature   = 'issues:convert-deadlines {--dry-run : Only display what would be converted without modifying Google Sheets}';
    protected $description = 'Converts numeric epoch millisecond timestamps in Column R (Deadline) to human-readable datetime strings across all Google Sheets.';

    public function handle(GoogleService $google): int
    {
        $isDryRun = $this->option('dry-run');
        if ($isDryRun) {
            $this->warn("Running in DRY-RUN mode. No changes will be written to Google Sheets.");
        }

        $allSheets = $google->listSheets(true);
        $totalConverted = 0;

        foreach ($allSheets as $sheetName) {
            // Ignore ticket approval sheets (only process issue operational sheets)
            if (stripos($sheetName, 'ticket') !== false) {
                continue;
            }

            $google->setSheet($sheetName);
            $rows = $google->getRows(true);
            if (empty($rows)) {
                continue;
            }

            $sheetConverted = 0;

            foreach ($rows as $index => $row) {
                $rowIndex = $index + 2; // Row 1 is header
                $rawDeadline = trim($row[17] ?? '');

                if (empty($rawDeadline)) {
                    continue;
                }

                // Check if it's numeric timestamp (e.g. 1789385400000)
                if (is_numeric($rawDeadline)) {
                    $timestamp = (float)$rawDeadline;
                    if ($timestamp < 10000000000) {
                        $timestamp *= 1000;
                    }

                    $readableDate = Carbon::createFromTimestampMs($timestamp, 'Asia/Jakarta')->format('Y-m-d H:i:s');
                    $this->line("  [{$sheetName}] Row {$rowIndex} (Issue ID: " . ($row[0] ?? '-') . "): '{$rawDeadline}' → '{$readableDate}'");

                    if (!$isDryRun) {
                        try {
                            $google->updateRow($rowIndex, ['R' => $readableDate], $sheetName);
                            usleep(100000); // 0.1s throttle for API quota
                        } catch (\Throwable $e) {
                            $this->error("  ✗ Failed to update row {$rowIndex}: " . $e->getMessage());
                        }
                    }

                    $sheetConverted++;
                    $totalConverted++;
                }
            }

            if ($sheetConverted > 0) {
                $this->info("✓ Sheet [{$sheetName}]: {$sheetConverted} rows converted.");
                if (!$isDryRun) {
                    $google->clearCache($sheetName);
                }
            }
        }

        $this->info("Completed! Total deadlines converted: {$totalConverted}");
        return 0;
    }
}
