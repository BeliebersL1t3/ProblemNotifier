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

    /**
     * Ensure headers and styling on the target spreadsheet.
     */
    public function ensureHeaderAndStyling(): void
    {
        try {
            $service = $this->getSheetsService();
            $spreadsheet = $service->spreadsheets->get($this->spreadsheetId);
            $sheetId = $spreadsheet->getSheets()[0]->getProperties()->getSheetId() ?? 0;
            $sheetTitle = $spreadsheet->getSheets()[0]->getProperties()->getTitle() ?? 'Sheet1';

            // 1. Write Header row values
            $headerRange = "{$sheetTitle}!A1:G1";
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
     * Real-time append single log to sheet. Non-blocking & silent on failure.
     */
    public function appendLog(UserAuditLog $log): bool
    {
        try {
            $service = $this->getSheetsService();
            $row = self::formatRow($log);

            $valueRange = new ValueRange(['values' => [$row]]);
            $service->spreadsheets_values->append($this->spreadsheetId, 'Sheet1!A:G', $valueRange, [
                'valueInputOption' => 'USER_ENTERED',
                'insertDataOption' => 'INSERT_ROWS',
            ]);

            return true;
        } catch (\Throwable $e) {
            Log::warning("AuditSheetService: failed to append log #{$log->id}: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Full synchronization: rewrite all logs to the Google Sheet cleanly.
     */
    public function syncAllLogs(): array
    {
        $service = $this->getSheetsService();
        $spreadsheet = $service->spreadsheets->get($this->spreadsheetId);
        $sheetTitle = $spreadsheet->getSheets()[0]->getProperties()->getTitle() ?? 'Sheet1';

        // 1. Clear existing sheet values
        try {
            $service->spreadsheets_values->clear($this->spreadsheetId, "{$sheetTitle}!A:Z", new ClearValuesRequest());
        } catch (\Throwable $e) {
            Log::warning("AuditSheetService: error clearing sheet: " . $e->getMessage());
        }

        // 2. Setup Headers & Layout Styling
        $this->ensureHeaderAndStyling();

        // 3. Fetch all logs ordered chronologically
        $logs = UserAuditLog::with(['admin', 'targetUser'])->orderBy('id', 'asc')->get();

        $rows = [];
        foreach ($logs as $log) {
            $rows[] = self::formatRow($log);
        }

        if (count($rows) > 0) {
            $range = "{$sheetTitle}!A2:G" . (count($rows) + 1);
            $valueRange = new ValueRange(['values' => $rows]);
            $service->spreadsheets_values->update($this->spreadsheetId, $range, $valueRange, [
                'valueInputOption' => 'USER_ENTERED',
            ]);
        }

        return [
            'success'   => true,
            'count'     => count($rows),
            'sheet_url' => $this->getSpreadsheetUrl(),
            'message'   => 'Berhasil menyinkronkan ' . count($rows) . ' data riwayat audit ke Google Spreadsheet.',
        ];
    }
}
