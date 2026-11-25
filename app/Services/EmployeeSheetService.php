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
use Illuminate\Support\Facades\Cache;
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
     * Ensure the target tab exists and headers are styled (cached 24h per spreadsheet ID to avoid 3 extra API calls per sync/edit).
     */
    public function ensureSheetAndHeaders(bool $forceRefresh = false): string
    {
        if (!$this->spreadsheetId) {
            throw new \RuntimeException('Spreadsheet ID belum dikonfigurasi. Hubungkan spreadsheet terlebih dahulu.');
        }

        $cacheKey = "employee_sheet_header_ready:{$this->spreadsheetId}";
        if (!$forceRefresh) {
            $cachedTitle = Cache::get($cacheKey);
            if (is_string($cachedTitle) && $cachedTitle !== '') {
                return $cachedTitle;
            }
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

        Cache::put($cacheKey, $targetTitle, now()->addHours(24));

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
     * Format role code into human-readable Indonesian label.
     */
    private static function formatRoleLabel(?string $role): string
    {
        $r = strtolower(trim((string) $role));
        if ($r === 'admin') {
            return 'Administrator';
        }
        if ($r === 'department') {
            return 'Departemen';
        }
        return $r !== '' ? ucfirst($r) : 'Staff';
    }

    /**
     * Sync staff members from the Google Spreadsheet (Option B: Bcrypt hash written back).
     *
     * Supports two-step Dry-Run Preview ($dryRun = true) and anti-tamper hash verification
     * ($expectedPreviewHash) so admins can inspect every change—especially role escalations
     * to Administrator—before writing to the database.
     */
    public function syncEmployeesFromSheet(
        ?User $actingAdmin = null,
        bool $dryRun = false,
        ?string $expectedPreviewHash = null
    ): array {
        $tabName = $this->ensureSheetAndHeaders();
        $service = $this->getSheetsService();

        // Read all rows from A2 to I
        $range = "{$tabName}!A2:I";
        $response = $service->spreadsheets_values->get($this->spreadsheetId, $range);
        $rows = $response->getValues() ?: [];

        $plannedCreated = 0;
        $plannedUpdated = 0;
        $plannedHashed = 0;
        $skipped = 0;
        $errors = [];
        $updatesToSheet = []; // Array of ['range' => '...', 'values' => [[...]]]
        $pendingAuditLogs = []; // Collected for a single non-blocking batch append to Audit Sheet
        $changes = [];
        $securityAlerts = [];
        $plannedOps = [];
        $hashEntries = [];

        // Preload all users in 1 DB query to eliminate N+1 per-row queries
        $allUsers = User::withTrashed()->get();
        $usersByEmail = [];
        $usersByPhone = [];
        $usersByName = [];
        foreach ($allUsers as $u) {
            if (!empty($u->email)) {
                $usersByEmail[strtolower(trim((string) $u->email))] = $u;
            }
            $uPhone = self::normalizePhoneNumber($u->whatsapp_number);
            if ($uPhone) {
                $usersByPhone[$uPhone] = $u;
            }
            $uName = strtolower(trim((string) ($u->staff_name ?: $u->name)));
            if ($uName !== '') {
                $usersByName[$uName] = $u;
            }
        }

        $nowStr = Carbon::now('Asia/Jakarta')->format('d/m/Y H:i');

        // =====================================================================
        // PHASE 1: PURE ANALYSIS (No DB writes, no Bcrypt cost, no Sheet writes)
        // =====================================================================
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
            $rawSyncStatus  = trim($row[8] ?? '');

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

            // Phone normalization (treat placeholder "-" as empty)
            $normalizedPhone = self::normalizePhoneNumber($rawPhone);
            if ($rawPhone !== '' && $rawPhone !== '-' && !$normalizedPhone) {
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

            // Locate existing user from preloaded in-memory maps (O(1) lookup, 0 DB queries)
            $existingUser = null;
            if (!empty($rawEmail)) {
                $existingUser = $usersByEmail[strtolower($rawEmail)] ?? null;
            }
            if (!$existingUser && !empty($normalizedPhone)) {
                $existingUser = $usersByPhone[$normalizedPhone] ?? null;
            }
            if (!$existingUser) {
                $existingUser = $usersByName[strtolower($rawName)] ?? null;
            }

            // Password analysis (defer actual Hash::make until Phase 2 so dry-run stays instant)
            $passwordAction = 'keep'; // 'keep' | 'use_existing_hash' | 'hash_plain' | 'generate_default'
            $willHashPassword = false;

            if (self::isBcryptHash($rawPassword)) {
                if (!$existingUser) {
                    $passwordAction = 'use_existing_hash';
                }
            } elseif ($rawPassword !== '') {
                $passwordAction = 'hash_plain';
                $willHashPassword = true;
            } else {
                if (!$existingUser) {
                    $passwordAction = 'generate_default';
                    $willHashPassword = true;
                }
            }

            if ($existingUser) {
                $before = [
                    'name'            => $existingUser->name,
                    'staff_name'      => $existingUser->staff_name,
                    'email'           => $existingUser->email,
                    'role'            => $existingUser->role,
                    'department'      => $existingUser->department,
                    'subdivision'     => $existingUser->subdivision,
                    'whatsapp_number' => $existingUser->whatsapp_number,
                    'is_active'       => (bool) $existingUser->is_active,
                ];
                $passwordChanged = ($passwordAction === 'hash_plain');

                $targetSubdivision = $rawSubdivision !== '' ? $rawSubdivision : $existingUser->subdivision;
                $targetPhone = $normalizedPhone ?: $existingUser->whatsapp_number;
                $targetEmail = !empty($rawEmail) ? $rawEmail : $existingUser->email;
                $targetActive = !$isInactive;
                $trashChanged = ($isInactive && !$existingUser->trashed()) || (!$isInactive && $existingUser->trashed());

                $phoneChanged = self::normalizePhoneNumber($before['whatsapp_number']) !== self::normalizePhoneNumber($targetPhone);
                $emailChanged = strtolower((string) $before['email']) !== strtolower((string) $targetEmail);
                $nameChanged = ($before['name'] !== $rawName || $before['staff_name'] !== $rawName);
                $deptChanged = ($before['department'] !== $normalizedDept);
                $subdivChanged = ((string) ($before['subdivision'] ?? '') !== (string) ($targetSubdivision ?? ''));
                $roleChanged = ($before['role'] !== $role);
                $activeChanged = ($before['is_active'] !== $targetActive || $trashChanged);

                $hasDataChanges = $passwordChanged
                    || $nameChanged
                    || $deptChanged
                    || $subdivChanged
                    || $phoneChanged
                    || $emailChanged
                    || $roleChanged
                    || $activeChanged;

                // Smart Dirty Check: Skip DB save, audit log, and sheet write-back for unchanged rows!
                if (!$hasDataChanges && !$willHashPassword) {
                    if (!str_starts_with($rawSyncStatus, 'Tersinkron')) {
                        $updatesToSheet[] = [
                            'range'  => "{$tabName}!I{$rowNumber}",
                            'values' => [["Tersinkron ({$nowStr})"]],
                        ];
                    }
                    $skipped++;
                    continue;
                }

                $diffs = [];
                $sensitiveTags = [];

                if ($roleChanged) {
                    $isPromotedToAdmin = ($before['role'] !== 'admin' && $role === 'admin');
                    $isDemotedFromAdmin = ($before['role'] === 'admin' && $role !== 'admin');
                    $diffs[] = [
                        'field'     => 'role',
                        'label'     => 'Peran (Role)',
                        'before'    => self::formatRoleLabel($before['role']),
                        'after'     => self::formatRoleLabel($role),
                        'sensitive' => true,
                    ];
                    if ($isPromotedToAdmin) {
                        $sensitiveTags[] = 'PROMOTED_TO_ADMIN';
                        $securityAlerts[] = [
                            'severity' => 'critical',
                            'tag'      => 'PROMOTED_TO_ADMIN',
                            'row'      => $rowNumber,
                            'name'     => $rawName,
                            'email'    => $targetEmail,
                            'message'  => "{$rawName} (Baris {$rowNumber}): Peran diubah dari " . self::formatRoleLabel($before['role']) . " menjadi Administrator.",
                        ];
                    } elseif ($isDemotedFromAdmin) {
                        $sensitiveTags[] = 'DEMOTED_FROM_ADMIN';
                        $securityAlerts[] = [
                            'severity' => 'warning',
                            'tag'      => 'DEMOTED_FROM_ADMIN',
                            'row'      => $rowNumber,
                            'name'     => $rawName,
                            'email'    => $targetEmail,
                            'message'  => "{$rawName} (Baris {$rowNumber}): Peran diturunkan dari Administrator menjadi " . self::formatRoleLabel($role) . ".",
                        ];
                    }
                }

                if ($passwordChanged) {
                    $diffs[] = [
                        'field'     => 'password',
                        'label'     => 'Password',
                        'before'    => '••••••••',
                        'after'     => 'Password baru (di-hash Bcrypt)',
                        'sensitive' => true,
                    ];
                    $sensitiveTags[] = 'PASSWORD_CHANGED';
                    $securityAlerts[] = [
                        'severity' => 'warning',
                        'tag'      => 'PASSWORD_CHANGED',
                        'row'      => $rowNumber,
                        'name'     => $rawName,
                        'email'    => $targetEmail,
                        'message'  => "{$rawName} (Baris {$rowNumber}): Password akun akan diperbarui dari Spreadsheet.",
                    ];
                }

                if ($activeChanged) {
                    $wasActive = $before['is_active'] && !$existingUser->trashed();
                    $diffs[] = [
                        'field'     => 'is_active',
                        'label'     => 'Status Akun',
                        'before'    => $wasActive ? 'Aktif' : 'Nonaktif',
                        'after'     => $targetActive ? 'Aktif' : 'Nonaktif (Diarsipkan)',
                        'sensitive' => !$targetActive,
                    ];
                    if (!$targetActive) {
                        $sensitiveTags[] = 'ACCOUNT_DEACTIVATED';
                        $securityAlerts[] = [
                            'severity' => 'warning',
                            'tag'      => 'ACCOUNT_DEACTIVATED',
                            'row'      => $rowNumber,
                            'name'     => $rawName,
                            'email'    => $targetEmail,
                            'message'  => "{$rawName} (Baris {$rowNumber}): Akun akan dinonaktifkan / diarsipkan.",
                        ];
                    }
                }

                if ($nameChanged) {
                    $diffs[] = [
                        'field'     => 'name',
                        'label'     => 'Nama',
                        'before'    => $before['staff_name'] ?: $before['name'] ?: '(Kosong)',
                        'after'     => $rawName,
                        'sensitive' => false,
                    ];
                }
                if ($deptChanged) {
                    $diffs[] = [
                        'field'     => 'department',
                        'label'     => 'Departemen',
                        'before'    => $before['department'] ?: '(Kosong)',
                        'after'     => $normalizedDept,
                        'sensitive' => false,
                    ];
                }
                if ($subdivChanged) {
                    $diffs[] = [
                        'field'     => 'subdivision',
                        'label'     => 'Subdivisi',
                        'before'    => $before['subdivision'] ?: '(Kosong)',
                        'after'     => $targetSubdivision ?: '(Kosong)',
                        'sensitive' => false,
                    ];
                }
                if ($phoneChanged) {
                    $diffs[] = [
                        'field'     => 'whatsapp_number',
                        'label'     => 'WhatsApp',
                        'before'    => $before['whatsapp_number'] ?: '(Kosong)',
                        'after'     => $targetPhone ?: '(Kosong)',
                        'sensitive' => false,
                    ];
                }
                if ($emailChanged) {
                    $diffs[] = [
                        'field'     => 'email',
                        'label'     => 'Email',
                        'before'    => $before['email'] ?: '(Kosong)',
                        'after'     => $targetEmail ?: '(Kosong)',
                        'sensitive' => false,
                    ];
                }

                $plannedUpdated++;
                if ($willHashPassword) {
                    $plannedHashed++;
                }

                $changes[] = [
                    'row'            => $rowNumber,
                    'action'         => 'updated',
                    'user_id'        => $existingUser->id,
                    'name'           => $rawName,
                    'email'          => $targetEmail,
                    'department'     => $normalizedDept,
                    'role'           => $role,
                    'sensitive'      => !empty($sensitiveTags),
                    'sensitive_tags' => $sensitiveTags,
                    'diffs'          => $diffs,
                ];

                $hashEntries[] = [
                    'row'          => $rowNumber,
                    'action'       => 'updated',
                    'user_id'      => $existingUser->id,
                    'name'         => $rawName,
                    'email'        => strtolower((string) $targetEmail),
                    'department'   => $normalizedDept,
                    'subdivision'  => (string) ($targetSubdivision ?? ''),
                    'phone'        => (string) ($targetPhone ?? ''),
                    'role'         => $role,
                    'active'       => $targetActive,
                    'pass_fp'      => $passwordChanged ? hash('sha256', $rawPassword) : '',
                ];

                $plannedOps[] = [
                    'action'            => 'updated',
                    'row'               => $rowNumber,
                    'existing_user'     => $existingUser,
                    'before'            => $before,
                    'raw_name'          => $rawName,
                    'normalized_dept'   => $normalizedDept,
                    'target_subdiv'     => $targetSubdivision,
                    'target_phone'      => $targetPhone,
                    'target_email'      => $targetEmail,
                    'role'              => $role,
                    'target_active'     => $targetActive,
                    'is_inactive'       => $isInactive,
                    'password_action'   => $passwordAction,
                    'raw_password'      => $rawPassword,
                    'normalized_phone'  => $normalizedPhone,
                ];
            } else {
                // Planned new user creation
                $sensitiveTags = [];
                $diffs = [
                    ['field' => 'role', 'label' => 'Peran (Role)', 'before' => null, 'after' => self::formatRoleLabel($role), 'sensitive' => $role === 'admin'],
                    ['field' => 'department', 'label' => 'Departemen', 'before' => null, 'after' => $normalizedDept, 'sensitive' => false],
                ];
                if ($rawSubdivision !== '') {
                    $diffs[] = ['field' => 'subdivision', 'label' => 'Subdivisi', 'before' => null, 'after' => $rawSubdivision, 'sensitive' => false];
                }
                if ($normalizedPhone) {
                    $diffs[] = ['field' => 'whatsapp_number', 'label' => 'WhatsApp', 'before' => null, 'after' => $normalizedPhone, 'sensitive' => false];
                }
                if ($willHashPassword) {
                    $diffs[] = [
                        'field'     => 'password',
                        'label'     => 'Password',
                        'before'    => null,
                        'after'     => $passwordAction === 'hash_plain'
                            ? 'Password baru (di-hash Bcrypt)'
                            : 'Password default otomatis (di-hash Bcrypt)',
                        'sensitive' => false,
                    ];
                }

                if ($role === 'admin') {
                    $sensitiveTags[] = 'NEW_ADMIN';
                    $securityAlerts[] = [
                        'severity' => 'critical',
                        'tag'      => 'NEW_ADMIN',
                        'row'      => $rowNumber,
                        'name'     => $rawName,
                        'email'    => $email,
                        'message'  => "{$rawName} (Baris {$rowNumber}): Akun BARU akan dibuat dengan hak akses Administrator.",
                    ];
                }

                $plannedCreated++;
                if ($willHashPassword) {
                    $plannedHashed++;
                }

                $changes[] = [
                    'row'            => $rowNumber,
                    'action'         => 'created',
                    'user_id'        => null,
                    'name'           => $rawName,
                    'email'          => $email,
                    'department'     => $normalizedDept,
                    'role'           => $role,
                    'sensitive'      => !empty($sensitiveTags),
                    'sensitive_tags' => $sensitiveTags,
                    'diffs'          => $diffs,
                ];

                $hashEntries[] = [
                    'row'          => $rowNumber,
                    'action'       => 'created',
                    'name'         => $rawName,
                    'email'        => strtolower((string) $email),
                    'department'   => $normalizedDept,
                    'subdivision'  => $rawSubdivision,
                    'phone'        => (string) ($normalizedPhone ?? ''),
                    'role'         => $role,
                    'active'       => !$isInactive,
                    'pass_fp'      => $rawPassword !== '' ? hash('sha256', $rawPassword) : 'auto',
                ];

                $plannedOps[] = [
                    'action'            => 'created',
                    'row'               => $rowNumber,
                    'raw_name'          => $rawName,
                    'normalized_dept'   => $normalizedDept,
                    'target_subdiv'     => $rawSubdivision ?: null,
                    'target_phone'      => $normalizedPhone,
                    'target_email'      => $email,
                    'role'              => $role,
                    'target_active'     => !$isInactive,
                    'is_inactive'       => $isInactive,
                    'password_action'   => $passwordAction,
                    'raw_password'      => $rawPassword,
                    'normalized_phone'  => $normalizedPhone,
                ];
            }
        }

        // Deterministic hash of planned changes for anti-tamper (TOCTOU) verification
        $previewHash = hash('sha256', json_encode([
            'spreadsheet_id' => $this->spreadsheetId,
            'entries'        => $hashEntries,
            'errors_count'   => count($errors),
        ], JSON_UNESCAPED_UNICODE));

        // DRY-RUN RESPONSE: Return preview without modifying DB, Sheet, or Audit Logs
        if ($dryRun) {
            if ($plannedCreated === 0 && $plannedUpdated === 0 && $plannedHashed === 0 && $skipped === 0 && count($errors) > 0) {
                $previewMsg = 'Pratinjau menemukan ' . count($errors) . ' baris bermasalah. Contoh: ' . $errors[0];
            } elseif ($plannedCreated === 0 && $plannedUpdated === 0 && $plannedHashed === 0 && count($errors) === 0) {
                $previewMsg = "Seluruh {$skipped} data karyawan sudah sesuai (tidak ada perubahan).";
            } else {
                $previewMsg = "Pratinjau: {$plannedCreated} akun baru, {$plannedUpdated} akun diperbarui, {$plannedHashed} password akan di-hash" . ($skipped > 0 ? " ({$skipped} tidak berubah)." : ".");
            }

            return [
                'success'          => count($errors) === 0 || ($plannedCreated > 0 || $plannedUpdated > 0 || $skipped > 0),
                'dry_run'          => true,
                'stale_preview'    => false,
                'preview_hash'     => $previewHash,
                'created'          => $plannedCreated,
                'updated'          => $plannedUpdated,
                'hashed_passwords' => $plannedHashed,
                'skipped'          => $skipped,
                'errors'           => $errors,
                'changes'          => $changes,
                'security_alerts'  => $securityAlerts,
                'spreadsheet_url'  => $this->getSpreadsheetUrl(),
                'message'          => $previewMsg,
            ];
        }

        // ANTI-TAMPER CHECK (TOCTOU): Ensure sheet didn't change between preview and confirm
        if ($expectedPreviewHash !== null && $expectedPreviewHash !== '' && !hash_equals($previewHash, $expectedPreviewHash)) {
            Log::warning("EmployeeSheetService: Preview hash mismatch detected during sync for spreadsheet {$this->spreadsheetId}. Aborting write and returning fresh preview.");

            return [
                'success'          => false,
                'dry_run'          => true,
                'stale_preview'    => true,
                'preview_hash'     => $previewHash,
                'created'          => $plannedCreated,
                'updated'          => $plannedUpdated,
                'hashed_passwords' => $plannedHashed,
                'skipped'          => $skipped,
                'errors'           => $errors,
                'changes'          => $changes,
                'security_alerts'  => $securityAlerts,
                'spreadsheet_url'  => $this->getSpreadsheetUrl(),
                'message'          => 'Isi Google Spreadsheet berubah sejak pratinjau terakhir. Harap periksa ulang rincian perubahan terbaru sebelum menerapkan.',
            ];
        }

        // =====================================================================
        // PHASE 2: EXECUTE PLANNED OPERATIONS (DB writes, Bcrypt, Sheet write-back)
        // =====================================================================
        $created = 0;
        $updated = 0;
        $hashedCount = 0;
        $appliedChanges = [];

        foreach ($plannedOps as $idx => $op) {
            $rowNumber = $op['row'];
            $rawName = $op['raw_name'];

            try {
                // Compute Bcrypt hash only now during real execution
                $passwordForDb = null;
                $newHashToWriteBack = null;

                if ($op['password_action'] === 'use_existing_hash') {
                    $passwordForDb = $op['raw_password'];
                } elseif ($op['password_action'] === 'hash_plain') {
                    $passwordForDb = Hash::make($op['raw_password']);
                    $newHashToWriteBack = $passwordForDb;
                    $hashedCount++;
                } elseif ($op['password_action'] === 'generate_default') {
                    $defaultPass = 'Telunas#' . substr($op['normalized_phone'] ?: (string) rand(1000, 9999), -4);
                    $passwordForDb = Hash::make($defaultPass);
                    $newHashToWriteBack = $passwordForDb;
                    $hashedCount++;
                }

                if ($op['action'] === 'updated') {
                    /** @var User $existingUser */
                    $existingUser = $op['existing_user'];
                    $before = $op['before'];
                    $passwordChanged = ($op['password_action'] === 'hash_plain');

                    $existingUser->name = $rawName;
                    $existingUser->staff_name = $rawName;
                    $existingUser->department = $op['normalized_dept'];
                    $existingUser->subdivision = $op['target_subdiv'];
                    $existingUser->whatsapp_number = $op['target_phone'];
                    $existingUser->email = $op['target_email'];
                    if ($passwordForDb) {
                        $existingUser->password = $passwordForDb;
                    }
                    $existingUser->role = $op['role'];
                    $existingUser->is_active = $op['target_active'];

                    if ($op['is_inactive'] && !$existingUser->trashed()) {
                        $existingUser->delete();
                    } elseif (!$op['is_inactive'] && $existingUser->trashed()) {
                        $existingUser->restore();
                    }

                    $existingUser->save();
                    $updated++;

                    if (isset($changes[$idx])) {
                        $appliedChanges[] = $changes[$idx];
                    }

                    $after = [
                        'name'            => $existingUser->name,
                        'staff_name'      => $existingUser->staff_name,
                        'email'           => $existingUser->email,
                        'role'            => $existingUser->role,
                        'department'      => $existingUser->department,
                        'subdivision'     => $existingUser->subdivision,
                        'whatsapp_number' => $existingUser->whatsapp_number,
                        'is_active'       => (bool) $existingUser->is_active,
                        'password_reset'  => $passwordChanged,
                    ];

                    if ($actingAdmin) {
                        try {
                            $pendingAuditLogs[] = UserAuditLog::record(
                                $actingAdmin,
                                $existingUser,
                                $passwordChanged ? 'PASSWORD_UPDATED_VIA_SHEET_SYNC' : 'USER_UPDATED_VIA_SHEET_SYNC',
                                [
                                    'source'         => 'Google Spreadsheet (Data Karyawan)',
                                    'spreadsheet_id' => $this->spreadsheetId,
                                    'row'            => $rowNumber,
                                    'before'         => $before,
                                    'after'          => $after,
                                ],
                                null,
                                null,
                                null,
                                false
                            );
                        } catch (\Throwable $logEx) {
                            Log::warning("EmployeeSheetService: Failed recording audit log for updated user {$existingUser->id}: " . $logEx->getMessage());
                        }
                    }
                } else {
                    // Create new user
                    $newUser = new User([
                        'name'            => $rawName,
                        'staff_name'      => $rawName,
                        'email'           => $op['target_email'],
                        'whatsapp_number' => $op['target_phone'],
                        'department'      => $op['normalized_dept'],
                        'subdivision'     => $op['target_subdiv'],
                        'role'            => $op['role'],
                        'password'        => $passwordForDb,
                        'is_active'       => $op['target_active'],
                        'approval_status' => 'approved',
                        'permissions'     => UserController::getDefaultPermissions($op['role']),
                    ]);
                    $newUser->save();
                    $created++;

                    if (isset($changes[$idx])) {
                        $changeItem = $changes[$idx];
                        $changeItem['user_id'] = $newUser->id;
                        $appliedChanges[] = $changeItem;
                    }

                    if ($actingAdmin) {
                        try {
                            $pendingAuditLogs[] = UserAuditLog::record(
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
                                ],
                                null,
                                null,
                                null,
                                false
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

        // Batch update Google Spreadsheet (only modified/new/errored rows: Column E and Column I)
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

        // Record batch summary UserAuditLog entry (without blocking Google Sheets)
        if ($actingAdmin) {
            try {
                $pendingAuditLogs[] = UserAuditLog::record(
                    $actingAdmin,
                    null,
                    'BATCH_USERS_SYNCED_FROM_SHEET',
                    [
                        'batch'            => true,
                        'created_count'    => $created,
                        'updated_count'    => $updated,
                        'skipped_count'    => $skipped,
                        'hashed_passwords' => $hashedCount,
                        'errors_count'     => count($errors),
                        'spreadsheet_id'   => $this->spreadsheetId,
                    ],
                    null,
                    null,
                    null,
                    false
                );
            } catch (\Throwable $e) {
                Log::warning('Failed recording UserAuditLog for employee sync: ' . $e->getMessage());
            }
        }

        // Run Audit Sheet batch append & WhatsApp bot roster refresh on app termination (non-blocking, no closure serialization of CurlHandle)
        $hasRosterChanges = ($created > 0 || $updated > 0);
        app()->terminating(static function () use ($pendingAuditLogs, $hasRosterChanges) {
            if (!empty($pendingAuditLogs)) {
                try {
                    app(AuditSheetService::class)->appendLogsBatch($pendingAuditLogs);
                } catch (\Throwable $e) {
                    Log::warning('EmployeeSheetService: Background batch audit sheet append failed: ' . $e->getMessage());
                }
            }
            if ($hasRosterChanges) {
                self::syncStaffWithBot();
            }
        });

        if ($created === 0 && $updated === 0 && $hashedCount === 0 && $skipped === 0 && count($errors) > 0) {
            $summaryMessage = 'Sinkronisasi gagal: ' . count($errors) . ' baris bermasalah. Contoh: ' . $errors[0];
        } elseif ($created === 0 && $updated === 0 && $hashedCount === 0 && count($errors) === 0) {
            $summaryMessage = "Sinkronisasi selesai: seluruh {$skipped} data karyawan sudah sesuai (tidak ada perubahan).";
        } else {
            $summaryMessage = "Sinkronisasi selesai: {$created} akun baru dibuat, {$updated} diperbarui, {$hashedCount} password di-hash & diamankan" . ($skipped > 0 ? " ({$skipped} tidak berubah)." : ".");
        }

        return [
            'success'          => count($errors) === 0 || ($created > 0 || $updated > 0 || $skipped > 0),
            'dry_run'          => false,
            'stale_preview'    => false,
            'preview_hash'     => $previewHash,
            'created'          => $created,
            'updated'          => $updated,
            'hashed_passwords' => $hashedCount,
            'skipped'          => $skipped,
            'errors'           => $errors,
            'changes'          => $appliedChanges,
            'security_alerts'  => $securityAlerts,
            'spreadsheet_url'  => $this->getSpreadsheetUrl(),
            'message'          => $summaryMessage,
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
    public static function syncStaffWithBot(): void
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
