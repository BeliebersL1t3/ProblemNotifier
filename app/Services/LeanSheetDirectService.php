<?php

namespace App\Services;

use App\Models\LeanIssue;
use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\BatchUpdateSpreadsheetRequest;
use Google\Service\Sheets\ValueRange;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class LeanSheetDirectService
{
    private ?Sheets $sheets = null;
    private string $spreadsheetId;

    public const MONTH_NAMES = [
        1 => 'Januari',
        2 => 'Februari',
        3 => 'Maret',
        4 => 'April',
        5 => 'Mei',
        6 => 'Juni',
        7 => 'Juli',
        8 => 'Agustus',
        9 => 'September',
        10 => 'Oktober',
        11 => 'November',
        12 => 'Desember',
    ];

    public function __construct()
    {
        $this->spreadsheetId = (string) (config('services.google.lean_spreadsheet_id')
            ?: env('GOOGLE_LEAN_SPREADSHEET_ID', '1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg'));
    }

    private function getSheetsService(): Sheets
    {
        if ($this->sheets === null) {
            $client = new Client();
            $credentialsPath = storage_path(config('services.google.credentials_path', 'app/google-credentials.json'));
            $client->setAuthConfig($credentialsPath);
            $client->addScope([Sheets::SPREADSHEETS]);
            $this->sheets = new Sheets($client);
        }

        return $this->sheets;
    }

    public function getSpreadsheetId(): string
    {
        return $this->spreadsheetId;
    }

    public function getSpreadsheetUrl(): string
    {
        return "https://docs.google.com/spreadsheets/d/{$this->spreadsheetId}/edit?usp=sharing";
    }

    public static function getHeaders(): array
    {
        return [
            'Kode Tiket',
            'Waktu Lapor',
            'Pelapor',
            'Dept Pelapor',
            'Lokasi',
            'Judul Masalah',
            'Deskripsi Awal',
            'Departemen Dituju',
            'Status',
            'Alasan Pending',
            'Diambil Oleh',
            'Waktu Diambil',
            'Diselesaikan Oleh',
            'Waktu Selesai',
            'Catatan Penyelesaian',
        ];
    }

    /**
     * Map a Carbon/date to Indonesian month name (e.g. "Oktober").
     */
    public static function getMonthNameForDate($date = null): string
    {
        $carbon = $date ? Carbon::parse($date)->setTimezone('Asia/Jakarta') : Carbon::now('Asia/Jakarta');
        $m = (int) $carbon->format('n');
        return self::MONTH_NAMES[$m] ?? 'Januari';
    }

    /**
     * Get associative array of [monthTitle => sheetId (gid)].
     */
    public function getMonthGids(bool $refresh = false): array
    {
        $cacheKey = "lean_sheet_gids_{$this->spreadsheetId}";
        if (!$refresh && Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        try {
            $service = $this->getSheetsService();
            $meta = $service->spreadsheets->get($this->spreadsheetId);
            $gids = [];
            foreach ($meta->getSheets() as $s) {
                $p = $s->getProperties();
                $gids[$p->getTitle()] = (int) $p->getSheetId();
            }
            Cache::put($cacheKey, $gids, 86400); // 24 hours
            return $gids;
        } catch (\Throwable $e) {
            Log::error("Failed to fetch Lean Sheet GIDs: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Format a LeanIssue model into a 15-column array matching the header.
     */
    public function formatIssueRow(LeanIssue $issue): array
    {
        $code = \App\Services\GoogleSheetsSyncService::formatIssueCode($issue);

        // Target departments
        $targetDepts = $issue->target_departments;
        if (is_array($targetDepts)) {
            $targetDeptsStr = implode(', ', $targetDepts);
        } elseif (is_string($targetDepts)) {
            $decoded = json_decode($targetDepts, true);
            $targetDeptsStr = is_array($decoded) ? implode(', ', $decoded) : $targetDepts;
        } else {
            $targetDeptsStr = 'Umum';
        }

        // Status label
        $statusLabels = [
            'open'        => 'Open',
            'in_progress' => 'In Progress',
            'pending'     => 'Pending',
            'resolved'    => 'Resolved',
        ];
        $statusStr = $statusLabels[strtolower($issue->status)] ?? ucfirst($issue->status ?: 'Open');

        $pendingReason = '';
        if ($issue->status === 'pending') {
            $pendingReason = preg_replace('/^Pending:\s*/i', '', $issue->resolution_note ?? '');
        }

        return [
            $code,
            $issue->created_at ? $issue->created_at->setTimezone('Asia/Jakarta')->format('Y-m-d H:i') : '',
            $issue->reporter_name ?: '-',
            $issue->reporter_dept ?: '-',
            $issue->location ?: '-',
            $issue->title ?: '-',
            $issue->description ?: '-',
            $targetDeptsStr,
            $statusStr,
            $pendingReason,
            $issue->claimed_by_name ?: '',
            $issue->claimed_at ? Carbon::parse($issue->claimed_at)->setTimezone('Asia/Jakarta')->format('Y-m-d H:i') : '',
            $issue->resolved_by_name ?: '',
            $issue->resolved_at ? Carbon::parse($issue->resolved_at)->setTimezone('Asia/Jakarta')->format('Y-m-d H:i') : '',
            $issue->resolution_note ?: '',
        ];
    }

    /**
     * Ensure headers and styling on all 12 monthly tabs.
     */
    public function setupHeadersAndFormatting(): void
    {
        $service = $this->getSheetsService();
        $gids = $this->getMonthGids(true);
        $headers = [self::getHeaders()];

        $headerRequests = [];
        foreach (self::MONTH_NAMES as $monthName) {
            if (!isset($gids[$monthName])) {
                continue;
            }
            $sheetId = $gids[$monthName];

            // 1. Update header values A1:O1
            $body = new ValueRange(['values' => $headers]);
            $service->spreadsheets_values->update(
                $this->spreadsheetId,
                "{$monthName}!A1:O1",
                $body,
                ['valueInputOption' => 'USER_ENTERED']
            );

            // 2. Format Header Row (Teal #134e4a, White bold text, Center aligned)
            $headerRequests[] = new \Google\Service\Sheets\Request([
                'repeatCell' => [
                    'range' => [
                        'sheetId' => $sheetId,
                        'startRowIndex' => 0,
                        'endRowIndex' => 1,
                        'startColumnIndex' => 0,
                        'endColumnIndex' => 15,
                    ],
                    'cell' => [
                        'userEnteredFormat' => [
                            'backgroundColor' => [
                                'red'   => 0.075, // #134e4a
                                'green' => 0.306,
                                'blue'  => 0.290,
                            ],
                            'textFormat' => [
                                'bold' => true,
                                'foregroundColor' => [
                                    'red' => 1.0,
                                    'green' => 1.0,
                                    'blue' => 1.0,
                                ],
                                'fontSize' => 10,
                            ],
                            'horizontalAlignment' => 'CENTER',
                            'verticalAlignment'   => 'MIDDLE',
                        ],
                    ],
                    'fields' => 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                ],
            ]);

            // Set Row 1 height to 34px
            $headerRequests[] = new \Google\Service\Sheets\Request([
                'updateDimensionProperties' => [
                    'range' => [
                        'sheetId' => $sheetId,
                        'dimension' => 'ROWS',
                        'startIndex' => 0,
                        'endIndex' => 1,
                    ],
                    'properties' => [
                        'pixelSize' => 34,
                    ],
                    'fields' => 'pixelSize',
                ],
            ]);
        }

        if (!empty($headerRequests)) {
            $batch = new BatchUpdateSpreadsheetRequest(['requests' => $headerRequests]);
            $service->spreadsheets->batchUpdate($this->spreadsheetId, $batch);
        }
    }

    /**
     * Synchronize all issues from database into their respective month tabs.
     */
    public function syncAllIssues(): array
    {
        $service = $this->getSheetsService();
        $this->setupHeadersAndFormatting();
        $gids = $this->getMonthGids();

        $allIssues = LeanIssue::withTrashed()->orderBy('id', 'asc')->get();

        // Group issues by month
        $byMonth = [];
        foreach (self::MONTH_NAMES as $num => $monthName) {
            $byMonth[$monthName] = [];
        }

        foreach ($allIssues as $issue) {
            $monthName = self::getMonthNameForDate($issue->created_at);
            if (!isset($byMonth[$monthName])) {
                $byMonth[$monthName] = [];
            }
            $byMonth[$monthName][] = $this->formatIssueRow($issue);
        }

        $syncedCounts = [];

        foreach ($byMonth as $monthName => $rows) {
            if (!isset($gids[$monthName])) {
                continue;
            }

            // Clear existing rows below header
            try {
                $service->spreadsheets_values->clear(
                    $this->spreadsheetId,
                    "{$monthName}!A2:O500",
                    new \Google\Service\Sheets\ClearValuesRequest()
                );
            } catch (\Throwable $e) {
                // Ignore clear error if already empty
            }

            if (!empty($rows)) {
                $endRow = count($rows) + 1;
                $body = new ValueRange(['values' => $rows]);
                $service->spreadsheets_values->update(
                    $this->spreadsheetId,
                    "{$monthName}!A2:O{$endRow}",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            }

            $syncedCounts[$monthName] = count($rows);
        }

        return [
            'success' => true,
            'total_issues' => $allIssues->count(),
            'by_month' => $syncedCounts,
            'spreadsheet_url' => $this->getSpreadsheetUrl(),
        ];
    }

    /**
     * Sync single issue when created or updated.
     */
    public function syncSingleIssue(LeanIssue $issue): bool
    {
        try {
            $service = $this->getSheetsService();
            $monthName = self::getMonthNameForDate($issue->created_at);
            $row = $this->formatIssueRow($issue);
            $code = $row[0];

            // Check if row already exists in month tab
            $existing = $service->spreadsheets_values->get($this->spreadsheetId, "{$monthName}!A:A");
            $values = $existing->getValues() ?: [];

            $foundRowIndex = null;
            foreach ($values as $idx => $r) {
                if (!empty($r[0]) && trim($r[0]) === $code) {
                    $foundRowIndex = $idx + 1; // 1-based index
                    break;
                }
            }

            if ($foundRowIndex !== null) {
                // Update existing row
                $body = new ValueRange(['values' => [$row]]);
                $service->spreadsheets_values->update(
                    $this->spreadsheetId,
                    "{$monthName}!A{$foundRowIndex}:O{$foundRowIndex}",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            } else {
                // Append new row
                $body = new ValueRange(['values' => [$row]]);
                $service->spreadsheets_values->append(
                    $this->spreadsheetId,
                    "{$monthName}!A:O",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            }

            return true;
        } catch (\Throwable $e) {
            Log::error("Failed to sync single issue #{$issue->id} to Lean Sheet: " . $e->getMessage());
            return false;
        }
    }
}
