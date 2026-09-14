<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\GoogleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class IssueApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake();
    }

    public function test_can_list_sheets(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('listSheets')->once()->andReturn(['2025', '2026']);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->getJson('/api/sheets');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data'    => ['2025', '2026'],
                'newest'  => '2026',
            ]);
    }

    public function test_non_admin_cannot_create_sheet(): void
    {
        $deptUser = User::factory()->create(['role' => 'department']);

        $response = $this->actingAs($deptUser)->postJson('/api/sheets', [
            'name' => '2027',
        ]);

        $response->assertStatus(403)
            ->assertJson([
                'success' => false,
            ]);
    }

    public function test_admin_can_create_sheet(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('listSheets')->once()->andReturn(['2026']);
        $googleMock->shouldReceive('createYearSheet')->once()->with('2027')->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->actingAs($admin)->postJson('/api/sheets', [
            'name' => '2027',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => "Sheet '2027' created successfully.",
            ]);
    }

    public function test_can_list_issues(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $googleMock->shouldReceive('getRows')->with(false)->andReturn([
            [
                'ENG-090926-2',       // 0: id
                'Leaking Pipe',       // 1: title
                'Water dripping',     // 2: description
                'Villa 1',            // 3: location
                'plumbing',           // 4: category
                'open',               // 5: status
                'Budi',               // 6: reporter
                '2026-09-08T10:00:00Z', // 7: reportedAt
                'issue.jpg',          // 8: imageUrl
            ]
        ]);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->getJson('/api/issues?sheet=2026');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'sheet'   => '2026',
            ])
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', 'ENG-090926-2')
            ->assertJsonPath('data.0.title', 'Leaking Pipe');
    }

    public function test_can_create_issue(): void
    {
        Storage::fake('local');

        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $googleMock->shouldReceive('getRows')->andReturn([]);
        $googleMock->shouldReceive('uploadImage')->once()->andReturn('uploaded_problem.jpg');
        $googleMock->shouldReceive('appendRow')->once()->andReturn(2);
        $googleMock->shouldReceive('colorRowByCategory')->once()->with(2, 'electrical')->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $image = UploadedFile::fake()->image('problem.jpg');

        $response = $this->postJson('/api/issues', [
            'title'       => 'AC Broken',
            'description' => 'AC is not blowing cold air',
            'location'    => 'Villa 3',
            'category'    => 'electrical',
            'department'  => 'Engineer',
            'reporter'    => 'Guest Service',
            'priority'    => 'urgent',
            'image'       => $image,
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Issue reported successfully!',
            ])
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'id',
                    'title',
                    'description',
                    'location',
                    'category',
                    'status',
                    'reporter',
                ],
            ]);
    }

    public function test_create_issue_validates_required_fields(): void
    {
        $response = $this->postJson('/api/issues', []);

        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
            ])
            ->assertJsonValidationErrors(['title', 'description', 'location', 'category', 'department', 'reporter']);
    }

    public function test_can_claim_issue(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('findIssueAcrossSheets')->andReturn(null);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $googleMock->shouldReceive('getRows')->andReturn([
            array_pad(['ENG-001', 'AC', 'Desc', 'Loc', 'Cat', 'open', 'Rep', 'Date'], 26, '')
        ]);
        $googleMock->shouldReceive('updateRow')->once()->with(2, Mockery::on(function ($row) {
            return $row[0] === 'ENG-001' && $row[5] === 'progress' && $row[9] === 'Hendro Tech' && $row[25] === '1';
        }))->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->postJson('/api/issues/2/claim', [
            'taker' => 'Hendro Tech',
            'sheet' => '2026',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data'    => [
                    'status' => 'progress',
                    'taker'  => 'Hendro Tech',
                ],
            ]);
    }

    public function test_can_set_issue_pending(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('findIssueAcrossSheets')->andReturn(null);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $googleMock->shouldReceive('getRows')->andReturn([
            array_pad(['ENG-001', 'AC', 'Desc', 'Loc', 'Cat', 'progress', 'Rep', 'Date'], 26, '')
        ]);
        $googleMock->shouldReceive('updateRow')->once()->with(2, Mockery::on(function ($row) {
            return $row[0] === 'ENG-001' && $row[5] === 'pending' && $row[19] === 'Budi' && $row[25] === '1';
        }))->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->postJson('/api/issues/2/pending', [
            'pendingReason' => 'Waiting for spare part',
            'pendingBy'     => 'Budi',
            'sheet'         => '2026',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data'    => [
                    'status'    => 'pending',
                    'pendingBy' => 'Budi',
                ],
            ]);
    }

    public function test_can_resolve_issue(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('findIssueAcrossSheets')->andReturn(null);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $googleMock->shouldReceive('getRows')->andReturn([
            array_pad(['ENG-001', 'AC', 'Desc', 'Loc', 'Cat', 'progress', 'Rep', '2026-09-08T09:00:00Z', '', 'Budi', '2026-09-08T09:30:00Z'], 26, '')
        ]);
        $googleMock->shouldReceive('updateRow')->once()->with(2, Mockery::on(function ($row) {
            return $row[0] === 'ENG-001' && $row[5] === 'solved' && $row[11] === 'Budi Tech' && $row[25] === '1';
        }))->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->postJson('/api/issues/2/resolve', [
            'solver'         => 'Budi Tech',
            'fixDescription' => 'Replaced capacitor and refilled freon',
            'sheet'          => '2026',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data'    => [
                    'status' => 'solved',
                    'solver' => 'Budi Tech',
                ],
            ]);
    }

    public function test_can_delete_issue(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('findIssueAcrossSheets')->andReturn(null);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $googleMock->shouldReceive('getRows')->andReturn([
            array_pad(['ENG-001', 'Title', 'Desc', 'Loc', 'Cat', 'open'], 26, '')
        ]);
        $googleMock->shouldReceive('insertRowAfter')->once()->with(2, Mockery::on(function ($row) {
            return $row[0] === 'ENG-001' && $row[25] === '0' && str_contains($row[24], 'Isu diarsipkan oleh Admin');
        }), Mockery::any())->andReturn(3);
        $googleMock->shouldReceive('colorRowByCategory')->once()->andReturn(true);
        $googleMock->shouldReceive('batchUpdateColumn')->once()->with([2, 3], 'Z', '0', Mockery::any())->andReturn(null);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->actingAs($admin)->deleteJson('/api/issues/2', [
            'sheet' => '2026',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ]);
    }

    public function test_can_restore_issue(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('findIssueAcrossSheets')->andReturn(null);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $googleMock->shouldReceive('getRows')->andReturn([
            array_pad(['ENG-001', 'Title', 'Desc', 'Loc', 'Cat', 'progress'], 26, '')
        ]);
        $googleMock->shouldReceive('insertRowAfter')->once()->with(2, Mockery::on(function ($row) {
            return $row[0] === 'ENG-001' && $row[25] === '1' && str_contains($row[24], 'Isu dipulihkan oleh Admin');
        }), Mockery::any())->andReturn(3);
        $googleMock->shouldReceive('colorRowByCategory')->once()->andReturn(true);
        $googleMock->shouldReceive('batchUpdateColumn')->once()->with([2, 3], 'Z', '1', Mockery::any())->andReturn(null);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->actingAs($admin)->postJson('/api/issues/2/restore', [
            'sheet' => '2026',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data'    => [
                    'id'     => 'ENG-001',
                    'status' => 'progress',
                ],
            ]);
    }

    public function test_edit_issue_creates_new_row(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('findIssueAcrossSheets')->andReturn(null);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $googleMock->shouldReceive('getRows')->andReturn([
            array_pad(['ENG-001', 'Old Title', 'Old Desc', 'Villa 1', 'plumbing', 'open'], 26, '')
        ]);
        $googleMock->shouldReceive('insertRowAfter')->once()->with(2, Mockery::on(function ($newRow) {
            return $newRow[0] === 'ENG-001' 
                && $newRow[1] === 'New Title' 
                && !empty($newRow[24]) // Edit History has note
                && $newRow[25] === '1';
        }), Mockery::any())->andReturn(3);
        $googleMock->shouldReceive('colorRowByCategory')->once()->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->actingAs($admin)->postJson('/api/issues/2/update', [
            'title'       => 'New Title',
            'description' => 'Old Desc',
            'location'    => 'Villa 1',
            'category'    => 'plumbing',
            'sheet'       => '2026',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ]);
    }

    public function test_delete_issue_with_multiple_versions_sets_all_rows_to_zero(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('findIssueAcrossSheets')->andReturn(null);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        // Suppose ENG-001 has 2 rows (row 2 and row 3)
        $googleMock->shouldReceive('getRows')->andReturn([
            array_pad(['ENG-001', 'Old Title', 'Desc', 'Loc', 'Cat', 'progress'], 26, ''),
            array_pad(['ENG-001', 'Edited Title', 'Desc', 'Loc', 'Cat', 'open'], 26, ''),
        ]);
        $googleMock->shouldReceive('insertRowAfter')->once()->with(3, Mockery::on(function ($row) {
            return $row[0] === 'ENG-001' && $row[25] === '0' && str_contains($row[24], 'Isu diarsipkan oleh Admin');
        }), Mockery::any())->andReturn(4);
        $googleMock->shouldReceive('colorRowByCategory')->once()->andReturn(true);
        // All rows [2, 3, 4] should have Column Z set to '0'
        $googleMock->shouldReceive('batchUpdateColumn')->once()->with([2, 3, 4], 'Z', '0', Mockery::any())->andReturn(null);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->actingAs($admin)->deleteJson('/api/issues/ENG-001', [
            'sheet' => '2026',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ]);
    }

    public function test_non_admin_cannot_delete_issue(): void
    {
        $deptUser = User::factory()->create(['role' => 'department', 'department' => 'HK']);

        $response = $this->actingAs($deptUser)->deleteJson('/api/issues/ENG-001', [
            'sheet' => '2026',
        ]);

        $response->assertStatus(403);
    }

    public function test_non_admin_cannot_access_archived_issues(): void
    {
        $deptUser = User::factory()->create(['role' => 'department', 'department' => 'HK']);

        $response = $this->actingAs($deptUser)->getJson('/api/issues?archived=true&sheet=2026');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data'    => [],
            ]);
    }

    public function test_admin_can_access_archived_issues(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026']);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $archivedRow = array_pad(['ENG-001', 'Archived Title', 'Desc', 'Loc', 'Cat', 'open', 'Reporter', '2026-09-10'], 26, '');
        $archivedRow[24] = '[14 Sep, 10:34] Gardiono: Isu diarsipkan oleh Admin';
        $archivedRow[25] = '0'; // Display Status = 0 (Archived)

        $googleMock->shouldReceive('getRows')->andReturn([$archivedRow]);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->actingAs($admin)->getJson('/api/issues?archived=true&sheet=2026');

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ]);

        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertEquals('ENG-001', $data[0]['id']);
        $this->assertTrue($data[0]['isArchived']);
        $this->assertEquals('Gardiono', $data[0]['archivedBy']);
    }
}

