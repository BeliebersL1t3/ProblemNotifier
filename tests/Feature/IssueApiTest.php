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
            array_pad(['ENG-001', 'AC', 'Desc', 'Loc', 'Cat', 'open', 'Rep', 'Date'], 25, '')
        ]);
        $googleMock->shouldReceive('updateRow')->once()->with(2, Mockery::on(function ($updates) {
            return $updates['F'] === 'progress' && $updates['J'] === 'Hendro Tech';
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
            array_pad(['ENG-001', 'AC', 'Desc', 'Loc', 'Cat', 'progress', 'Rep', 'Date'], 25, '')
        ]);
        $googleMock->shouldReceive('updateRow')->once()->with(2, Mockery::on(function ($updates) {
            return $updates['F'] === 'pending' && $updates['T'] === 'Budi';
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
            array_pad(['ENG-001', 'AC', 'Desc', 'Loc', 'Cat', 'progress', 'Rep', '2026-09-08T09:00:00Z', '', 'Budi', '2026-09-08T09:30:00Z'], 25, '')
        ]);
        $googleMock->shouldReceive('updateRow')->once()->with(2, Mockery::on(function ($updates) {
            return $updates['F'] === 'solved' && $updates['L'] === 'Budi Tech';
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
            array_pad(['ENG-001', 'Title', 'Desc', 'Loc', 'Cat', 'open'], 25, '')
        ]);
        $googleMock->shouldReceive('deleteRow')->once()->with(2, '2026')->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->actingAs($admin)->deleteJson('/api/issues/2', [
            'sheet' => '2026',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ]);
    }
}
