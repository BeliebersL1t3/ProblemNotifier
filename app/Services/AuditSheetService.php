<?php

namespace App\Services;

use App\Models\UserAuditLog;
use Carbon\Carbon;
use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\BatchUpdateSpreadsheetRequest;
use Google\Service\Sheets\ClearValuesRequest;
use Google\Service\Sheets\Request;
use Google\Service\Sheets\ValueRange;
use Illuminate\Support\Facades\Log;

class AuditSheetService
{
    private ?Sheets $sheets = null;
    private string $spreadsheetId;
    private string $sheetName = 'Sheet1';

    public function __construct()
    {
        $this->spreadsheetId = (string) (config('services.google.audit_spreadsheet_id') 
            ?: env('GOOGLE_AUDIT_SPREADSHEET_ID', '11FJllelJdd37tR9dUnCawgU1iycm6bQOLMgHM2t-z84'));
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
            'ID Log',
            'Waktu Kejadian (WIB)',
            'Tipe Aksi',
            'Admin Pelaksana',
            'Target Akun / Pengguna',
            'Keterangan & Rincian Perubahan',
            'Alamat IP',
        ];
    }

    public static function formatActionLabel(?string $action): string
    {
        return match ($action) {
            'USER_CREATED'                  => 'Akun Baru Dibuat',
            'USER_UPDATED'                  => 'Profil / Izin Diperbarui',
            'USER_ARCHIVED'                 => 'Di-Archive (Soft Delete)',
            'USER_RESTORED'                 => 'Akun Dipulihkan',
            'PASSWORD_RESET'                => 'Reset Password Akun',
            'BATCH_PERMISSIONS_UPDATED',
            'USER_PERMISSIONS_BATCH_UPDATED'=> 'Update Wewenang Massal',
            'BATCH_USERS_ARCHIVED'          => 'Hapus Massal (Soft Delete)',
            'BATCH_USERS_RESTORED'          => 'Pemulihan Massal',
            'USER_PROMOTED_HOD'             => 'Diangkat Menjadi HOD',
            'USER_DEMOTED_HOD'              => 'Status HOD Dicabut',
            default                         => (string) $action,
        };
    }

    public static function formatChangesSummary(?array $changes): string
    {
        if (empty($changes)) {
            return '-';
        }

        // Case 1: Batch Action
        if (!empty($changes['batch'])) {
            $count = $changes['account_count'] ?? 0;
            $action = $changes['action_applied'] ?? 'Aksi Massal';
            $names = [];
            if (!empty($changes['accounts']) && is_array($changes['accounts'])) {
                foreach ($changes['accounts'] as $acc) {
                    $names[] = ($acc['name'] ?? 'Akun') . (!empty($acc['department']) ? " ({$acc['department']})" : '');
                }
            }
            $skipped = !empty($changes['skipped_accounts']) ? " | Dilewati: " . implode(', ', $changes['skipped_accounts']) : '';
            return "Total {$count} Akun [Aksi: {$action}]. Rincian: " . implode('; ', $names) . $skipped;
        }

        // Case 2: Password Reset
        if (!empty($changes['reset_to'])) {
            return "Password akun direset ke: {$changes['reset_to']}";
        }

        // Case 3: User Created
        if (!empty($changes['created_user'])) {
            $u = $changes['created_user'];
            return "Nama: {$u['name']}, Email: {$u['email']}, Role: " . strtoupper($u['role'] ?? '-') . (!empty($u['department']) ? ", Dept: {$u['department']}" : '') . (!empty($u['is_hod']) ? ' (HOD)' : '');
        }

        // Case 4: User Archived / Restored
        if (!empty($changes['archived_user'])) {
            $u = $changes['archived_user'];
            return "Akun di-archive (Soft Delete): {$u['name']} ({$u['email']})";
        }
        if (!empty($changes['restored_user'])) {
            $u = $changes['restored_user'];
            return "Akun dipulihkan kembali: {$u['name']} ({$u['email']})";
        }

        // Case 5: Standard User Update (Before -> After)
        if (!empty($changes['before']) && !empty($changes['after'])) {
            $before = $changes['before'];
            $after = $changes['after'];
            $diffs = [];

            foreach ($after as $key => $newVal) {
                $oldVal = $before[$key] ?? null;
                if ($oldVal != $newVal) {
                    if ($key === 'permissions' && is_array($newVal)) {
                        $diffs[] = "Hak Akses Diperbarui";
                    } elseif ($key === 'password_reset' && $newVal) {
                        $diffs[] = "Password Diubah";
                    } else {
                        $oldStr = is_bool($oldVal) ? ($oldVal ? 'Ya' : 'Tidak') : ($oldVal ?? '-');
                        $newStr = is_bool($newVal) ? ($newVal ? 'Ya' : 'Tidak') : ($newVal ?? '-');
                        $diffs[] = ucfirst(str_replace('_', ' ', $key)) . ": {$oldStr} -> {$newStr}";
                    }
                }
            }

            return count($diffs) > 0 ? implode(' | ', $diffs) : 'Tidak ada perubahan data';
        }

        // Case 6: HOD toggle
        if (isset($changes['is_hod'])) {
            $status = $changes['is_hod'] ? 'Diangkat HOD' : 'Dicabut dari HOD';
            $title = !empty($changes['hod_title']) ? " (Gelar: {$changes['hod_title']})" : '';
            return "{$status}{$title}";
        }

        return json_encode($changes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function formatRow(UserAuditLog $log): array
    {
        $wibTime = $log->created_at 
            ? Carbon::parse($log->created_at)->setTimezone('Asia/Jakarta')->format('Y-m-d H:i:s') . ' WIB'
            : '-';

        return [
            (string) $log->id,
            $wibTime,
            self::formatActionLabel($log->action),
            $log->admin_name ?: ($log->admin?->staff_name ?: ($log->admin?->name ?: 'System')),
            $log->target_user_name ?: ($log->targetUser?->staff_name ?: ($log->targetUser?->name ?: 'Multi Akun')),
            self::formatChangesSummary($log->changes),
            ($log->ip_address === '::1' ? '127.0.0.1' : ($log->ip_address ?: '-')),
        ];
    }

    private array $sheetCache = [];

    /**
     * Map Carbon/string date to Indonesian abbreviated month name tab (e.g. "Okt 2026").
     */
    public static function getSheetTitleForDate(?string $dateString = null): string
    {
        $carbon = $dateString 
            ? Carbon::parse($dateString)->setTimezone('Asia/Jakarta') 
            : Carbon::now('Asia/Jakarta');

        $monthNum = (int) $carbon->format('n');
        $year = $carbon->format('Y');

        $months = [
            1 => 'Jan', 2 => 'Feb', 3 => 'Mar', 4 => 'Apr', 5 => 'Mei', 6 => 'Jun',
            7 => 'Jul', 8 => 'Agu', 9 => 'Sep', 10 => 'Okt', 11 => 'Nov', 12 => 'Des'
        ];

        $mName = $months[$monthNum] ?? $carbon->format('M');
        return "{$mName} {$year}";
    }

    /**
     * Retrieve and cache current sheet titles and IDs from the spreadsheet.
     *
     * @return array<string, int> [sheetTitle => sheetId]
     */
    private function getSpreadsheetSheets(): array
    {
        try {
            $service = $this->getSheetsService();
            $spreadsheet = $service->spreadsheets->get($this->spreadsheetId);
            $sheetsMap = [];

            foreach ($spreadsheet->getSheets() as $sheet) {
                $props = $sheet->getProperties();
                if ($props) {
                    $sheetsMap[$props->getTitle()] = (int) $props->getSheetId();
                }
            }

            $this->sheetCache = $sheetsMap;
            return $sheetsMap;
        } catch (\Throwable $e) {
            Log::warning('AuditSheetService: failed to get sheets metadata: ' . $e->getMessage());
            return $this->sheetCache;
        }
    }

    /**
     * Ensure a specific monthly tab exists in the spreadsheet.
     * If 'Sheet1' is present, rename it to $sheetTitle. Otherwise, create a new sheet tab.
     */
    public function ensureSheetExists(string $sheetTitle): int
    {
        if (empty($this->sheetCache)) {
            $this->getSpreadsheetSheets();
        }

        // 1. If tab already exists, return its sheetId
        if (isset($this->sheetCache[$sheetTitle])) {
            return $this->sheetCache[$sheetTitle];
        }

        $service = $this->getSheetsService();

        // 2. If default 'Sheet1' exists, rename it to the target monthly title
        if (isset($this->sheetCache['Sheet1'])) {
            try {
                $sheet1Id = $this->sheetCache['Sheet1'];
                $renameRequest = new Request([
                    'updateSheetProperties' => [
                        'properties' => [
                            'sheetId' => $sheet1Id,
                            'title'   => $sheetTitle,
                        ],
                        'fields' => 'title',
                    ],
                ]);

                $batchUpdate = new BatchUpdateSpreadsheetRequest(['requests' => [$renameRequest]]);
                $service->spreadsheets->batchUpdate($this->spreadsheetId, $batchUpdate);

                unset($this->sheetCache['Sheet1']);
                $this->sheetCache[$sheetTitle] = $sheet1Id;

                $this->ensureHeaderAndStyling($sheet1Id, $sheetTitle);
                return $sheet1Id;
            } catch (\Throwable $e) {
                Log::warning("AuditSheetService: failed to rename Sheet1 to '{$sheetTitle}': " . $e->getMessage());
            }
        }

        // 3. Otherwise, create a new sheet tab with $sheetTitle
        try {
            $addSheetRequest = new Request([
                'addSheet' => [
                    'properties' => [
                        'title' => $sheetTitle,
                    ],
                ],
            ]);

            $batchUpdate = new BatchUpdateSpreadsheetRequest(['requests' => [$addSheetRequest]]);
            $response = $service->spreadsheets->batchUpdate($this->spreadsheetId, $batchUpdate);

            $newSheetId = (int) $response->getReplies()[0]->getAddSheet()->getProperties()->getSheetId();
            $this->sheetCache[$sheetTitle] = $newSheetId;

            $this->ensureHeaderAndStyling($newSheetId, $sheetTitle);
            return $newSheetId;
        } catch (\Throwable $e) {
            Log::warning("AuditSheetService: failed to add sheet '{$sheetTitle}': " . $e->getMessage());
            return $this->sheetCache[$sheetTitle] ?? 0;
        }
    }

    /**
     * Ensure headers and styling on the specific monthly sheet tab.
     */
    public function ensureHeaderAndStyling(?int $sheetId = null, ?string $sheetTitle = null): void
    {
        try {
            $service = $this->getSheetsService();

            if ($sheetTitle === null) {
                $sheetTitle = self::getSheetTitleForDate();
            }

            if ($sheetId === null) {
                if (empty($this->sheetCache)) {
                    $this->getSpreadsheetSheets();
                }
                $sheetId = $this->sheetCache[$sheetTitle] ?? 0;
            }

            // 1. Write Header row values: 'Okt 2026'!A1:G1
            $headerRange = "'{$sheetTitle}'!A1:G1";
            $valueRange = new ValueRange([
                'values' => [self::getHeaders()],
            ]);
            $service->spreadsheets_values->update($this->spreadsheetId, $headerRange, $valueRange, [
                'valueInputOption' => 'USER_ENTERED',
            ]);

            // 2. Style headers: Charcoal background #1C1B0E, Gold text #C9AA71, Bold, Freeze Row 1
            $requests = [
                // Freeze row 1
                new Request([
                    'updateSheetProperties' => [
                        'properties' => [
                            'sheetId' => $sheetId,
                            'gridProperties' => [
                                'frozenRowCount' => 1,
                            ],
                        ],
                        'fields' => 'gridProperties.frozenRowCount',
                    ],
                ]),
                // Style Header Row 1
                new Request([
                    'repeatCell' => [
                        'range' => [
                            'sheetId'          => $sheetId,
                            'startRowIndex'    => 0,
                            'endRowIndex'      => 1,
                            'startColumnIndex' => 0,
                            'endColumnIndex'   => 7,
                        ],
                        'cell' => [
                            'userEnteredFormat' => [
                                'backgroundColor' => [
                                    'red'   => 0.110,
                                    'green' => 0.106,
                                    'blue'  => 0.055,
                                ],
                                'textFormat' => [
                                    'foregroundColor' => [
                                        'red'   => 0.788,
                                        'green' => 0.667,
                                        'blue'  => 0.443,
                                    ],
                                    'fontSize' => 10,
                                    'bold'     => true,
                                ],
                                'horizontalAlignment' => 'CENTER',
                                'verticalAlignment'   => 'MIDDLE',
                                'wrapStrategy'        => 'WRAP',
                            ],
                        ],
                        'fields' => 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
                    ],
                ]),
                // Set Column Widths
                new Request([
                    'updateDimensionProperties' => [
                        'range' => [
                            'sheetId'    => $sheetId,
                            'dimension'  => 'COLUMNS',
                            'startIndex' => 0,
                            'endIndex'   => 1,
                        ],
                        'properties' => ['pixelSize' => 80], // ID
                        'fields'     => 'pixelSize',
                    ],
                ]),
                new Request([
                    'updateDimensionProperties' => [
                        'range' => [
                            'sheetId'    => $sheetId,
                            'dimension'  => 'COLUMNS',
                            'startIndex' => 1,
                            'endIndex'   => 2,
                        ],
                        'properties' => ['pixelSize' => 180], // Waktu
                        'fields'     => 'pixelSize',
                    ],
                ]),
                new Request([
                    'updateDimensionProperties' => [
                        'range' => [
                            'sheetId'    => $sheetId,
                            'dimension'  => 'COLUMNS',
                            'startIndex' => 2,
                            'endIndex'   => 3,
                        ],
                        'properties' => ['pixelSize' => 180], // Tipe Aksi
                        'fields'     => 'pixelSize',
                    ],
                ]),
                new Request([
                    'updateDimensionProperties' => [
                        'range' => [
                            'sheetId'    => $sheetId,
                            'dimension'  => 'COLUMNS',
                            'startIndex' => 3,
                            'endIndex'   => 4,
                        ],
                        'properties' => ['pixelSize' => 160], // Admin
                        'fields'     => 'pixelSize',
                    ],
                ]),
                new Request([
                    'updateDimensionProperties' => [
                        'range' => [
                            'sheetId'    => $sheetId,
                            'dimension'  => 'COLUMNS',
                            'startIndex' => 4,
                            'endIndex'   => 5,
                        ],
                        'properties' => ['pixelSize' => 220], // Target
                        'fields'     => 'pixelSize',
                    ],
                ]),
                new Request([
                    'updateDimensionProperties' => [
                        'range' => [
                            'sheetId'    => $sheetId,
                            'dimension'  => 'COLUMNS',
                            'startIndex' => 5,
                            'endIndex'   => 6,
                        ],
                        'properties' => ['pixelSize' => 400], // Keterangan
                        'fields'     => 'pixelSize',
                    ],
                ]),
                new Request([
                    'updateDimensionProperties' => [
                        'range' => [
                            'sheetId'    => $sheetId,
                            'dimension'  => 'COLUMNS',
                            'startIndex' => 6,
                            'endIndex'   => 7,
                        ],
                        'properties' => ['pixelSize' => 130], // IP
                        'fields'     => 'pixelSize',
                    ],
                ]),
            ];

            $batchUpdate = new BatchUpdateSpreadsheetRequest(['requests' => $requests]);
            $service->spreadsheets->batchUpdate($this->spreadsheetId, $batchUpdate);
        } catch (\Throwable $e) {
            Log::warning('AuditSheetService: failed to ensure header/styling: ' . $e->getMessage());
        }
    }

    /**
     * Format a decorative monthly divider row (kept for utility/backward compatibility).
     */
    public static function formatMonthSeparator(string $monthKey): array
    {
        $carbon = Carbon::createFromFormat('Y-m', $monthKey)->locale('id');
        $monthName = strtoupper($carbon->translatedFormat('F Y'));

        return [
            "📅 {$monthName}",
            "=== AWAL PERIODE BULAN {$monthName} ===",
            "---",
            "---",
            "---",
            "---",
            "---",
        ];
    }

    /**
     * Real-time append single log to its respective monthly sheet tab. Non-blocking & silent on failure.
     */
    public function appendLog(UserAuditLog $log): bool
    {
        try {
            $service = $this->getSheetsService();
            $sheetTitle = self::getSheetTitleForDate($log->created_at ? (string) $log->created_at : null);

            // Ensure the monthly sheet exists and is styled
            $this->ensureSheetExists($sheetTitle);

            $rowsToAppend = [self::formatRow($log)];

            $valueRange = new ValueRange(['values' => $rowsToAppend]);
            $service->spreadsheets_values->append($this->spreadsheetId, "'{$sheetTitle}'!A:G", $valueRange, [
                'valueInputOption' => 'USER_ENTERED',
                'insertDataOption' => 'INSERT_ROWS',
            ]);

            return true;
        } catch (\Throwable $e) {
            Log::warning("AuditSheetService: failed to append log #{$log->id} to '{$sheetTitle}': " . $e->getMessage());
            return false;
        }
    }

    /**
     * Full synchronization: rewrite all logs cleanly distributed into their respective monthly sheets.
     */
    public function syncAllLogs(): array
    {
        $service = $this->getSheetsService();

        // 1. Fetch all logs ordered chronologically
        $logs = UserAuditLog::with(['admin', 'targetUser'])->orderBy('id', 'asc')->get();

        // 2. Group logs by monthly tab title (e.g. "Okt 2026")
        $grouped = $logs->groupBy(function ($log) {
            return self::getSheetTitleForDate($log->created_at ? (string) $log->created_at : null);
        });

        // If no logs, ensure at least current month sheet exists
        if ($grouped->isEmpty()) {
            $currentTitle = self::getSheetTitleForDate();
            $sheetId = $this->ensureSheetExists($currentTitle);
            $this->ensureHeaderAndStyling($sheetId, $currentTitle);

            return [
                'success'   => true,
                'count'     => 0,
                'sheet_url' => $this->getSpreadsheetUrl(),
                'message'   => 'Belum ada data riwayat audit untuk disinkronkan.',
            ];
        }

        $totalRowsSynced = 0;
        $syncedSheets = [];

        foreach ($grouped as $sheetTitle => $monthLogs) {
            // Ensure monthly sheet tab exists and is formatted
            $sheetId = $this->ensureSheetExists($sheetTitle);

            // Clear previous records in this sheet (from row 2 downwards)
            try {
                $service->spreadsheets_values->clear(
                    $this->spreadsheetId,
                    "'{$sheetTitle}'!A2:Z",
                    new ClearValuesRequest()
                );
            } catch (\Throwable $e) {
                Log::warning("AuditSheetService: error clearing '{$sheetTitle}': " . $e->getMessage());
            }

            // Ensure header row is intact
            $this->ensureHeaderAndStyling($sheetId, $sheetTitle);

            // Build rows
            $rows = [];
            foreach ($monthLogs as $log) {
                $rows[] = self::formatRow($log);
            }

            if (!empty($rows)) {
                $range = "'{$sheetTitle}'!A2:G" . (count($rows) + 1);
                $valueRange = new ValueRange(['values' => $rows]);
                $service->spreadsheets_values->update($this->spreadsheetId, $range, $valueRange, [
                    'valueInputOption' => 'USER_ENTERED',
                ]);

                $totalRowsSynced += count($rows);
                $syncedSheets[] = $sheetTitle;
            }
        }

        $sheetsListStr = implode(', ', $syncedSheets);

        return [
            'success'   => true,
            'count'     => $totalRowsSynced,
            'sheet_url' => $this->getSpreadsheetUrl(),
            'message'   => "Berhasil menyinkronkan {$totalRowsSynced} data audit ke dalam " . count($syncedSheets) . " tab bulanan ({$sheetsListStr}) di Google Spreadsheet.",
        ];
    }
}
