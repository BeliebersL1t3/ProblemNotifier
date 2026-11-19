<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\LeanSheetDirectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LeanSpreadsheetAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('cache.default', 'array');
        Config::set('session.driver', 'array');

        $sheetMock = $this->createMock(LeanSheetDirectService::class);
        $sheetMock->method('getMonthGids')->willReturn(['November' => 603002305]);
        $sheetMock->method('getYearlySpreadsheets')->willReturn([
            '2026' => [
                'year' => 2026,
                'spreadsheet_id' => 'test-id-123',
                'url' => 'https://docs.google.com/spreadsheets/d/test-id-123/edit',
            ],
        ]);
        $this->app->instance(LeanSheetDirectService::class, $sheetMock);

        $gasMock = $this->createMock(GoogleSheetsSyncService::class);
        $this->app->instance(GoogleSheetsSyncService::class, $gasMock);

        Http::fake(['*' => Http::response(['success' => true], 200)]);
    }

    protected function makeUser(string $role = 'department'): User
    {
        return User::factory()->create([
            'name'            => $role === 'admin' ? 'Admin User' : 'Staff User',
            'staff_name'      => $role === 'admin' ? 'Admin Staff' : 'Department Staff',
            'role'            => $role,
            'approval_status' => 'approved',
            'is_active'       => true,
        ]);
    }

    public function test_non_admin_cannot_access_spreadsheets_config(): void
    {
        $deptUser = $this->makeUser('department');

        $response = $this->actingAs($deptUser)->getJson('/lapangan/spreadsheets');
        $response->assertStatus(403);
    }

    public function test_non_admin_cannot_connect_spreadsheet(): void
    {
        $deptUser = $this->makeUser('department');

        $response = $this->actingAs($deptUser)->postJson('/lapangan/spreadsheets/connect', [
            'year' => 2026,
            'url'  => 'https://docs.google.com/spreadsheets/d/test-id-123/edit',
        ]);
        $response->assertStatus(403);
    }

    public function test_non_admin_receives_null_spreadsheet_url_on_dashboard(): void
    {
        $deptUser = $this->makeUser('department');

        $response = $this->actingAs($deptUser)->get('/lapangan');
        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Lean/Index')
            ->where('spreadsheetUrl', null)
        );
    }

    public function test_admin_can_access_spreadsheets_config(): void
    {
        $adminUser = $this->makeUser('admin');

        $response = $this->actingAs($adminUser)->getJson('/lapangan/spreadsheets');
        $response->assertOk()
            ->assertJson([
                'success' => true,
            ])
            ->assertJsonStructure([
                'data',
                'yearly_spreadsheets',
            ]);
    }

    public function test_admin_receives_official_spreadsheet_url_on_dashboard(): void
    {
        $adminUser = $this->makeUser('admin');

        $response = $this->actingAs($adminUser)->get('/lapangan');
        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Lean/Index')
            ->whereNot('spreadsheetUrl', null)
        );
    }
}
