<?php

namespace App\Services;

use App\Http\Controllers\LeanController;
use App\Http\Controllers\UserController;
use App\Models\User;
use App\Models\UserAuditLog;
use Carbon\Carbon;
use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\BatchUpdateSpreadsheetRequest;
use Google\Service\Sheets\BatchUpdateValuesRequest;
use Google\Service\Sheets\Request;
use Google\Service\Sheets\ValueRange;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EmployeeSheetService
{
    public const SHEET_TAB_NAME = 'Data Karyawan';

    private ?Sheets $sheets = null;
    private ?string $spreadsheetId = null;
    private string $configPath;

    public function __construct()
    {
        $this->configPath = storage_path('app/employee_spreadsheet_config.json');
        $this->spreadsheetId = $this->loadConfiguredSpreadsheetId();
    }

    /**
     * Load spreadsheet ID from persistent storage or config fallback.
     */
    private function loadConfiguredSpreadsheetId(): ?string
    {
        if (File::exists($this->configPath)) {
            try {
                $content = json_decode(File::get($this->configPath), true);
                if (!empty($content['spreadsheet_id'])) {
                    return trim($content['spreadsheet_id']);
                }
            } catch (\Throwable $e) {
                Log::warning('EmployeeSheetService: Failed parsing employee_spreadsheet_config.json: ' . $e->getMessage());
            }
        }

        $fromConfig = config('services.google.employee_spreadsheet_id') ?: env('GOOGLE_EMPLOYEE_SPREADSHEET_ID');
        return !empty($fromConfig) ? trim($fromConfig) : null;
    }

    /**
     * Save/update spreadsheet ID or URL into local config.
     */
    public function setSpreadsheetId(string $urlOrId): ?string
    {
        $id = self::extractSpreadsheetId($urlOrId);
        if (!$id) {
            return null;
        }

        $this->spreadsheetId = $id;
        File::ensureDirectoryExists(dirname($this->configPath));
        File::put($this->configPath, json_encode([
            'spreadsheet_id' => $id,
            'updated_at'     => Carbon::now('Asia/Jakarta')->toIso8601String(),
        ], JSON_PRETTY_PRINT));

        return $id;
    }

    /**
     * Extract spreadsheet ID from URL or raw ID.
     */
    public static function extractSpreadsheetId(?string $input): ?string
    {
        if (empty($input)) {
            return null;
        }
        $input = trim($input);
        if (preg_match('/spreadsheets\/d\/([a-zA-Z0-9-_]+)/', $input, $matches)) {
            return $matches[1];
        }
        if (preg_match('/^[a-zA-Z0-9-_]{20,}$/', $input)) {
            return $input;
        }
        return null;
    }

    public function getSpreadsheetId(): ?string
    {
        return $this->spreadsheetId;
    }

    public function getSpreadsheetUrl(): ?string
    {
        if (!$this->spreadsheetId) {
            return null;
        }
        return "https://docs.google.com/spreadsheets/d/{$this->spreadsheetId}/edit?usp=sharing";
    }

    /**
     * Obtain Google Sheets service client.
     */
    private function getSheetsService(): Sheets
    {
        if ($this->sheets === null) {
            $client = new Client();
            $credentialsPath = storage_path(config('services.google.credentials_path', 'app/google-credentials.json'));
            if (!File::exists($credentialsPath)) {
                throw new \RuntimeException("Google credentials file not found at: {$credentialsPath}");
            }
            $client->setAuthConfig($credentialsPath);
            $client->addScope([Sheets::SPREADSHEETS]);
            $this->sheets = new Sheets($client);
        }

        return $this->sheets;
    }

    /**
     * Standard 9-column headers for Employee Master Spreadsheet.
     */
    public static function getHeaders(): array
    {
        return [
            'Nama Lengkap',
            'Departemen',
            'Nomor WhatsApp',
            'Email',
            'Password',
            'Role',
            'Subdivisi',
            'Status Akun',
            'Status Sinkronisasi',
        ];
    }

    /**
     * Ensure the target tab exists and headers are styled.
     */
    public function ensureSheetAndHeaders(): string
    {
        if (!$this->spreadsheetId) {
            throw new \RuntimeException('Spreadsheet ID belum dikonfigurasi. Hubungkan spreadsheet terlebih dahulu.');
        }

        $service = $this->getSheetsService();
        $meta = $service->spreadsheets->get($this->spreadsheetId);
        $sheets = $meta->getSheets();

        $targetTitle = null;
        $targetGid = null;

        // Check if tab "Data Karyawan" already exists
        foreach ($sheets as $s) {
            $prop = $s->getProperties();
            if (strcasecmp($prop->getTitle(), self::SHEET_TAB_NAME) === 0) {
                $targetTitle = $prop->getTitle();
                $targetGid = (int) $prop->getSheetId();
                break;
            }
        }

        // If tab doesn't exist, check first tab or add a new sheet
        if (!$targetTitle && !empty($sheets)) {
            $firstSheet = $sheets[0]->getProperties();
            $firstTitle = $firstSheet->getTitle();
            if (strcasecmp($firstTitle, 'Sheet1') === 0 || count($sheets) === 1) {
                // Rename Sheet1 to Data Karyawan
                $targetTitle = self::SHEET_TAB_NAME;
                $targetGid = (int) $firstSheet->getSheetId();
                $renameReq = new Request([
                    'updateSheetProperties' => [
                        'properties' => [
                            'sheetId' => $targetGid,
                            'title'   => self::SHEET_TAB_NAME,
                        ],
                        'fields' => 'title',
                    ],
                ]);
                $service->spreadsheets->batchUpdate($this->spreadsheetId, new BatchUpdateSpreadsheetRequest([
                    'requests' => [$renameReq],
                ]));
            } else {
                // Add new sheet tab
                $addReq = new Request([
                    'addSheet' => [
                        'properties' => [
                            'title' => self::SHEET_TAB_NAME,
                        ],
                    ],
                ]);
                $resp = $service->spreadsheets->batchUpdate($this->spreadsheetId, new BatchUpdateSpreadsheetRequest([
                    'requests' => [$addReq],
                ]));
                $newSheet = $resp->getReplies()[0]->getAddSheet();
                $targetTitle = self::SHEET_TAB_NAME;
                $targetGid = (int) $newSheet->getProperties()->getSheetId();
            }
        }

        // Write header row A1:I1
        $headerValues = [self::getHeaders()];
        $body = new ValueRange(['values' => $headerValues]);
        $service->spreadsheets_values->update(
            $this->spreadsheetId,
            "{$targetTitle}!A1:I1",
            $body,
            ['valueInputOption' => 'USER_ENTERED']
        );

        // Format Header: Emerald Green (#065f46), bold white text, centered
        $formatReq = new Request([
            'repeatCell' => [
                'range' => [
                    'sheetId'          => $targetGid,
                    'startRowIndex'    => 0,
                    'endRowIndex'      => 1,
                    'startColumnIndex' => 0,
                    'endColumnIndex'   => 9,
                ],
                'cell' => [
                    'userEnteredFormat' => [
                        'backgroundColor' => [
                            'red'   => 0.024, // #065f46
                            'green' => 0.373,
                            'blue'  => 0.275,
                        ],
                        'textFormat' => [
                            'bold'            => true,
                            'foregroundColor' => ['red' => 1.0, 'green' => 1.0, 'blue' => 1.0],
                            'fontSize'        => 10,
                        ],
                        'horizontalAlignment' => 'CENTER',
                        'verticalAlignment'   => 'MIDDLE',
                    ],
                ],
                'fields' => 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
            ],
        ]);

        try {
            $service->spreadsheets->batchUpdate($this->spreadsheetId, new BatchUpdateSpreadsheetRequest([
                'requests' => [$formatReq],
            ]));
        } catch (\Throwable $e) {
            Log::warning('EmployeeSheetService header format warning: ' . $e->getMessage());
        }

        return $targetTitle;
    }

    /**
     * Normalize WhatsApp phone number into standard Telunas 628... format.
     */
    public static function normalizePhoneNumber(?string $phone): ?string
    {
        if (empty($phone)) {
            return null;
        }
        $clean = preg_replace('/[^\d]/', '', (string) $phone);
        if (empty($clean)) {
            return null;
        }
        if (str_starts_with($clean, '0')) {
            $clean = '62' . substr($clean, 1);
        } elseif (str_starts_with($clean, '8')) {
            $clean = '628' . substr($clean, 1);
        }
        return $clean;
    }

    /**
     * Check if a string is already a valid Bcrypt hash.
     */
    public static function isBcryptHash(?string $value): bool
    {
        if (empty($value)) {
            return false;
        }
        $val = trim((string) $value);
        // Standard Bcrypt pattern: $2y$10$..., $2a$..., $2b$... (60 chars)
        return (bool) preg_match('/^\$2[ayb]\$\d{2}\$[A-Za-z0-9\.\/]{53}$/', $val);
    }

    /**
     * Sync staff members from the Google Spreadsheet (Option B: Bcrypt hash written back).
     */
    public function syncEmployeesFromSheet(?User $actingAdmin = null): array
    {
        $tabName = $this->ensureSheetAndHeaders();
        $service = $this->getSheetsService();

        // Read all rows from A2 to I
        $range = "{$tabName}!A2:I";
        $response = $service->spreadsheets_values->get($this->spreadsheetId, $range);
        $rows = $response->getValues() ?: [];

        $created = 0;
        $updated = 0;
        $hashedCount = 0;
        $skipped = 0;
        $errors = [];
        $updatesToSheet = []; // Array of ['range' => '...', 'values' => [[...]]]

        $nowStr = Carbon::now('Asia/Jakarta')->format('d/m/Y H:i');

        foreach ($rows as $index => $row) {
            $rowNumber = $index + 2; // 1-indexed, starting after header

            $rawName        = trim($row[0] ?? '');
            $rawDept        = trim($row[1] ?? '');
            $rawPhone       = trim($row[2] ?? '');
            $rawEmail       = trim($row[3] ?? '');
            $rawPassword    = trim($row[4] ?? '');
            $rawRole        = strtolower(trim($row[5] ?? 'staff'));
            $rawSubdivision = trim($row[6] ?? '');
            $rawStatus      = strtolower(trim($row[7] ?? 'aktif'));

            // Empty row check
            if ($rawName === '' && $rawPhone === '' && $rawEmail === '') {
                $skipped++;
                continue;
            }

            // Name is mandatory
            if ($rawName === '') {
                $errMsg = "Baris {$rowNumber}: Nama Lengkap wajib diisi.";
                $errors[] = $errMsg;
                $updatesToSheet[] = [
                    'range'  => "{$tabName}!I{$rowNumber}",
                    'values' => [["Gagal: Nama Kosong ({$nowStr})"]],
                ];
                continue;
            }

            // Phone normalization
            $normalizedPhone = self::normalizePhoneNumber($rawPhone);
            if ($rawPhone !== '' && !$normalizedPhone) {
                $errMsg = "Baris {$rowNumber} ({$rawName}): Nomor WhatsApp tidak valid.";
                $errors[] = $errMsg;
                $updatesToSheet[] = [
                    'range'  => "{$tabName}!I{$rowNumber}",
                    'values' => [["Gagal: No WA Tidak Valid ({$nowStr})"]],
                ];
                continue;
            }

            // Department resolution
            $normalizedDept = LeanController::normalizeDepartment($rawDept) ?: ($rawDept ?: 'Umum');

            // Role resolution
            $role = in_array($rawRole, ['admin', 'administrator', 'spv', 'supervisor'], true) ? 'admin' : 'staff';

            // Active / Archive state
            $isInactive = in_array($rawStatus, ['nonaktif', 'inactive', '0', 'false', 'non-aktif', 'keluar', 'resign'], true);

            // Email resolution
            $email = $rawEmail;
            if ($email === '') {
                $safeNameSlug = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $rawName));
                if ($safeNameSlug === '') {
                    $safeNameSlug = 'staff_' . ($normalizedPhone ?: $rowNumber);
                }
                $email = "{$safeNameSlug}@telunas.internal";
            }

            // Locate existing user (by email or whatsapp_number or staff_name)
            $existingUser = null;
            if (!empty($rawEmail)) {
                $existingUser = User::withTrashed()->where('email', $rawEmail)->first();
            }
            if (!$existingUser && !empty($normalizedPhone)) {
                $existingUser = User::withTrashed()->where('whatsapp_number', $normalizedPhone)->first();
            }
            if (!$existingUser) {
                $existingUser = User::withTrashed()->where('staff_name', $rawName)->first();
            }

            // Password & Bcrypt Handling (Option B)
            $newHashToWriteBack = null;
            $passwordForDb = null;

            if (self::isBcryptHash($rawPassword)) {
                // Cell already holds a Bcrypt hash
                if (!$existingUser) {
                    $passwordForDb = $rawPassword;
                }
            } elseif ($rawPassword !== '') {
                // User typed plain text password! Hash it and prepare to write back to spreadsheet
                $passwordForDb = Hash::make($rawPassword);
                $newHashToWriteBack = $passwordForDb;
                $hashedCount++;
            } else {
                // Password empty in sheet
                if (!$existingUser) {
                    // New user with no password: assign a default secure password
                    $defaultPass = 'Telunas#' . substr($normalizedPhone ?: (string) rand(1000, 9999), -4);
                    $passwordForDb = Hash::make($defaultPass);
                    $newHashToWriteBack = $passwordForDb;
                    $hashedCount++;
                }
            }

            try {
                if ($existingUser) {
                    $before = [
                        'name'            => $existingUser->name,
                        'staff_name'      => $existingUser->staff_name,
                        'email'           => $existingUser->email,
                        'role'            => $existingUser->role,
                        'department'      => $existingUser->department,
                        'subdivision'     => $existingUser->subdivision,
                        'whatsapp_number' => $existingUser->whatsapp_number,
                        'is_active'       => $existingUser->is_active,
                    ];
                    $passwordChanged = !empty($passwordForDb);

                    // Update existing user
                    $existingUser->name = $rawName;
                    $existingUser->staff_name = $rawName;
                    $existingUser->department = $normalizedDept;
                    if ($rawSubdivision !== '') {
                        $existingUser->subdivision = $rawSubdivision;
                    }
                    if ($normalizedPhone) {
                        $existingUser->whatsapp_number = $normalizedPhone;
                    }
                    if (!empty($rawEmail)) {
                        $existingUser->email = $rawEmail;
                    }
                    if ($passwordForDb) {
                        $existingUser->password = $passwordForDb;
                    }
                    $existingUser->role = $role;
                    $existingUser->is_active = !$isInactive;

                    if ($isInactive && !$existingUser->trashed()) {
                        $existingUser->delete();
                    } elseif (!$isInactive && $existingUser->trashed()) {
                        $existingUser->restore();
                    }

                    $existingUser->save();
                    $updated++;

                    $after = [
                        'name'            => $existingUser->name,
                        'staff_name'      => $existingUser->staff_name,
                        'email'           => $existingUser->email,
                        'role'            => $existingUser->role,
                        'department'      => $existingUser->department,
                        'subdivision'     => $existingUser->subdivision,
                        'whatsapp_number' => $existingUser->whatsapp_number,
                        'is_active'       => $existingUser->is_active,
                        'password_reset'  => $passwordChanged,
                    ];

                    if ($actingAdmin) {
                        try {
                            if ($passwordChanged) {
                                UserAuditLog::record(
                                    $actingAdmin,
                                    $existingUser,
                                    'PASSWORD_UPDATED_VIA_SHEET_SYNC',
                                    [
                                        'source'         => 'Google Spreadsheet (Data Karyawan)',
                                        'spreadsheet_id' => $this->spreadsheetId,
                                        'row'            => $rowNumber,
                                        'before'         => $before,
                                        'after'          => $after,
                                    ]
                                );
                            } elseif (
                                $before['name'] !== $after['name'] ||
                                $before['staff_name'] !== $after['staff_name'] ||
                                $before['department'] !== $after['department'] ||
                                $before['role'] !== $after['role'] ||
                                $before['whatsapp_number'] !== $after['whatsapp_number'] ||
                                $before['subdivision'] !== $after['subdivision'] ||
                                $before['email'] !== $after['email'] ||
                                $before['is_active'] !== $after['is_active']
                            ) {
                                UserAuditLog::record(
                                    $actingAdmin,
                                    $existingUser,
                                    'USER_UPDATED_VIA_SHEET_SYNC',
                                    [
                                        'source'         => 'Google Spreadsheet (Data Karyawan)',
                                        'spreadsheet_id' => $this->spreadsheetId,
                                        'row'            => $rowNumber,
                                        'before'         => $before,
                                        'after'          => $after,
                                    ]
                                );
                            }
                        } catch (\Throwable $logEx) {
                            Log::warning("EmployeeSheetService: Failed recording audit log for updated user {$existingUser->id}: " . $logEx->getMessage());
                        }
                    }
                } else {
                    // Create new user
                    $newUser = new User([
                        'name'            => $rawName,
                        'staff_name'      => $rawName,
                        'email'           => $email,
                        'whatsapp_number' => $normalizedPhone,
                        'department'      => $normalizedDept,
                        'subdivision'     => $rawSubdivision ?: null,
                        'role'            => $role,
                        'password'        => $passwordForDb,
                        'is_active'       => !$isInactive,
                        'approval_status' => 'approved',
                        'permissions'     => UserController::getDefaultPermissions($role),
                    ]);
                    $newUser->save();
                    $created++;

                    if ($actingAdmin) {
                        try {
                            UserAuditLog::record(
                                $actingAdmin,
                                $newUser,
                                'USER_CREATED_VIA_SHEET_SYNC',
                                [
                                    'source'         => 'Google Spreadsheet (Data Karyawan)',
                                    'spreadsheet_id' => $this->spreadsheetId,
                                    'row'            => $rowNumber,
                                    'created_user'   => [
                                        'name'            => $newUser->name,
                                        'email'           => $newUser->email,
                                        'role'            => $newUser->role,
                                        'department'      => $newUser->department,
                                        'subdivision'     => $newUser->subdivision,
                                        'whatsapp_number' => $newUser->whatsapp_number,
                                        'permissions'     => $newUser->permissions,
                                    ],
                                ]
                            );
                        } catch (\Throwable $logEx) {
                            Log::warning("EmployeeSheetService: Failed recording audit log for new user {$newUser->id}: " . $logEx->getMessage());
                        }
                    }
                }

                // If password was hashed or updated, write Bcrypt hash back to Column E
                if ($newHashToWriteBack) {
                    $updatesToSheet[] = [
                        'range'  => "{$tabName}!E{$rowNumber}",
                        'values' => [[$newHashToWriteBack]],
                    ];
                }

                // Write success status to Column I
                $updatesToSheet[] = [
                    'range'  => "{$tabName}!I{$rowNumber}",
                    'values' => [["Tersinkron ({$nowStr})"]],
                ];
            } catch (\Throwable $e) {
                Log::error("EmployeeSheetService: Error processing row {$rowNumber}: " . $e->getMessage());
                $errors[] = "Baris {$rowNumber} ({$rawName}): " . $e->getMessage();
                $updatesToSheet[] = [
                    'range'  => "{$tabName}!I{$rowNumber}",
                    'values' => [["Gagal: " . substr($e->getMessage(), 0, 40)]],
                ];
            }
        }

        // Batch update Google Spreadsheet (Column E and Column I)
        if (!empty($updatesToSheet)) {
            try {
                $batchData = [];
                foreach ($updatesToSheet as $u) {
                    $batchData[] = new ValueRange([
                        'range'  => $u['range'],
                        'values' => $u['values'],
                    ]);
                }
                $batchBody = new BatchUpdateValuesRequest([
                    'valueInputOption' => 'USER_ENTERED',
                    'data'             => $batchData,
                ]);
                $service->spreadsheets_values->batchUpdate($this->spreadsheetId, $batchBody);
            } catch (\Throwable $e) {
                Log::error('EmployeeSheetService: Batch write-back to spreadsheet failed: ' . $e->getMessage());
                $errors[] = 'Gagal menulis balik status/hash ke Google Spreadsheet: ' . $e->getMessage();
            }
        }

        // Trigger WhatsApp bot roster refresh
        $this->syncStaffWithBot();

        // Record UserAuditLog entry
        if ($actingAdmin) {
            try {
                UserAuditLog::record(
                    $actingAdmin,
                    null,
                    'BATCH_USERS_SYNCED_FROM_SHEET',
                    [
                        'batch'            => true,
                        'created_count'    => $created,
                        'updated_count'    => $updated,
                        'hashed_passwords' => $hashedCount,
                        'errors_count'     => count($errors),
                        'spreadsheet_id'   => $this->spreadsheetId,
                    ]
                );
            } catch (\Throwable $e) {
                Log::warning('Failed recording UserAuditLog for employee sync: ' . $e->getMessage());
            }
        }

        return [
            'success'          => count($errors) === 0 || ($created > 0 || $updated > 0),
            'created'          => $created,
            'updated'          => $updated,
            'hashed_passwords' => $hashedCount,
            'skipped'          => $skipped,
            'errors'           => $errors,
            'spreadsheet_url'  => $this->getSpreadsheetUrl(),
            'message'          => "Sinkronisasi selesai: {$created} akun baru dibuat, {$updated} diperbarui, {$hashedCount} password di-hash & diamankan.",
        ];
    }

    /**
     * Export all existing employees/users from database into the Google Spreadsheet.
     */
    public function exportAllEmployeesToSheet(): array
    {
        $tabName = $this->ensureSheetAndHeaders();
        $service = $this->getSheetsService();

        $users = User::withTrashed()
            ->where(function ($q) {
                $q->whereNull('approval_status')
                  ->orWhere('approval_status', '!=', 'rejected');
            })
            ->orderBy('name')
            ->get();

        $nowStr = Carbon::now('Asia/Jakarta')->format('d/m/Y H:i');
        $rows = [];

        foreach ($users as $user) {
            $name = $user->staff_name ?: $user->name;
            $dept = $user->department ?: 'Umum';
            $phone = $user->whatsapp_number ?: '';
            $email = $user->email ?: '';
            $password = $user->password ?: ''; // Bcrypt hash string ($2y$...)
            $role = $user->role ?: 'staff';
            $subdiv = $user->subdivision ?: '';
            $status = ($user->trashed() || !$user->is_active) ? 'Nonaktif' : 'Aktif';
            $syncStatus = "Tersinkron ({$nowStr})";

            $rows[] = [
                $name,
                $dept,
                $phone,
                $email,
                $password,
                $role,
                $subdiv,
                $status,
                $syncStatus,
            ];
        }

        // Clear existing data from A2:I
        try {
            $clearReq = new \Google\Service\Sheets\ClearValuesRequest();
            $service->spreadsheets_values->clear($this->spreadsheetId, "{$tabName}!A2:I", $clearReq);
        } catch (\Throwable $e) {
            Log::warning('EmployeeSheetService: clear values warning: ' . $e->getMessage());
        }

        if (!empty($rows)) {
            $body = new ValueRange(['values' => $rows]);
            $service->spreadsheets_values->update(
                $this->spreadsheetId,
                "{$tabName}!A2:I" . (count($rows) + 1),
                $body,
                ['valueInputOption' => 'USER_ENTERED']
            );
        }

        // Record UserAuditLog entry for export
        $admin = auth()->user();
        if ($admin) {
            try {
                UserAuditLog::record(
                    $admin,
                    null,
                    'EMPLOYEES_EXPORTED_TO_SHEET',
                    [
                        'count'          => count($rows),
                        'spreadsheet_id' => $this->spreadsheetId,
                    ]
                );
            } catch (\Throwable $e) {
                Log::warning('EmployeeSheetService: Failed recording export audit log: ' . $e->getMessage());
            }
        }

        return [
            'success'         => true,
            'count'           => count($rows),
            'spreadsheet_url' => $this->getSpreadsheetUrl(),
            'message'         => "Berhasil meletakkan " . count($rows) . " data karyawan ke Google Spreadsheet.",
        ];
    }

    /**
     * Sync a single user/employee to the Google Spreadsheet in real-time.
     */
    public function syncSingleEmployeeToSheet(User $user): bool
    {
        if (!$this->spreadsheetId) {
            return false;
        }

        try {
            $tabName = $this->ensureSheetAndHeaders();
            $service = $this->getSheetsService();

            $range = "{$tabName}!A2:I";
            $response = $service->spreadsheets_values->get($this->spreadsheetId, $range);
            $rows = $response->getValues() ?: [];

            $targetRowIndex = null;
            $userEmail = strtolower(trim((string) $user->email));
            $userPhone = self::normalizePhoneNumber($user->whatsapp_number);
            $userName = strtolower(trim((string) ($user->staff_name ?: $user->name)));

            foreach ($rows as $index => $r) {
                $rowName = strtolower(trim($r[0] ?? ''));
                $rowPhone = self::normalizePhoneNumber($r[2] ?? '');
                $rowEmail = strtolower(trim($r[3] ?? ''));

                if (($userEmail !== '' && $userEmail === $rowEmail) ||
                    ($userPhone !== null && $userPhone === $rowPhone) ||
                    ($userName !== '' && $userName === $rowName)) {
                    $targetRowIndex = $index + 2;
                    break;
                }
            }

            $nowStr = Carbon::now('Asia/Jakarta')->format('d/m/Y H:i');
            $rowData = [
                $user->staff_name ?: $user->name,
                $user->department ?: 'Umum',
                $user->whatsapp_number ?: '',
                $user->email ?: '',
                $user->password ?: '', // Bcrypt hash string ($2y$...)
                $user->role ?: 'staff',
                $user->subdivision ?: '',
                ($user->trashed() || !$user->is_active) ? 'Nonaktif' : 'Aktif',
                "Tersinkron ({$nowStr})",
            ];

            if ($targetRowIndex !== null) {
                // Update existing row
                $body = new ValueRange(['values' => [$rowData]]);
                $service->spreadsheets_values->update(
                    $this->spreadsheetId,
                    "{$tabName}!A{$targetRowIndex}:I{$targetRowIndex}",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            } else {
                // Append as new row
                $body = new ValueRange(['values' => [$rowData]]);
                $service->spreadsheets_values->append(
                    $this->spreadsheetId,
                    "{$tabName}!A:I",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            }

            return true;
        } catch (\Throwable $e) {
            Log::warning("EmployeeSheetService: Failed syncing user #{$user->id} to sheet: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Trigger real-time staff roster reload in WhatsApp Bot V2.
     */
    private function syncStaffWithBot(): void
    {
        try {
            $port = (int) config('services.bot.port', 3000);
            if ($port <= 0 || $port > 65535) {
                $port = 3000;
            }

            Http::withHeaders([
                'X-Bot-Key' => config('services.bot.api_key'),
            ])->timeout(1)->post("http://127.0.0.1:{$port}/sync-staff");
        } catch (\Throwable $e) {
            Log::info('Bot V2 staff sync skipped from EmployeeSheetService: ' . $e->getMessage());
        }
    }
}
