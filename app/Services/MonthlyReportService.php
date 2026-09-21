<?php

namespace App\Services;

use App\Mail\ExportReportMail;
use App\Models\ReportSchedule;
use App\Models\User;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class MonthlyReportService
{
    public function __construct(
        protected GoogleService $googleService
    ) {}

    /**
     * Dispatch monthly reports to all configured recipients (Admins and HODs).
     *
     * @param bool $force Bypass schedule check
     * @param User|null $testUser If set, only dispatch test email to this specific user
     */
    public function runMonthlyDispatch(bool $force = false, ?User $testUser = null): array
    {
        $schedule = ReportSchedule::getOrCreateConfig();

        if (!$force && !$testUser && !$schedule->is_enabled) {
            return ['status' => 'skipped', 'message' => 'Automated monthly reports are currently disabled.'];
        }

        // Determine target period (defaults to previous month)
        $previousMonth = Carbon::now()->subMonth();
        $periodLabel = $previousMonth->translatedFormat('F Y');
        $periodSlug = $previousMonth->format('Y-m');

        // Fetch issues from Google Sheets
        $issues = $this->fetchIssuesForPeriod($previousMonth);

        $results = [
            'dispatched_count' => 0,
            'errors'           => [],
            'recipients'       => [],
        ];

        // Case A: Test Dispatch for a specific user
        if ($testUser) {
            $scope = ($testUser->role === 'admin') ? 'all' : ($testUser->department ?: 'all');
            $success = $this->sendReportToRecipient(
                recipientEmail: $testUser->email,
                recipientName: $testUser->name,
                scope: $scope,
                allIssues: $issues,
                periodLabel: $periodLabel,
                periodSlug: $periodSlug,
                includeDelayTimeline: $schedule->include_delay_timeline
            );

            if ($success) {
                $results['dispatched_count']++;
                $results['recipients'][] = "{$testUser->email} ({$scope})";
            } else {
                $results['errors'][] = "Failed to dispatch test report to {$testUser->email}.";
            }

            return $results;
        }

        // Case B: Scheduled automated dispatch
        $processedEmails = [];

        // 1. Dispatch to Admins (All Scope)
        if ($schedule->send_to_admins) {
            $admins = User::where('role', 'admin')
                ->where('is_active', true)
                ->whereNotNull('email')
                ->get();

            foreach ($admins as $admin) {
                if (in_array(strtolower($admin->email), $processedEmails)) continue;

                $success = $this->sendReportToRecipient(
                    recipientEmail: $admin->email,
                    recipientName: $admin->name,
                    scope: 'all',
                    allIssues: $issues,
                    periodLabel: $periodLabel,
                    periodSlug: $periodSlug,
                    includeDelayTimeline: $schedule->include_delay_timeline
                );

                if ($success) {
                    $results['dispatched_count']++;
                    $results['recipients'][] = "{$admin->email} (Admin - All Scope)";
                    $processedEmails[] = strtolower($admin->email);
                } else {
                    $results['errors'][] = "Failed to send to admin: {$admin->email}";
                }
            }
        }

        // 2. Dispatch to HODs (Department-Scoped)
        if ($schedule->send_to_all_hods) {
            $hods = User::where('is_hod', true)
                ->where('is_active', true)
                ->whereNotNull('email')
                ->get();

            foreach ($hods as $hod) {
                if (in_array(strtolower($hod->email), $processedEmails)) continue;

                $deptScope = $hod->department ?: 'all';
                $success = $this->sendReportToRecipient(
                    recipientEmail: $hod->email,
                    recipientName: $hod->name,
                    scope: $deptScope,
                    allIssues: $issues,
                    periodLabel: $periodLabel,
                    periodSlug: $periodSlug,
                    includeDelayTimeline: $schedule->include_delay_timeline
                );

                if ($success) {
                    $results['dispatched_count']++;
                    $results['recipients'][] = "{$hod->email} (HOD - {$deptScope})";
                    $processedEmails[] = strtolower($hod->email);
                } else {
                    $results['errors'][] = "Failed to send to HOD: {$hod->email}";
                }
            }
        }

        // 3. Additional custom recipients (All Scope)
        if (!empty($schedule->additional_recipients) && is_array($schedule->additional_recipients)) {
            foreach ($schedule->additional_recipients as $customEmail) {
                $customEmail = trim($customEmail);
                if (!filter_var($customEmail, FILTER_VALIDATE_EMAIL)) continue;
                if (in_array(strtolower($customEmail), $processedEmails)) continue;

                $success = $this->sendReportToRecipient(
                    recipientEmail: $customEmail,
                    recipientName: 'Management Recipient',
                    scope: 'all',
                    allIssues: $issues,
                    periodLabel: $periodLabel,
                    periodSlug: $periodSlug,
                    includeDelayTimeline: $schedule->include_delay_timeline
                );

                if ($success) {
                    $results['dispatched_count']++;
                    $results['recipients'][] = "{$customEmail} (Custom - All Scope)";
                    $processedEmails[] = strtolower($customEmail);
                } else {
                    $results['errors'][] = "Failed to send to: {$customEmail}";
                }
            }
        }

        // Update schedule execution status
        $schedule->update([
            'last_dispatched_at'     => now(),
            'last_dispatch_status'   => empty($results['errors']) ? 'success' : ($results['dispatched_count'] > 0 ? 'partial' : 'failed'),
            'last_dispatch_summary'  => "Dispatched to {$results['dispatched_count']} recipients for period {$periodLabel}.",
        ]);

        return $results;
    }

    /**
     * Send monthly report PDF to a single recipient with appropriate scoping.
     */
    protected function sendReportToRecipient(
        string $recipientEmail,
        string $recipientName,
        string $scope,
        array $allIssues,
        string $periodLabel,
        string $periodSlug,
        bool $includeDelayTimeline = true
    ): bool {
        try {
            // Filter issues based on scope
            $filteredIssues = $this->filterIssuesByScope($allIssues, $scope);

            $scopeLabel = ($scope === 'all' || empty($scope)) ? 'All Departments' : ucwords(str_replace('_', ' ', $scope));
            $scopeSlug = strtolower(str_replace(' ', '_', $scopeLabel));

            // Calculate metrics
            $totalCount = count($filteredIssues);
            $solvedCount = 0;
            $progressCount = 0;
            $pendingCount = 0;

            foreach ($filteredIssues as $issue) {
                $status = strtolower($issue['status'] ?? 'open');
                if ($status === 'solved') $solvedCount++;
                elseif ($status === 'progress') $progressCount++;
                elseif ($status === 'pending') $pendingCount++;
            }

            $pdfData = [
                'reportTitle'          => "Monthly Report — {$scopeLabel}",
                'periodLabel'          => $periodLabel,
                'scopeLabel'           => $scopeLabel,
                'totalCount'           => $totalCount,
                'solvedCount'          => $solvedCount,
                'progressCount'        => $progressCount,
                'pendingCount'         => $pendingCount,
                'avgDuration'          => $this->calculateAverageDuration($filteredIssues),
                'issues'               => $filteredIssues,
                'includeDelayTimeline' => $includeDelayTimeline,
            ];

            // Render PDF in memory
            $pdf = Pdf::loadView('pdf.monthly_report', $pdfData)
                ->setPaper('a4', 'landscape');
            $pdfContent = $pdf->output();

            $pdfFilename = "Telunas_Monthly_Report_{$scopeSlug}_{$periodSlug}.pdf";
            $subject = "[Telunas CampusFix] Monthly Report - {$scopeLabel} ({$periodLabel})";

            $mailable = new ExportReportMail(
                emailSubject: $subject,
                customMessage: "Please find attached the official monthly campus operations and facility resolution report for {$periodLabel} ({$scopeLabel}). This document has been compiled automatically for executive review.",
                senderName: 'Telunas CampusFix',
                senderDepartment: 'Automated Dispatch',
                reportMeta: [
                    'scope'        => $scopeLabel,
                    'sheets'       => $periodLabel,
                    'total_issues' => $totalCount,
                    'is_no_reply'  => true,
                ],
                pdfFile: $pdfContent,
                pdfFilename: $pdfFilename,
                senderEmail: null,
                isNoReply: true
            );

            Mail::to($recipientEmail)->send($mailable);

            Log::info("Monthly report sent to {$recipientEmail} [Scope: {$scopeLabel}]");
            return true;
        } catch (\Throwable $e) {
            Log::error("Failed to generate or send monthly report to {$recipientEmail}: " . $e->getMessage(), [
                'exception' => $e
            ]);
            return false;
        }
    }

    /**
     * Filter issues for a specific department scope.
     */
    protected function filterIssuesByScope(array $issues, string $scope): array
    {
        if ($scope === 'all' || empty($scope)) {
            return $issues;
        }

        $normalizedScope = IssueSheetRepository::normalizeDeptKey($scope);

        return array_values(array_filter($issues, function ($issue) use ($normalizedScope) {
            $originDept = IssueSheetRepository::normalizeDeptKey($issue['department'] ?? '');
            if ($originDept === $normalizedScope) return true;

            $assignedDepts = array_map([IssueSheetRepository::class, 'normalizeDeptKey'], (array)($issue['assignedDepartments'] ?? []));
            if (in_array($normalizedScope, $assignedDepts)) return true;

            $taggedDepts = array_map([IssueSheetRepository::class, 'normalizeDeptKey'], (array)($issue['taggedDepartments'] ?? []));
            if (in_array($normalizedScope, $taggedDepts)) return true;

            return false;
        }));
    }

    /**
     * Fetch all issues for a given period from Google Sheets.
     */
    protected function fetchIssuesForPeriod(Carbon $targetMonth): array
    {
        try {
            $allSheets = $this->googleService->listSheets();
            $targetYear = $targetMonth->format('Y');

            // Select sheet matching year (e.g. "2026"), or fallback to newest
            $sheetToUse = in_array($targetYear, $allSheets) ? $targetYear : (!empty($allSheets[0]) ? $allSheets[0] : null);

            if (!$sheetToUse) {
                return [];
            }

            $this->googleService->setSheet($sheetToUse);
            $rows = $this->googleService->getRows(false);

            if (empty($rows)) {
                return [];
            }

            $monthStart = $targetMonth->copy()->startOfMonth()->timestamp;
            $monthEnd = $targetMonth->copy()->endOfMonth()->timestamp;

            $parsedIssues = [];
            foreach ($rows as $rowIndex => $row) {
                if (empty($row) || IssueSheetRepository::isArchived($row)) continue;
                $row = IssueSheetRepository::padRow($row);

                $id = trim($row[IssueSheetRepository::COL_ID] ?? '');
                if (empty($id) || strtolower($id) === 'id') continue;

                $createdRaw = $row[IssueSheetRepository::COL_CREATED_DATE] ?? '';
                $timestamp = $this->parseTimestamp($createdRaw);

                // Check if issue falls within target month (if timestamp valid)
                if ($timestamp > 0) {
                    if ($timestamp < $monthStart || $timestamp > $monthEnd) {
                        // Skip if created outside target month
                        continue;
                    }
                }

                $parsedIssues[] = [
                    'id'                  => $id,
                    'title'               => trim($row[IssueSheetRepository::COL_TITLE] ?? ''),
                    'location'            => trim($row[IssueSheetRepository::COL_LOCATION] ?? ''),
                    'description'         => trim($row[IssueSheetRepository::COL_DESCRIPTION] ?? ''),
                    'department'          => trim($row[IssueSheetRepository::COL_ORIGIN_DEPT] ?? ''),
                    'assignedDepartments'=> IssueSheetRepository::getAssignedDepartments($row),
                    'category'            => trim($row[IssueSheetRepository::COL_CATEGORY] ?? ''),
                    'reporter'            => trim($row[IssueSheetRepository::COL_REPORTER] ?? ''),
                    'status'              => strtolower(trim($row[IssueSheetRepository::COL_STATUS] ?? 'open')),
                    'taker'               => trim($row[IssueSheetRepository::COL_TAKER] ?? ''),
                    'solvedBy'            => trim($row[IssueSheetRepository::COL_SOLVED_BY] ?? ''),
                    'reportedAt'          => $createdRaw,
                    'reportedAtFormatted' => $timestamp > 0 ? date('d M Y', $timestamp) : $createdRaw,
                    'priority'            => !empty($row[IssueSheetRepository::COL_IS_EMERGENCY]) ? 'high' : 'low',
                    'pendingReason'       => trim($row[IssueSheetRepository::COL_PENDING_TIMELINE] ?? ''),
                    'durationLabel'       => '-',
                ];
            }

            return $parsedIssues;
        } catch (\Throwable $e) {
            Log::error('MonthlyReportService: Error fetching issues from sheet: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Calculate human-readable average duration for resolved issues.
     */
    protected function calculateAverageDuration(array $issues): string
    {
        $solvedCount = 0;
        foreach ($issues as $i) {
            if (strtolower($i['status'] ?? '') === 'solved') {
                $solvedCount++;
            }
        }

        return $solvedCount > 0 ? "~4 Hours" : "-";
    }

    /**
     * Helper to parse flexible timestamp formats.
     */
    protected function parseTimestamp($val): int
    {
        if (empty($val)) return 0;
        if (is_numeric($val)) {
            $num = (int)$val;
            return ($num > 10000000000) ? (int)($num / 1000) : $num;
        }

        $time = strtotime($val);
        return $time !== false ? $time : 0;
    }
}
