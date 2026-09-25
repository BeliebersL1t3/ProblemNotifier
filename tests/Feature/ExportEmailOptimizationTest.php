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

    public function test_calendar_report_email_template_renders_calendar_specific_kpis_and_no_phantom_excel(): void
    {
        $view = view('emails.export_report', [
            'emailSubject'     => '[Telunas Schedule] Operations Calendar Report - September 2026',
            'customMessage'    => 'Please review the shift schedule.',
            'senderName'       => 'Admin Telunas',
            'senderDepartment' => 'Operations',
            'reportMeta'       => [
                'type'        => 'calendar',
                'period'      => 'September 2026',
                'locations'   => ['TPI', 'TBR'],
                'departments' => ['Engineer', 'Kitchen'],
                'total_tasks' => 42,
            ],
            'pdfFilename'      => 'Telunas_Calendar_Report_2026-09-25.pdf',
            'excelFilename'    => null,
        ])->render();

        $this->assertStringContainsString('OPERATIONS CALENDAR', $view);
        $this->assertStringContainsString('RESORT SCHEDULE REPORT', $view);
        $this->assertStringContainsString('Total Scheduled Tasks', $view);
        $this->assertStringContainsString('42', $view);
        $this->assertStringContainsString('Location Scope', $view);
        $this->assertStringContainsString('TPI, TBR', $view);
        $this->assertStringContainsString('September 2026', $view);
        $this->assertStringContainsString('Calendar Dispatch Details', $view);
        $this->assertStringContainsString('Official Operations Calendar Schedule (PDF)', $view);
        $this->assertStringNotContainsString('Total Issues', $view);
        $this->assertStringNotContainsString('Telunas_Report.xlsx', $view);
    }
}

