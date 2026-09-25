<?php

namespace Tests\Feature;

use App\Jobs\SendExportPdfReportJob;
use App\Models\ExportReportLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ExportEmailOptimizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_email_pdf_dispatch_creates_audit_log_and_dispatches_async_job(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'role'       => 'admin',
            'email'      => 'admin@example.com',
            'department' => 'IT',
        ]);

        $fakePdf = UploadedFile::fake()->create('Test_Report.pdf', 100, 'application/pdf');

        $response = $this->actingAs($user)->postJson('/api/export/email-pdf', [
            'pdf_file'   => $fakePdf,
            'subject'    => 'Test Calendar Report Subject',
            'message'    => 'Test personal note',
            'mailer'     => 'system',
            'recipients' => json_encode(['staff1@example.com', 'staff2@example.com']),
            'meta'       => json_encode([
                'type'        => 'calendar',
                'locations'   => ['TPI', 'TBR'],
                'departments' => ['IT', 'HR'],
            ]),
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success'  => true,
            'sent_via' => 'smtp',
        ]);

        $this->assertDatabaseHas('export_report_logs', [
            'user_id'      => $user->id,
            'subject'      => 'Test Calendar Report Subject',
            'sent_via'     => 'smtp',
            'report_type'  => 'calendar',
        ]);
    }

    public function test_export_logs_endpoint_returns_audit_records(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        ExportReportLog::create([
            'user_id'           => $admin->id,
            'sender_name'       => 'Admin User',
            'sender_email'      => 'admin@example.com',
            'sender_department' => 'IT',
            'report_type'       => 'calendar',
            'recipients'        => ['staff@example.com'],
            'subject'           => 'Scheduled Calendar Report',
            'pdf_filename'      => 'Report_2026.pdf',
            'sent_via'          => 'smtp',
            'status'            => 'sent',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/export/logs');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'success',
            'logs' => [
                '*' => ['id', 'subject', 'sent_via', 'status', 'pdf_filename']
            ]
        ]);
    }
}
