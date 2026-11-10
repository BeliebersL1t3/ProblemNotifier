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
            'Aktif di Dashboard',
            'Dihapus Oleh',
            'Waktu Dihapus',
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

        $isActive = $issue->trashed() ? 0 : 1;
        $deletedBy = $issue->trashed() ? ($issue->deleted_by_name ?: 'Supervisor') : '';
        $deletedAt = ($issue->trashed() && $issue->deleted_at)
            ? Carbon::parse($issue->deleted_at)->setTimezone('Asia/Jakarta')->format('Y-m-d H:i')
            : '';

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
            $isActive,
            $deletedBy,
            $deletedAt,
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

            // 1. Update header values A1:R1
            $body = new ValueRange(['values' => $headers]);
            $service->spreadsheets_values->update(
                $this->spreadsheetId,
                "{$monthName}!A1:R1",
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
                        'endColumnIndex' => 18,
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

        if (empty($gids)) {
            throw new \RuntimeException('Gagal mengambil daftar tab Google Sheets (koneksi atau kredensial bermasalah).');
        }

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
            $service->spreadsheets_values->clear(
                $this->spreadsheetId,
                "{$monthName}!A2:R1000",
                new \Google\Service\Sheets\ClearValuesRequest()
            );

            if (!empty($rows)) {
                $endRow = count($rows) + 1;
                $body = new ValueRange(['values' => $rows]);
                $service->spreadsheets_values->update(
                    $this->spreadsheetId,
                    "{$monthName}!A2:R{$endRow}",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            }

            $syncedCounts[$monthName] = count($rows);
        }

        $now = now();
        LeanIssue::withTrashed()->update([
            'needs_sheets_sync' => false,
            'sheets_synced_at'  => $now,
            'sheets_sync_error' => null,
        ]);
        Cache::forget('lean_sheets_pending_clear');

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
                    "{$monthName}!A{$foundRowIndex}:R{$foundRowIndex}",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            } else {
                // Append new row
                $body = new ValueRange(['values' => [$row]]);
                $service->spreadsheets_values->append(
                    $this->spreadsheetId,
                    "{$monthName}!A:R",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            }

            $issue->markSheetsSynced();
            return true;
        } catch (\Throwable $e) {
            $issue->markSheetsSyncFailed($e->getMessage());
            Log::error("Failed to sync single issue #{$issue->id} to Lean Sheet: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Mark single issue as inactive (0) in Google Sheets when deleted from issue detail modal.
     */
    public function deleteSingleIssue(LeanIssue $issue, string $deletedBy = 'Supervisor'): bool
    {
        try {
            $service = $this->getSheetsService();
            $monthName = self::getMonthNameForDate($issue->created_at);
            $code = \App\Services\GoogleSheetsSyncService::formatIssueCode($issue);

            // Search row index by ticket code in Column A
            $existing = $service->spreadsheets_values->get($this->spreadsheetId, "{$monthName}!A:A");
            $values = $existing->getValues() ?: [];

            $foundRowIndex = null;
            foreach ($values as $idx => $r) {
                if (!empty($r[0]) && trim($r[0]) === $code) {
                    $foundRowIndex = $idx + 1; // 1-based index
                    break;
                }
            }

            $deletedAt = $issue->deleted_at
                ? Carbon::parse($issue->deleted_at)->setTimezone('Asia/Jakarta')->format('Y-m-d H:i')
                : Carbon::now('Asia/Jakarta')->format('Y-m-d H:i');

            if ($foundRowIndex !== null) {
                // Update columns P, Q, R (Aktif di Dashboard, Dihapus Oleh, Waktu Dihapus)
                $body = new ValueRange(['values' => [[0, $deletedBy, $deletedAt]]]);
                $service->spreadsheets_values->update(
                    $this->spreadsheetId,
                    "{$monthName}!P{$foundRowIndex}:R{$foundRowIndex}",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
                $issue->markSheetsSynced();
                return true;
            }

            // If not found in sheet yet, sync entire row with trashed status
            return $this->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            $issue->markSheetsSyncFailed($e->getMessage());
            Log::error("Failed to mark issue #{$issue->id} as deleted in Lean Sheet: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Clear all monthly data rows (A2:R1000) across all 12 tabs for sandbox reset.
     */
    public function clearAllMonthlyData(): bool
    {
        try {
            $service = $this->getSheetsService();
            $gids = $this->getMonthGids(true);

            if (empty($gids)) {
                throw new \RuntimeException('Gagal mengambil metadata tab Google Sheets saat membersihkan data.');
            }

            foreach (self::MONTH_NAMES as $monthName) {
                if (!isset($gids[$monthName])) {
                    continue;
                }
                $service->spreadsheets_values->clear(
                    $this->spreadsheetId,
                    "{$monthName}!A2:R1000",
                    new \Google\Service\Sheets\ClearValuesRequest()
                );
            }

            // Ensure 18-column headers and teal formatting are present on all 12 tabs
            $this->setupHeadersAndFormatting();
            Cache::forget('lean_sheets_pending_clear');

            return true;
        } catch (\Throwable $e) {
            Log::error("Failed to clear monthly data in Lean Sheet: " . $e->getMessage());
            return false;
        }
    }

    public static function markPendingClear(): void
    {
        Cache::forever('lean_sheets_pending_clear', true);
    }

    public static function hasPendingClear(): bool
    {
        return (bool) Cache::get('lean_sheets_pending_clear', false);
    }

    /**
     * Self-healing background reconciliation for any pending SQL-to-Sheets changes.
     */
    public function reconcilePendingIssues(int $limit = 30): array
    {
        $lock = Cache::lock('lean_sheets_reconcile_lock', 30);
        if (!$lock->get()) {
            return [
                'success' => true,
                'skipped' => true,
                'reason'  => 'Reconciliation already in progress.',
                'synced'  => 0,
                'failed'  => 0,
                'remaining' => LeanIssue::withTrashed()->where('needs_sheets_sync', true)->count(),
            ];
        }

        try {
            if (self::hasPendingClear()) {
                $cleared = $this->clearAllMonthlyData();
                if (!$cleared) {
                    return [
                        'success'   => false,
                        'skipped'   => false,
                        'synced'    => 0,
                        'failed'    => 1,
                        'remaining' => LeanIssue::withTrashed()->where('needs_sheets_sync', true)->count(),
                    ];
                }
            }

            $pendingIssues = LeanIssue::withTrashed()
                ->where('needs_sheets_sync', true)
                ->orderBy('id', 'asc')
                ->limit($limit)
                ->get();

            $synced = 0;
            $failed = 0;

            foreach ($pendingIssues as $issue) {
                if ($this->syncSingleIssue($issue)) {
                    $synced++;
                } else {
                    $failed++;
                }
            }

            $remaining = LeanIssue::withTrashed()->where('needs_sheets_sync', true)->count();

            return [
                'success'   => $failed === 0 && !self::hasPendingClear(),
                'skipped'   => false,
                'synced'    => $synced,
                'failed'    => $failed,
                'remaining' => $remaining,
            ];
        } finally {
            $lock->release();
        }
    }
}
