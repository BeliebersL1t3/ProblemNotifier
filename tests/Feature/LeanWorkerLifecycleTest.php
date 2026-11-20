<?php

namespace Tests\Feature;

use App\Models\LeanIssue;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LeanWorkerLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake([
            '*/notify' => Http::response(['success' => true], 200),
            '*/group-notify' => Http::response(['success' => true], 200),
            '*/send-image' => Http::response(['success' => true], 200),
            '*/notify-media' => Http::response(['success' => true], 200),
            '*' => Http::response(['status' => 'success'], 200),
        ]);
    }

    public function test_open_issue_creation_persists_initial_and_active_workers_and_logs_assignment(): void
    {
        $user = User::factory()->create([
            'role' => 'admin',
            'department' => 'IT',
            'staff_name' => 'Admin Staff',
        ]);

        $response = $this->actingAs($user)->post('/lapangan/issues', [
            'location'           => 'TPI Room 101',
            'title'              => 'AC Tidak Dingin',
            'description'        => 'Perlu pengecekan freon',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Tamu 101',
            'start_in_progress'  => '0',
            'assigned_workers'   => 'Budi, Joko',
        ]);

        $response->assertSessionHasNoErrors();

        $issue = LeanIssue::where('title', 'AC Tidak Dingin')->firstOrFail();
        $this->assertEquals('open', $issue->status);
        $this->assertEquals(['Budi', 'Joko'], $issue->initial_workers);
        $this->assertEquals(['Budi', 'Joko'], $issue->active_workers);
        $this->assertEquals(['Budi', 'Joko'], $issue->contributors);

        $assignmentLogs = array_filter($issue->progress_logs ?? [], fn ($log) => $log['type'] === 'assignment');
        $this->assertNotEmpty($assignmentLogs, 'Expected an assignment progress log entry');
        $assignLog = reset($assignmentLogs);
        $this->assertStringContainsString('Ditugaskan sejak awal: Budi, Joko', $assignLog['message']);
    }

    public function test_claim_retains_assigned_workers_or_logs_diff_with_timestamp(): void
    {
        $user = User::factory()->create([
            'role' => 'staff',
            'department' => 'Engineering',
            'staff_name' => 'Budi',
        ]);

        $issue = LeanIssue::create([
            'location'           => 'TPI Room 102',
            'title'              => 'Lampu Mati',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Staff Pelapor',
            'status'             => 'open',
            'initial_workers'    => ['Budi', 'Joko'],
            'active_workers'     => ['Budi', 'Joko'],
            'contributors'       => ['Budi', 'Joko'],
        ]);

        // Claim with Budi and Siti (Joko released, Siti joined)
        $response = $this->actingAs($user)->post("/lapangan/issues/{$issue->id}/claim", [
            'workers' => ['Budi', 'Siti'],
            'note'    => 'Mulai pengerjaan pergantian bohlam',
        ]);

        $response->assertSessionHasNoErrors();
        $issue->refresh();

        $this->assertEquals('in_progress', $issue->status);
        $this->assertEquals(['Budi', 'Siti'], $issue->active_workers);
        // Cumulative contributors must retain Joko, Budi, and Siti!
        $this->assertTrue(in_array('Joko', $issue->contributors));
        $this->assertTrue(in_array('Budi', $issue->contributors));
        $this->assertTrue(in_array('Siti', $issue->contributors));

        $claimLogs = array_filter($issue->progress_logs ?? [], fn ($log) => $log['type'] === 'claim');
        $this->assertNotEmpty($claimLogs);
        $claimLog = end($claimLogs);
        $this->assertStringContainsString('+Bergabung: Siti', $claimLog['message']);
        $this->assertStringContainsString('-Dilepas: Joko', $claimLog['message']);
    }

    public function test_update_progress_records_timestamped_worker_diff_and_accumulates_contributors(): void
    {
        $user = User::factory()->create([
            'role' => 'staff',
            'department' => 'Engineering',
            'staff_name' => 'Budi',
        ]);

        $issue = LeanIssue::create([
            'location'           => 'TPI Villa 5',
            'title'              => 'Pintu Macet',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Staff Pelapor',
            'status'             => 'in_progress',
            'initial_workers'    => ['Budi', 'Siti'],
            'active_workers'     => ['Budi', 'Siti'],
            'contributors'       => ['Budi', 'Siti', 'Joko'],
        ]);

        // Update progress: Siti leaves, Andi joins
        $response = $this->actingAs($user)->post("/lapangan/issues/{$issue->id}/progress", [
            'comment' => 'Sedang membongkar engsel',
            'workers' => ['Budi', 'Andi'],
        ]);

        $response->assertSessionHasNoErrors();
        $issue->refresh();

        $this->assertEquals(['Budi', 'Andi'], $issue->active_workers);
        // All four workers must remain in contributors
        $this->assertTrue(in_array('Budi', $issue->contributors));
        $this->assertTrue(in_array('Siti', $issue->contributors));
        $this->assertTrue(in_array('Joko', $issue->contributors));
        $this->assertTrue(in_array('Andi', $issue->contributors));

        $progressLogs = array_filter($issue->progress_logs ?? [], fn ($log) => $log['type'] === 'progress');
        $this->assertNotEmpty($progressLogs);
        $progLog = end($progressLogs);
        $this->assertStringContainsString('+Ditambah: Andi', $progLog['message']);
        $this->assertStringContainsString('-Dikurangi: Siti', $progLog['message']);
    }

    public function test_resolve_records_timestamped_removal_and_retains_all_historical_contributors(): void
    {
        $user = User::factory()->create([
            'role' => 'staff',
            'department' => 'Engineering',
            'staff_name' => 'Budi',
        ]);

        $issue = LeanIssue::create([
            'location'           => 'TPI Villa 5',
            'title'              => 'Pintu Macet',
            'target_departments' => ['Engineering'],
            'reporter_name'      => 'Staff Pelapor',
            'status'             => 'in_progress',
            'initial_workers'    => ['Budi', 'Siti'],
            'active_workers'     => ['Budi', 'Andi'],
            'contributors'       => ['Budi', 'Siti', 'Joko', 'Andi'],
        ]);

        // Resolve with only Budi (Andi removed at completion)
        $response = $this->actingAs($user)->post("/lapangan/issues/{$issue->id}/resolve", [
            'note'          => 'Engsel selesai dilumasi dan baut dikencangkan',
            'final_workers' => ['Budi'],
        ]);

        $response->assertSessionHasNoErrors();
        $issue->refresh();

        $this->assertEquals('resolved', $issue->status);
        $this->assertEquals('Budi', $issue->resolved_by_name);
        $this->assertEmpty($issue->active_workers);
        // All past contributors permanently preserved
        $this->assertEqualsCanonicalizing(['Budi', 'Siti', 'Joko', 'Andi'], $issue->contributors);

        $resolveLogs = array_filter($issue->progress_logs ?? [], fn ($log) => $log['type'] === 'resolved');
        $this->assertNotEmpty($resolveLogs);
        $resLog = end($resolveLogs);
        $this->assertStringContainsString('-Dilepas saat penyelesaian: Andi', $resLog['message']);
    }
}
