<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserAuditLog;
use App\Services\EmployeeSheetService;
use Carbon\Carbon;
use Google\Service\Sheets;
use Google\Service\Sheets\Resource\Spreadsheets;
use Google\Service\Sheets\Resource\SpreadsheetsValues;
use Google\Service\Sheets\Spreadsheet;
use Google\Service\Sheets\Sheet;
use Google\Service\Sheets\SheetProperties;
use Google\Service\Sheets\ValueRange;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class EmployeeSheetSyncTest extends TestCase
{
    use RefreshDatabase;

    protected ?string $originalConfigFileContent = null;
    protected string $configFilePath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->configFilePath = storage_path('app/employee_spreadsheet_config.json');
        if (File::exists($this->configFilePath)) {
            $this->originalConfigFileContent = File::get($this->configFilePath);
        }

        Http::fake([
            'http://127.0.0.1:3000/*' => Http::response(['success' => true], 200),
            '*' => Http::response(['success' => true], 200),
        ]);
    }

    protected function tearDown(): void
    {
        // Explicitly guarantee production config is always restored to 1KM1AXSZS6-KXJdnKUfpfYaWypyKa8Homam4ce3t160M
        $prodConfig = [
            'spreadsheet_id' => '1KM1AXSZS6-KXJdnKUfpfYaWypyKa8Homam4ce3t160M',
            'updated_at'     => Carbon::now('Asia/Jakarta')->toIso8601String(),
        ];
        File::put($this->configFilePath, json_encode($prodConfig, JSON_PRETTY_PRINT));

        parent::tearDown();
    }

    public function test_extract_spreadsheet_id(): void
    {
        $url1 = 'https://docs.google.com/spreadsheets/d/1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg/edit#gid=0';
        $this->assertEquals('1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg', EmployeeSheetService::extractSpreadsheetId($url1));

        $rawId = '11FJllelJdd37tR9dUnCawgU1iycm6bQOLMgHM2t-z84';
        $this->assertEquals($rawId, EmployeeSheetService::extractSpreadsheetId($rawId));

        $this->assertNull(EmployeeSheetService::extractSpreadsheetId(''));
        $this->assertNull(EmployeeSheetService::extractSpreadsheetId('invalid_id'));
    }

    public function test_normalize_phone_number(): void
    {
        $this->assertEquals('6281234567890', EmployeeSheetService::normalizePhoneNumber('0812-3456-7890'));
        $this->assertEquals('6281234567890', EmployeeSheetService::normalizePhoneNumber('+62 812 3456 7890'));
        $this->assertEquals('6281234567890', EmployeeSheetService::normalizePhoneNumber('81234567890'));
        $this->assertEquals('6281234567890', EmployeeSheetService::normalizePhoneNumber('6281234567890'));
        $this->assertNull(EmployeeSheetService::normalizePhoneNumber(''));
    }

    public function test_is_bcrypt_hash(): void
    {
        $plain = 'Telunas#2026';
        $this->assertFalse(EmployeeSheetService::isBcryptHash($plain));

        $hash = Hash::make($plain);
        $this->assertTrue(EmployeeSheetService::isBcryptHash($hash));
        $this->assertFalse(EmployeeSheetService::isBcryptHash('md5_or_short_string'));
    }

    public function test_admin_can_get_and_update_employee_sheet_config(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'department' => 'IT',
            'staff_name' => 'Admin Test',
        ]);

        $staff = User::factory()->create([
            'role' => 'staff',
            'department' => 'HK',
            'staff_name' => 'Staff Test',
        ]);

        // Staff is forbidden
        $this->actingAs($staff)->get('/users/employee-sheet-config')->assertStatus(403);
        $this->actingAs($staff)->post('/users/employee-sheet-config', [
            'url' => 'https://docs.google.com/spreadsheets/d/1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890/edit',
        ])->assertStatus(403);

        // Admin can update
        $res = $this->actingAs($admin)->post('/users/employee-sheet-config', [
            'url' => 'https://docs.google.com/spreadsheets/d/1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890/edit',
        ]);
        $res->assertStatus(200);
        $res->assertJsonPath('success', true);
        $res->assertJsonPath('spreadsheet_id', '1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890');

        // Admin can read back config
        $getRes = $this->actingAs($admin)->get('/users/employee-sheet-config');
        $getRes->assertStatus(200);
        $getRes->assertJsonPath('spreadsheet_id', '1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890');
    }

    public function test_sync_employees_handles_bcrypt_and_updates_database(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'department' => 'IT',
            'staff_name' => 'Admin Officer',
        ]);

        // Mock Google Sheets Service
        $mockSheets = $this->createMock(Sheets::class);
        $mockSpreadsheets = $this->createMock(Spreadsheets::class);
        $mockValues = $this->createMock(SpreadsheetsValues::class);

        $mockSheets->spreadsheets = $mockSpreadsheets;
        $mockSheets->spreadsheets_values = $mockValues;

        // Mock metadata
        $sheetProp = new SheetProperties();
        $sheetProp->setTitle('Data Karyawan');
        $sheetProp->setSheetId(0);

        $sheetObj = new Sheet();
        $sheetObj->setProperties($sheetProp);

        $spreadsheetObj = new Spreadsheet();
        $spreadsheetObj->setSheets([$sheetObj]);

        $mockSpreadsheets->method('get')->willReturn($spreadsheetObj);

        // Mock reading rows A2:I:
        // Row 1: New employee with plain-text password -> must be hashed into DB and marked for write-back
        // Row 2: Existing employee with already hashed Bcrypt password -> must preserve hash without re-hashing
        $existingHash = Hash::make('SecretPass123');
        $existingStaff = User::factory()->create([
            'name'            => 'Budi Existing',
            'staff_name'      => 'Budi Existing',
            'email'           => 'budi@telunasresorts.com',
            'whatsapp_number' => '628111222333',
            'department'      => 'HK',
            'password'        => $existingHash,
        ]);

        $mockRows = [
            [
                'Ahmad Baru',            // A: Nama
                'Engineering',           // B: Dept
                '081234567890',          // C: Phone
                'ahmad@telunas.internal',// D: Email
                'PlainPass2026!',        // E: Password (plain text)
                'staff',                 // F: Role
                'Pest Control',          // G: Subdivisi
                'Aktif',                 // H: Status
                '',                      // I: Status Sync
            ],
            [
                'Budi Existing',         // A: Nama
                'Housekeeping',          // B: Dept
                '628111222333',          // C: Phone
                'budi@telunasresorts.com',// D: Email
                $existingHash,           // E: Password (already Bcrypt hash!)
                'admin',                 // F: Role (promoted to admin)
                'Room',                  // G: Subdivisi
                'Aktif',                 // H: Status
                '',                      // I: Status Sync
            ],
        ];

        $valRange = new ValueRange();
        $valRange->setValues($mockRows);
        $mockValues->method('get')->willReturn($valRange);

        // Expect batch update back to spreadsheet
        $batchWriteBackRecorded = false;
        $mockValues->method('batchUpdate')->willReturnCallback(function ($sheetId, $body) use (&$batchWriteBackRecorded) {
            $batchWriteBackRecorded = true;
            return true;
        });

        // Inject mock service
        $service = new EmployeeSheetService();
        $service->setSpreadsheetId('1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890');

        $reflection = new \ReflectionClass($service);
        $prop = $reflection->getProperty('sheets');
        $prop->setAccessible(true);
        $prop->setValue($service, $mockSheets);

        $result = $service->syncEmployeesFromSheet($admin);

        $this->assertTrue($result['success']);
        $this->assertEquals(1, $result['created']);
        $this->assertEquals(1, $result['updated']);
        $this->assertEquals(1, $result['hashed_passwords']);
        $this->assertTrue($batchWriteBackRecorded);

        // Verify Ahmad Baru was created
        $ahmad = User::where('staff_name', 'Ahmad Baru')->firstOrFail();
        $this->assertEquals('Engineer', $ahmad->department);
        $this->assertEquals('6281234567890', $ahmad->whatsapp_number);
        $this->assertTrue(Hash::check('PlainPass2026!', $ahmad->password));

        // Verify Budi was updated & role changed to admin
        $budi = User::where('staff_name', 'Budi Existing')->firstOrFail();
        $this->assertEquals('admin', $budi->role);
        $this->assertEquals('HK', $budi->department);
        // Password hash should remain original
        $this->assertEquals($existingHash, $budi->password);

        // Verify UserAuditLogs
        $batchLog = UserAuditLog::where('action', 'BATCH_USERS_SYNCED_FROM_SHEET')->latest()->first();
        $this->assertNotNull($batchLog);
        $this->assertEquals($admin->id, $batchLog->admin_id);

        $createdLog = UserAuditLog::where('action', 'USER_CREATED_VIA_SHEET_SYNC')
            ->where('target_user_id', $ahmad->id)
            ->first();
        $this->assertNotNull($createdLog);
        $this->assertEquals('Google Spreadsheet (Data Karyawan)', $createdLog->changes['source']);

        $updatedLog = UserAuditLog::where('action', 'USER_UPDATED_VIA_SHEET_SYNC')
            ->where('target_user_id', $budi->id)
            ->first();
        $this->assertNotNull($updatedLog);
        $this->assertEquals('admin', $updatedLog->changes['after']['role']);
    }

    public function test_export_and_sync_sheet_routes_are_not_intercepted_by_wildcard_user_id(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'department' => 'IT',
            'staff_name' => 'Admin Routes Test',
        ]);

        $mockService = $this->createMock(EmployeeSheetService::class);
        $mockService->method('getSpreadsheetId')->willReturn('1KM1AXSZS6-KXJdnKUfpfYaWypyKa8Homam4ce3t160M');
        $mockService->method('exportAllEmployeesToSheet')->willReturn([
            'success'         => true,
            'message'         => '59 data karyawan berhasil diekspor.',
            'count'           => 59,
            'spreadsheet_url' => 'https://docs.google.com/spreadsheets/d/1KM1AXSZS6-KXJdnKUfpfYaWypyKa8Homam4ce3t160M/edit',
        ]);
        $mockService->method('syncEmployeesFromSheet')->willReturn([
            'success'          => true,
            'message'          => 'Sync berhasil.',
            'created'          => 0,
            'updated'          => 0,
            'hashed_passwords' => 0,
            'skipped'          => 0,
            'errors'           => [],
            'spreadsheet_url'  => 'https://docs.google.com/spreadsheets/d/1KM1AXSZS6-KXJdnKUfpfYaWypyKa8Homam4ce3t160M/edit',
        ]);

        $this->app->instance(EmployeeSheetService::class, $mockService);

        // Test POST /api/users/export-sheet
        $resExport = $this->actingAs($admin)->postJson('/api/users/export-sheet');
        $resExport->assertStatus(200);
        $resExport->assertJsonPath('success', true);
        $resExport->assertJsonPath('count', 59);

        // Test POST /users/export-sheet
        $resExportWeb = $this->actingAs($admin)->postJson('/users/export-sheet');
        $resExportWeb->assertStatus(200);

        // Test POST /api/users/sync-sheet
        $resSync = $this->actingAs($admin)->postJson('/api/users/sync-sheet');
        $resSync->assertStatus(200);
        $resSync->assertJsonPath('success', true);

        // Test POST /users/sync-sheet
        $resSyncWeb = $this->actingAs($admin)->postJson('/users/sync-sheet');
        $resSyncWeb->assertStatus(200);
    }

    public function test_sync_single_employee_to_sheet(): void
    {
        $user = User::factory()->create([
            'staff_name' => 'Charlie Delta',
            'department' => 'Kitchen',
            'whatsapp_number' => '628999888777',
            'email' => 'charlie@telunasresorts.com',
            'role' => 'staff',
        ]);

        $mockSheets = $this->createMock(Sheets::class);
        $mockSpreadsheets = $this->createMock(Spreadsheets::class);
        $mockValues = $this->createMock(SpreadsheetsValues::class);

        $mockSheets->spreadsheets = $mockSpreadsheets;
        $mockSheets->spreadsheets_values = $mockValues;

        $meta = new Spreadsheet();
        $sheetObj = new Sheet();
        $props = new SheetProperties();
        $props->setTitle('Data Karyawan');
        $sheetObj->setProperties($props);
        $meta->setSheets([$sheetObj]);
        $mockSpreadsheets->method('get')->willReturn($meta);

        // Mock existing rows: row 2 is Charlie Delta
        $valRange = new ValueRange();
        $valRange->setValues([
            ['Charlie Delta', 'Kitchen', '628999888777', 'charlie@telunasresorts.com', 'oldhash', 'staff', '', 'Aktif', 'Tersinkron'],
        ]);
        $mockValues->method('get')->willReturn($valRange);

        $updatedRange = null;
        $mockValues->method('update')->willReturnCallback(function ($sheetId, $range, $body) use (&$updatedRange) {
            $updatedRange = $range;
            return true;
        });

        $service = new EmployeeSheetService();
        $service->setSpreadsheetId('1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890');

        $reflection = new \ReflectionClass($service);
        $prop = $reflection->getProperty('sheets');
        $prop->setAccessible(true);
        $prop->setValue($service, $mockSheets);

        $success = $service->syncSingleEmployeeToSheet($user);

        $this->assertTrue($success);
        $this->assertEquals('Data Karyawan!A2:I2', $updatedRange);
    }

    public function test_sync_employees_records_password_updated_via_sheet_sync_audit_log(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'department' => 'IT',
            'staff_name' => 'Admin Pass Sync',
        ]);

        $existingStaff = User::factory()->create([
            'name' => 'Rudi Staff',
            'staff_name' => 'Rudi Staff',
            'email' => 'rudi@telunasresorts.com',
            'whatsapp_number' => '628123444555',
            'department' => 'Kitchen',
            'password' => Hash::make('OldSecret2025!'),
        ]);

        $mockSheets = $this->createMock(Sheets::class);
        $mockSpreadsheets = $this->createMock(Spreadsheets::class);
        $mockValues = $this->createMock(SpreadsheetsValues::class);

        $mockSheets->spreadsheets = $mockSpreadsheets;
        $mockSheets->spreadsheets_values = $mockValues;

        $meta = new Spreadsheet();
        $sheetObj = new Sheet();
        $props = new SheetProperties();
        $props->setTitle('Data Karyawan');
        $sheetObj->setProperties($props);
        $meta->setSheets([$sheetObj]);
        $mockSpreadsheets->method('get')->willReturn($meta);

        // Row has plain text password 'NewTelunas2026!'
        $valRange = new ValueRange();
        $valRange->setValues([
            ['Rudi Staff', 'Kitchen', '628123444555', 'rudi@telunasresorts.com', 'NewTelunas2026!', 'staff', '', 'Aktif', ''],
        ]);
        $mockValues->method('get')->willReturn($valRange);
        $mockValues->method('batchUpdate')->willReturn(true);

        $service = new EmployeeSheetService();
        $service->setSpreadsheetId('1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890');

        $reflection = new \ReflectionClass($service);
        $prop = $reflection->getProperty('sheets');
        $prop->setAccessible(true);
        $prop->setValue($service, $mockSheets);

        $result = $service->syncEmployeesFromSheet($admin);

        $this->assertTrue($result['success']);
        $this->assertEquals(1, $result['hashed_passwords']);

        // Check password changed in DB
        $freshRudi = $existingStaff->fresh();
        $this->assertTrue(Hash::check('NewTelunas2026!', $freshRudi->password));

        // Check audit log
        $passLog = UserAuditLog::where('action', 'PASSWORD_UPDATED_VIA_SHEET_SYNC')
            ->where('target_user_id', $existingStaff->id)
            ->first();
        $this->assertNotNull($passLog);
        $this->assertEquals($admin->id, $passLog->admin_id);
        $this->assertTrue($passLog->changes['after']['password_reset']);
    }

    public function test_dry_run_preview_detects_admin_promotion_without_mutating_database_and_enforces_preview_hash(): void
    {
        $admin = User::factory()->create([
            'role'       => 'admin',
            'department' => 'IT',
            'staff_name' => 'Admin Reviewer',
        ]);

        $existingHash = Hash::make('StaySafe2026!');
        $staff = User::factory()->create([
            'name'            => 'Ana Marketing',
            'staff_name'      => 'Ana Marketing',
            'email'           => 'ana@telunasresorts.com',
            'whatsapp_number' => '628123999888',
            'department'      => 'HR',
            'role'            => 'staff',
            'password'        => $existingHash,
        ]);

        $mockSheets = $this->createMock(Sheets::class);
        $mockSpreadsheets = $this->createMock(Spreadsheets::class);
        $mockValues = $this->createMock(SpreadsheetsValues::class);

        $mockSheets->spreadsheets = $mockSpreadsheets;
        $mockSheets->spreadsheets_values = $mockValues;

        $meta = new Spreadsheet();
        $sheetObj = new Sheet();
        $props = new SheetProperties();
        $props->setTitle('Data Karyawan');
        $sheetObj->setProperties($props);
        $meta->setSheets([$sheetObj]);
        $mockSpreadsheets->method('get')->willReturn($meta);

        // Sheet promotes Ana Marketing from staff -> admin
        $valRange = new ValueRange();
        $valRange->setValues([
            ['Ana Marketing', 'HR', '628123999888', 'ana@telunasresorts.com', $existingHash, 'admin', '', 'Aktif', ''],
        ]);
        $mockValues->method('get')->willReturn($valRange);

        // batchUpdate MUST NOT be called during dry-run or stale hash rejection
        $batchUpdateCalls = 0;
        $mockValues->method('batchUpdate')->willReturnCallback(function () use (&$batchUpdateCalls) {
            $batchUpdateCalls++;
            return true;
        });

        $service = new EmployeeSheetService();
        $service->setSpreadsheetId('1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890');
        $reflection = new \ReflectionClass($service);
        $prop = $reflection->getProperty('sheets');
        $prop->setAccessible(true);
        $prop->setValue($service, $mockSheets);

        // 1. Dry-run preview
        $preview = $service->syncEmployeesFromSheet($admin, true);

        $this->assertTrue($preview['success']);
        $this->assertTrue($preview['dry_run']);
        $this->assertFalse($preview['stale_preview']);
        $this->assertNotEmpty($preview['preview_hash']);
        $this->assertEquals(1, $preview['updated']);
        $this->assertCount(1, $preview['changes']);
        $this->assertEquals('Ana Marketing', $preview['changes'][0]['name']);
        $this->assertTrue($preview['changes'][0]['sensitive']);
        $this->assertContains('PROMOTED_TO_ADMIN', $preview['changes'][0]['sensitive_tags']);
        $this->assertCount(1, $preview['security_alerts']);
        $this->assertEquals('critical', $preview['security_alerts'][0]['severity']);
        $this->assertEquals(0, $batchUpdateCalls);

        // Database must remain untouched after dry-run
        $this->assertEquals('staff', $staff->fresh()->role);
        $this->assertEquals(0, UserAuditLog::where('target_user_id', $staff->id)->count());

        // 2. Stale preview hash (simulating sheet tampering between preview and apply) MUST be rejected
        $staleAttempt = $service->syncEmployeesFromSheet($admin, false, str_repeat('0', 64));

        $this->assertFalse($staleAttempt['success']);
        $this->assertTrue($staleAttempt['stale_preview']);
        $this->assertEquals('staff', $staff->fresh()->role);
        $this->assertEquals(0, $batchUpdateCalls);

        // 3. Valid preview hash applies the change cleanly
        $applied = $service->syncEmployeesFromSheet($admin, false, $preview['preview_hash']);

        $this->assertTrue($applied['success']);
        $this->assertFalse($applied['dry_run']);
        $this->assertFalse($applied['stale_preview']);
        $this->assertEquals(1, $applied['updated']);
        $this->assertCount(1, $applied['changes']);
        $this->assertEquals('admin', $staff->fresh()->role);
        $this->assertEquals(1, $batchUpdateCalls);
    }

    public function test_demoted_admin_receives_pre_revocation_whatsapp_alert_at_original_phone_even_if_phone_changed_in_sheet(): void
    {
        $actingAdmin = User::factory()->create([
            'name'            => 'Super Admin',
            'staff_name'      => 'Super Admin',
            'email'           => 'superadmin@telunasresorts.com',
            'whatsapp_number' => '628111000111',
            'role'            => 'admin',
            'department'      => 'IT',
            'is_active'       => true,
        ]);

        $existingHash = Hash::make('AdminPass2026!');
        $victimAdmin = User::factory()->create([
            'name'            => 'Admin Korban',
            'staff_name'      => 'Admin Korban',
            'email'           => 'korban@telunasresorts.com',
            'whatsapp_number' => '628122000222',
            'role'            => 'admin',
            'department'      => 'HR',
            'is_active'       => true,
            'password'        => $existingHash,
        ]);

        // Track role in DB at the exact instant the pre-revocation HTTP call fires!
        $victimRoleAtNotifTime = null;
        $notifiedPhones = [];

        Http::fake(function ($request) use ($victimAdmin, &$victimRoleAtNotifTime, &$notifiedPhones) {
            if (str_contains($request->url(), '/notify-direct')) {
                $phone = $request['phone'] ?? '';
                $notifiedPhones[] = $phone;
                if ($phone === '628122000222') {
                    // Verify victim is STILL 'admin' in DB when they receive the pre-revocation alert!
                    $victimRoleAtNotifTime = User::find($victimAdmin->id)?->role;
                }
            }
            return Http::response(['success' => true], 200);
        });

        $mockSheets = $this->createMock(Sheets::class);
        $mockSpreadsheets = $this->createMock(Spreadsheets::class);
        $mockValues = $this->createMock(SpreadsheetsValues::class);
        $mockSheets->spreadsheets = $mockSpreadsheets;
        $mockSheets->spreadsheets_values = $mockValues;

        $meta = new Spreadsheet();
        $sheetObj = new Sheet();
        $props = new SheetProperties();
        $props->setTitle('Data Karyawan');
        $sheetObj->setProperties($props);
        $meta->setSheets([$sheetObj]);
        $mockSpreadsheets->method('get')->willReturn($meta);

        // Attacker demotes Admin Korban to staff AND tries to change their phone number to silence alert!
        $valRange = new ValueRange();
        $valRange->setValues([
            ['Admin Korban', 'HR', '081999888777', 'korban@telunasresorts.com', $existingHash, 'staff', '', 'Aktif', ''],
        ]);
        $mockValues->method('get')->willReturn($valRange);
        $mockValues->method('batchUpdate')->willReturn(true);

        $service = new EmployeeSheetService();
        $service->setSpreadsheetId('1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890');
        $reflection = new \ReflectionClass($service);
        $prop = $reflection->getProperty('sheets');
        $prop->setAccessible(true);
        $prop->setValue($service, $mockSheets);

        $result = $service->syncEmployeesFromSheet($actingAdmin, false);
        // Trigger terminating callbacks (as HTTP Kernel::terminate does)
        app()->terminate();

        $this->assertTrue($result['success']);
        // 1. Victim was STILL admin in DB at the moment they received the WhatsApp alert!
        $this->assertEquals('admin', $victimRoleAtNotifTime);
        // 2. Final role in DB is now staff
        $this->assertEquals('staff', $victimAdmin->fresh()->role);
        // 3. Original phone (628122000222) received alert (NOT silenced by phone swap to 6281999888777)
        $this->assertContains('628122000222', $notifiedPhones);
        // 4. Other active admin (628111000111) also received the security alert
        $this->assertContains('628111000111', $notifiedPhones);
        // 5. Victim did not receive duplicate alerts
        $this->assertEquals(1, count(array_filter($notifiedPhones, fn ($p) => $p === '628122000222')));
    }

    public function test_web_demotion_and_archive_notify_admin_before_revocation_with_email_fallback_when_bot_offline(): void
    {
        Mail::fake();

        // Reset Http fake from setUp() so we cleanly simulate WhatsApp bot offline (HTTP 500) -> must fallback to Email!
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake([
            '*' => Http::response(['error' => 'Bot offline'], 500),
        ]);

        $actingAdmin = User::factory()->create([
            'name'            => 'Primary Admin',
            'staff_name'      => 'Primary Admin',
            'email'           => 'primary.admin@telunasresorts.com',
            'whatsapp_number' => '081111222333',
            'role'            => 'admin',
            'department'      => 'IT',
            'is_active'       => true,
        ]);

        $demotedAdmin = User::factory()->create([
            'name'            => 'Second Admin',
            'staff_name'      => 'Second Admin',
            'email'           => 'second.admin@telunasresorts.com',
            'whatsapp_number' => '081222333444',
            'role'            => 'admin',
            'department'      => 'HR',
            'is_active'       => true,
        ]);

        // Mock EmployeeSheetService so update() doesn't call real Google API
        $mockSheetService = $this->createMock(EmployeeSheetService::class);
        $mockSheetService->method('syncSingleEmployeeToSheet')->willReturn(true);
        $this->app->instance(EmployeeSheetService::class, $mockSheetService);

        // Demote Second Admin from admin -> department via Web endpoint
        $res = $this->actingAs($actingAdmin)->putJson("/api/users/{$demotedAdmin->id}", [
            'name'            => 'Second Admin',
            'staff_name'      => 'Second Admin',
            'email'           => 'second.admin@telunasresorts.com',
            'role'            => 'department',
            'department'      => 'HR',
            'subdivision'     => 'HR',
            'whatsapp_number' => '081222333444',
            'is_active'       => true,
        ]);

        $res->assertStatus(200);
        $this->assertEquals('department', $demotedAdmin->fresh()->role);

        // Also test archiving a third Admin via DELETE /api/users/{id}
        $thirdAdmin = User::factory()->create([
            'name'            => 'Third Admin',
            'staff_name'      => 'Third Admin',
            'email'           => 'third.admin@telunasresorts.com',
            'whatsapp_number' => '081333444555',
            'role'            => 'admin',
            'department'      => 'IT',
            'is_active'       => true,
        ]);

        $delRes = $this->actingAs($actingAdmin)->deleteJson("/api/users/{$thirdAdmin->id}");
        $delRes->assertStatus(200);
        $this->assertTrue($thirdAdmin->fresh()->trashed());

        // Verify fallback email delivery when WA bot is offline
        $delivery = \App\Services\TicketNotificationService::notifyTargetAdminBeforeRevocation([
            'type'              => 'DEMOTED_FROM_ADMIN',
            'target_name'       => 'Second Admin',
            'target_email'      => 'second.admin@telunasresorts.com',
            'target_department' => 'HR',
            'change_detail'     => 'Administrator → Departemen / Staff',
            'actor_name'        => 'Primary Admin',
            'actor_ip'          => '127.0.0.1',
            'source'            => 'Web Manajemen User',
        ], [
            'id'              => $demotedAdmin->id,
            'name'            => 'Second Admin',
            'whatsapp_number' => '081222333444',
            'email'           => 'second.admin@telunasresorts.com',
        ]);

        $this->assertFalse($delivery['whatsapp_sent']);
        $this->assertTrue($delivery['email_sent']);
    }

    public function test_department_role_exports_as_staff_to_sheet_and_round_trips_without_false_diff(): void
    {
        $existingHash = Hash::make('DeptUser2026!');
        $deptUser = User::factory()->create([
            'name'            => 'Siti Dept',
            'staff_name'      => 'Siti Dept',
            'email'           => 'siti@telunasresorts.com',
            'whatsapp_number' => '628123555666',
            'department'      => 'HR',
            'subdivision'     => 'HR',
            'role'            => 'department',
            'password'        => $existingHash,
            'is_active'       => true,
        ]);

        $adminUser = User::factory()->create([
            'name'            => 'Budi Admin',
            'staff_name'      => 'Budi Admin',
            'email'           => 'budi.admin@telunasresorts.com',
            'whatsapp_number' => '628123777888',
            'department'      => 'IT',
            'role'            => 'admin',
            'password'        => $existingHash,
            'is_active'       => true,
        ]);

        $mockSheets = $this->createMock(Sheets::class);
        $mockSpreadsheets = $this->createMock(Spreadsheets::class);
        $mockValues = $this->createMock(SpreadsheetsValues::class);
        $mockSheets->spreadsheets = $mockSpreadsheets;
        $mockSheets->spreadsheets_values = $mockValues;

        $meta = new Spreadsheet();
        $sheetObj = new Sheet();
        $props = new SheetProperties();
        $props->setTitle('Data Karyawan');
        $sheetObj->setProperties($props);
        $meta->setSheets([$sheetObj]);
        $mockSpreadsheets->method('get')->willReturn($meta);

        $exportedRows = [];
        $capturedBatchRequests = [];
        $mockSpreadsheets->method('batchUpdate')->willReturnCallback(function ($sheetId, $body) use (&$capturedBatchRequests) {
            $capturedBatchRequests = $body->getRequests() ?: [];
            return true;
        });
        $mockValues->method('clear')->willReturn(true);
        $mockValues->method('update')->willReturnCallback(function ($sheetId, $range, $body) use (&$exportedRows) {
            $exportedRows = $body->getValues();
            return true;
        });

        $service = new EmployeeSheetService();
        $service->setSpreadsheetId('1TEST_MOCK_EMPLOYEE_SHEET_ID_ABCD1234567890');
        $reflection = new \ReflectionClass($service);
        $prop = $reflection->getProperty('sheets');
        $prop->setAccessible(true);
        $prop->setValue($service, $mockSheets);

        // 1. Export Web -> Sheet must write 'staff' (NOT 'department') for department users, and 'admin' for admins
        $exportRes = $service->exportAllEmployeesToSheet();
        $this->assertTrue($exportRes['success']);

        // Verify Column F dropdown validation ('staff' / 'admin') was configured via batchUpdate
        $validationReq = null;
        foreach ($capturedBatchRequests as $req) {
            if ($req->getSetDataValidation() !== null) {
                $validationReq = $req->getSetDataValidation();
                break;
            }
        }
        $this->assertNotNull($validationReq);
        $this->assertEquals(1, $validationReq->getRange()->getStartRowIndex());
        $this->assertEquals(5, $validationReq->getRange()->getStartColumnIndex());
        $this->assertEquals(6, $validationReq->getRange()->getEndColumnIndex());
        $this->assertEquals('ONE_OF_LIST', $validationReq->getRule()->getCondition()->getType());
        $this->assertTrue($validationReq->getRule()->getStrict());
        $this->assertTrue($validationReq->getRule()->getShowCustomUi());
        $allowedRoleValues = array_map(
            fn ($v) => $v->getUserEnteredValue(),
            $validationReq->getRule()->getCondition()->getValues()
        );
        $this->assertEquals(['staff', 'admin'], $allowedRoleValues);

        $rolesByEmail = [];
        foreach ($exportedRows as $r) {
            $rolesByEmail[$r[3]] = $r[5];
        }
        $this->assertEquals('staff', $rolesByEmail['siti@telunasresorts.com']);
        $this->assertEquals('admin', $rolesByEmail['budi.admin@telunasresorts.com']);

        // 2. Single-user sync Web -> Sheet must also write 'staff' (NOT 'department')
        $singleRow = null;
        $mockValuesSingle = $this->createMock(SpreadsheetsValues::class);
        $valRangeSingle = new ValueRange();
        $valRangeSingle->setValues([
            ['Siti Dept', 'HR', '628123555666', 'siti@telunasresorts.com', $existingHash, 'department', 'HR', 'Aktif', 'Tersinkron'],
        ]);
        $mockValuesSingle->method('get')->willReturn($valRangeSingle);
        $mockValuesSingle->method('update')->willReturnCallback(function ($sheetId, $range, $body) use (&$singleRow) {
            $singleRow = $body->getValues()[0] ?? null;
            return true;
        });
        $mockSheets->spreadsheets_values = $mockValuesSingle;

        $this->assertTrue($service->syncSingleEmployeeToSheet($deptUser));
        $this->assertEquals('staff', $singleRow[5]);

        // 3. Round-trip Sheet ('staff') -> Web (DB has 'department') must produce 0 false changes
        $mockValuesRoundTrip = $this->createMock(SpreadsheetsValues::class);
        $valRangeRoundTrip = new ValueRange();
        $valRangeRoundTrip->setValues([
            ['Siti Dept', 'HR', '628123555666', 'siti@telunasresorts.com', $existingHash, 'staff', 'HR', 'Aktif', 'Tersinkron'],
        ]);
        $mockValuesRoundTrip->method('get')->willReturn($valRangeRoundTrip);
        $mockSheets->spreadsheets_values = $mockValuesRoundTrip;

        $preview = $service->syncEmployeesFromSheet($adminUser, true);
        $this->assertTrue($preview['success']);
        $this->assertEquals(0, $preview['updated']);
        $this->assertEquals(1, $preview['skipped']);
        $this->assertEmpty($preview['changes']);
    }
}
