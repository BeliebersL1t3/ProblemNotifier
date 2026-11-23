<?php

namespace Tests\Feature;

use App\Models\LeanIssue;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeanMapPinTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
    }

    public function test_can_create_issue_with_map_coordinates()
    {
        $user = User::factory()->create([
            'role'       => 'staff',
            'department' => 'Engineering',
        ]);

        $response = $this->actingAs($user)->post('/lapangan/issues', [
            'title'              => 'AC Mati di Villa 1',
            'location'           => 'Overwater Villa 01',
            'description'        => 'Kompresor AC bocor freon',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Budi',
            'reporter_dept'      => 'Front Office',
            'map_resort'         => 'TPI',
            'map_x'              => 45.5,
            'map_y'              => 62.3,
            'map_label'          => 'Overwater Villa 01',
        ]);

        $this->assertDatabaseHas('lean_issues', [
            'title'      => 'AC Mati di Villa 1',
            'map_resort' => 'TPI',
            'map_x'      => 45.5,
            'map_y'      => 62.3,
            'map_label'  => 'Overwater Villa 01',
        ]);
    }

    public function test_target_department_user_can_attach_pin_to_unmapped_issue()
    {
        $engineeringStaff = User::factory()->create([
            'role'       => 'staff',
            'department' => 'Engineering',
        ]);

        $issue = LeanIssue::create([
            'title'              => 'Lampu Dermaga Mati',
            'location'           => 'Main Jetty',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Wayan',
            'reporter_dept'      => 'Front Office',
            'status'             => 'open',
        ]);

        $response = $this->actingAs($engineeringStaff)->postJson("/lapangan/issues/{$issue->id}/pin", [
            'map_resort' => 'TPI',
            'map_x'      => 80.25,
            'map_y'      => 15.75,
            'map_label'  => 'Main Jetty Pier',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
        ]);

        $this->assertDatabaseHas('lean_issues', [
            'id'         => $issue->id,
            'map_resort' => 'TPI',
            'map_x'      => 80.25,
            'map_y'      => 15.75,
            'map_label'  => 'Main Jetty Pier',
        ]);
    }

    public function test_other_department_user_cannot_attach_pin()
    {
        $fbStaff = User::factory()->create([
            'role'       => 'staff',
            'department' => 'Food & Beverage',
        ]);

        $issue = LeanIssue::create([
            'title'              => 'Genset Overheat',
            'location'           => 'Power House',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Pak Joko',
            'reporter_dept'      => 'Security',
            'status'             => 'open',
        ]);

        $response = $this->actingAs($fbStaff)->postJson("/lapangan/issues/{$issue->id}/pin", [
            'map_resort' => 'TPI',
            'map_x'      => 10.0,
            'map_y'      => 20.0,
        ]);

        $response->assertStatus(403);
    }

    public function test_admin_can_attach_pin_to_any_department_issue()
    {
        $admin = User::factory()->create([
            'role'       => 'admin',
            'department' => 'Management',
        ]);

        $issue = LeanIssue::create([
            'title'              => 'Piring Pecah di Dapur',
            'location'           => 'Main Kitchen',
            'target_departments' => ['Housekeeping'],
            'reporter_name'      => 'Chef Anton',
            'reporter_dept'      => 'Food & Beverage',
            'status'             => 'open',
        ]);

        $response = $this->actingAs($admin)->postJson("/lapangan/issues/{$issue->id}/pin", [
            'map_resort' => 'TBR',
            'map_x'      => 33.3,
            'map_y'      => 44.4,
            'map_label'  => 'Main Kitchen Area',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('lean_issues', [
            'id'         => $issue->id,
            'map_resort' => 'TBR',
            'map_x'      => 33.3,
            'map_y'      => 44.4,
        ]);
    }

    public function test_can_clear_pin_from_issue()
    {
        $admin = User::factory()->create([
            'role' => 'admin',
        ]);

        $issue = LeanIssue::create([
            'title'              => 'Issue on map',
            'location'           => 'Beach',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Admin',
            'status'             => 'open',
            'map_resort'         => 'TPI',
            'map_x'              => 50.0,
            'map_y'              => 50.0,
            'map_label'          => 'Beach area',
        ]);

        $response = $this->actingAs($admin)->postJson("/lapangan/issues/{$issue->id}/pin", [
            'clear' => true,
        ]);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $issue->refresh();
        $this->assertNull($issue->map_resort);
        $this->assertNull($issue->map_x);
        $this->assertNull($issue->map_y);
    }
}
