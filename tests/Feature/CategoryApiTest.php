<?php

namespace Tests\Feature;

use App\Services\GoogleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class CategoryApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $user = \App\Models\User::factory()->create(['role' => 'admin']);
        $this->actingAs($user);
    }

    public function test_unauthenticated_guest_cannot_access_categories(): void
    {
        auth()->logout();
        $response = $this->getJson('/api/categories');
        $response->assertStatus(401);
    }

    public function test_can_list_default_categories(): void
    {
        $response = $this->getJson('/api/categories');

        $response->assertOk()
            ->assertJson([
                'success' => true,
            ])
            ->assertJsonStructure([
                'success',
                'data' => [
                    '*' => ['id', 'label']
                ]
            ]);

        $this->assertNotEmpty($response->json('data'));
    }

    public function test_can_store_new_category(): void
    {
        $response = $this->postJson('/api/categories', [
            'id'    => 'aircon',
            'label' => 'Air Conditioning',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Category saved successfully',
            ]);

        $categories = $response->json('data');
        $this->assertContains([
            'id'    => 'aircon',
            'label' => 'Air Conditioning',
        ], $categories);
    }

    public function test_store_category_validates_required_fields(): void
    {
        $response = $this->postJson('/api/categories', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['id', 'label']);
    }

    public function test_can_delete_category(): void
    {
        // Add category first
        $this->postJson('/api/categories', [
            'id'    => 'custom_cat',
            'label' => 'Custom Category',
        ]);

        // Mock GoogleService
        $googleMock = Mockery::mock(GoogleService::class);
        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->postJson('/api/categories/delete-and-reassign', [
            'category_id' => 'custom_cat',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Category deleted successfully',
            ]);

        $categories = $response->json('data');
        $ids = array_column($categories, 'id');
        $this->assertNotContains('custom_cat', $ids);
    }

    public function test_delete_and_reassign_category_updates_google_sheets(): void
    {
        $googleMock = Mockery::mock(GoogleService::class);
        $googleMock->shouldReceive('setSheet')->once()->with('2026');
        $googleMock->shouldReceive('getRows')->once()->andReturn([
            ['ISS-001', 'Leak', 'Desc', 'Villa 1', 'plumbing'],
            ['ISS-002', 'Broken Door', 'Desc', 'Villa 2', 'broken'],
        ]);
        $googleMock->shouldReceive('updateRow')->once()->with(2, ['E' => 'other'])->andReturn(true);

        $this->app->instance(GoogleService::class, $googleMock);

        $response = $this->postJson('/api/categories/delete-and-reassign', [
            'category_id'    => 'plumbing',
            'replacement_id' => 'other',
            'sheet'          => '2026',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Category deleted successfully',
            ]);
    }
}
