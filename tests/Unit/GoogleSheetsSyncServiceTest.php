<?php

namespace Tests\Unit;

use App\Models\LeanIssue;
use App\Services\GoogleSheetsSyncService;
use Tests\TestCase;

class GoogleSheetsSyncServiceTest extends TestCase
{
    public function test_format_issue_payload_contains_no_ai_hallucinations(): void
    {
        $service = app(GoogleSheetsSyncService::class);

        $issue = new LeanIssue([
            'location'                => 'Villa 10 TBR',
            'title'                   => 'Lampu redup di teras',
            'description'             => 'Lampu teras berkedip',
            'target_departments'      => ['Engineering'],
            'reporter_name'           => 'Ahmad',
            'reporter_dept'           => 'Housekeeping',
            'status'                  => 'open',
            'estimated_completion_at' => \Carbon\Carbon::parse('2026-11-12 16:45:00', 'Asia/Jakarta')->setTimezone('UTC'),
        ]);
        $issue->id = 99;
        $issue->created_at = now();

        $payload = $service->formatIssuePayload($issue);

        $this->assertStringContainsString('99', $payload['issue_code']);
        $this->assertEquals('Villa 10 TBR', $payload['location']);
        $this->assertEquals('Lampu redup di teras', $payload['title']);
        $this->assertEquals('Housekeeping', $payload['reporter_dept']);
        $this->assertEquals('Open', $payload['status']);
        $this->assertEquals('2026-11-12 16:45', $payload['estimated_completion_at']);
        $this->assertEquals('2026-11-12 16:45', $payload['perkiraan_selesai']);
        
        // Assert AI fields are empty strings and not populated with machine predictions
        $this->assertSame('', $payload['ai_category']);
        $this->assertSame('', $payload['ai_sub_category']);
        $this->assertSame('', $payload['ai_urgency']);
        $this->assertSame('', $payload['ai_sparepart_needed']);
        $this->assertSame('', $payload['ai_root_cause']);
        $this->assertSame('', $payload['ai_mitigation']);

        $this->assertSame('', $payload['ai_kategori']);
        $this->assertSame('', $payload['ai_sub_kategori']);
        $this->assertSame('', $payload['ai_urgensi']);
        $this->assertSame('', $payload['ai_butuh_sparepart']);
        $this->assertSame('', $payload['ai_akar_masalah']);
        $this->assertSame('', $payload['ai_mitigasi']);
    }
}
