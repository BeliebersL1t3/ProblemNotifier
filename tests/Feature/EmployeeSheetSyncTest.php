<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserAuditLog;
use App\Services\EmployeeSheetService;
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
        if ($this->originalConfigFileContent !== null) {
            File::put($this->configFilePath, $this->originalConfigFileContent);
        } elseif (File::exists($this->configFilePath)) {
            File::delete($this->configFilePath);
        }

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
            'url' => 'https://docs.google.com/spreadsheets/d/1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg/edit',
        ])->assertStatus(403);

        // Admin can update
        $res = $this->actingAs($admin)->post('/users/employee-sheet-config', [
            'url' => 'https://docs.google.com/spreadsheets/d/1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg/edit',
        ]);
        $res->assertStatus(200);
        $res->assertJsonPath('success', true);
        $res->assertJsonPath('spreadsheet_id', '1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg');

        // Admin can read back config
        $getRes = $this->actingAs($admin)->get('/users/employee-sheet-config');
        $getRes->assertStatus(200);
        $getRes->assertJsonPath('spreadsheet_id', '1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg');
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
        $service->setSpreadsheetId('1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg');

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

        // Verify UserAuditLog
        $log = UserAuditLog::where('action', 'BATCH_USERS_SYNCED_FROM_SHEET')->latest()->first();
        $this->assertNotNull($log);
        $this->assertEquals($admin->id, $log->admin_id);
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
        $service->setSpreadsheetId('1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg');

        $reflection = new \ReflectionClass($service);
        $prop = $reflection->getProperty('sheets');
        $prop->setAccessible(true);
        $prop->setValue($service, $mockSheets);

        $success = $service->syncSingleEmployeeToSheet($user);

        $this->assertTrue($success);
        $this->assertEquals('Data Karyawan!A2:I2', $updatedRange);
    }
}
