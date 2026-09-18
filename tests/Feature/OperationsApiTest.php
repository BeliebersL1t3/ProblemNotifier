<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\GoogleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\TestCase;

class OperationsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create(['role' => 'admin', 'department' => 'Engineer']);
        $this->actingAs($user);
    }

    public function test_unauthenticated_guest_cannot_access_operations(): void
    {
        auth()->logout();
        $response = $this->getJson('/api/operations?dept=Engineer');
        $response->assertStatus(401);
    }

    public function test_can_fetch_operations_data(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('listSheets')->andReturn(['2026', 'Ops_Engineer']);
        $googleMock->shouldReceive('getOpsWorkItems')->with('Engineer', false)->andReturn([
            [
                'id'          => 'OPS-ENG-1',
                'title'       => 'Check AC Villa 1',
                'description' => 'Fix leaking pipe',
                'status'      => 'todo',
                'photoUrl'    => 'sample.jpg',
            ]
        ]);
        $googleMock->shouldReceive('setSheet')->with('2026');
        $googleMock->shouldReceive('getRows')->with(false)->andReturn([]);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->getJson('/api/operations?dept=Engineer');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'dept'    => 'Engineer',
            ])
            ->assertJsonStructure([
                'success',
                'dept',
                'availableSheets',
                'manual',
                'issues',
            ]);
    }

    public function test_can_create_operations_work_item(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('appendOpsWorkItem')->once()->andReturn('OPS-ENG-101');

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->postJson('/api/operations', [
            'dept'        => 'Engineer',
            'title'       => 'Repair Jetty Light',
            'description' => 'Replace blown bulb',
            'priority'    => 'urgent',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'id'      => 'OPS-ENG-101',
            ]);
    }

    public function test_store_operations_forces_department_user_attributes(): void
    {
        $deptUser = User::factory()->create([
            'role'       => 'department',
            'department' => 'Housekeeping',
            'staff_name' => 'Siti',
        ]);

        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('appendOpsWorkItem')
            ->once()
            ->with('Housekeeping', Mockery::on(function ($data) {
                return $data['dept'] === 'Housekeeping' && $data['createdBy'] === 'Siti';
            }))
            ->andReturn('OPS-HK-202');

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->actingAs($deptUser)
            ->postJson('/api/operations', [
                'dept'  => 'Engineer', // Should be overridden to Housekeeping
                'title' => 'Deep Clean Room 5',
            ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'id'      => 'OPS-HK-202',
            ]);
    }

    public function test_update_operations_work_item(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('updateOpsWorkItem')
            ->once()
            ->with('Engineer', 5, Mockery::on(function ($fields) {
                return ($fields['status'] ?? '') === 'done' && !empty($fields['completedAt']);
            }))
            ->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->patchJson('/api/operations/5', [
            'dept'   => 'Engineer',
            'status' => 'done',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ]);
    }

    public function test_delete_operations_work_item(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('deleteOpsWorkItem')
            ->once()
            ->with('Engineer', 5)
            ->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->deleteJson('/api/operations/5', [
            'dept' => 'Engineer',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ]);
    }

    public function test_sync_calendar_endpoint(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('syncAllToGoogleCalendar')
            ->once()
            ->andReturn(['synced' => 12, 'deleted' => 0]);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->actingAs($admin)->postJson('/api/operations/sync-calendar');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data'    => ['synced' => 12, 'deleted' => 0],
            ]);
    }
}
