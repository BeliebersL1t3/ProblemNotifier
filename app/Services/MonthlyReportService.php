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
        $targetMonth = Carbon::now()->subMonth();
        $periodLabel = $targetMonth->translatedFormat('F Y');
        $periodSlug = $targetMonth->format('Y-m');

        // Fetch issues from Google Sheets
        $issues = $this->fetchIssuesForPeriod($targetMonth);

        // Test dispatch fallback: if previous month has 0 issues, fallback to current month or active issues
        if ($testUser && empty($issues)) {
            $targetMonth = Carbon::now();
            $periodLabel = $targetMonth->translatedFormat('F Y');
            $periodSlug = $targetMonth->format('Y-m');
            $issues = $this->fetchIssuesForPeriod($targetMonth);

            if (empty($issues)) {
                $issues = $this->fetchIssuesForPeriod(null);
            }
        }

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
     * Groups versioned append-only rows and picks the latest active state.
     */
    protected function fetchIssuesForPeriod(?Carbon $targetMonth = null): array
    {
        try {
            $allSheets = $this->googleService->listSheets();
            $targetYear = $targetMonth ? $targetMonth->format('Y') : date('Y');

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

            // Group all rows by Issue ID to handle append-only updates
            $grouped = [];
            foreach ($rows as $row) {
                if (empty($row)) continue;
                $id = IssueSheetRepository::getId($row);
                if (empty($id) || strtolower($id) === 'id') continue;
                $grouped[$id][] = IssueSheetRepository::padRow($row);
            }

            $monthStart = $targetMonth ? $targetMonth->copy()->startOfMonth()->timestamp : null;
            $monthEnd = $targetMonth ? $targetMonth->copy()->endOfMonth()->timestamp : null;

            $parsedIssues = [];
            foreach ($grouped as $id => $versions) {
                $latestRow = end($versions);

                // Skip archived records
                if (IssueSheetRepository::isArchived($latestRow)) {
                    continue;
                }

                // Field fallback across versions for safety
                $safeTitle = (!empty($latestRow[IssueSheetRepository::COL_TITLE]) && $latestRow[IssueSheetRepository::COL_TITLE] !== 'undefined') ? $latestRow[IssueSheetRepository::COL_TITLE] : '';
                $safeDesc  = (!empty($latestRow[IssueSheetRepository::COL_DESCRIPTION]) && $latestRow[IssueSheetRepository::COL_DESCRIPTION] !== 'undefined') ? $latestRow[IssueSheetRepository::COL_DESCRIPTION] : '';
                $safeLoc   = (!empty($latestRow[IssueSheetRepository::COL_LOCATION]) && $latestRow[IssueSheetRepository::COL_LOCATION] !== 'undefined') ? $latestRow[IssueSheetRepository::COL_LOCATION] : '';
                $safeCat   = (!empty($latestRow[IssueSheetRepository::COL_CATEGORY]) && $latestRow[IssueSheetRepository::COL_CATEGORY] !== 'undefined') ? $latestRow[IssueSheetRepository::COL_CATEGORY] : '';
                $safeDept  = (!empty($latestRow[IssueSheetRepository::COL_ORIGIN_DEPT]) && $latestRow[IssueSheetRepository::COL_ORIGIN_DEPT] !== 'undefined') ? $latestRow[IssueSheetRepository::COL_ORIGIN_DEPT] : '';

                if (empty($safeTitle) || empty($safeDesc) || empty($safeLoc) || empty($safeCat) || empty($safeDept)) {
                    foreach (array_reverse($versions) as $vr) {
                        if (empty($safeTitle) && !empty($vr[IssueSheetRepository::COL_TITLE]) && $vr[IssueSheetRepository::COL_TITLE] !== 'undefined') $safeTitle = $vr[IssueSheetRepository::COL_TITLE];
                        if (empty($safeDesc) && !empty($vr[IssueSheetRepository::COL_DESCRIPTION]) && $vr[IssueSheetRepository::COL_DESCRIPTION] !== 'undefined') $safeDesc = $vr[IssueSheetRepository::COL_DESCRIPTION];
                        if (empty($safeLoc) && !empty($vr[IssueSheetRepository::COL_LOCATION]) && $vr[IssueSheetRepository::COL_LOCATION] !== 'undefined') $safeLoc = $vr[IssueSheetRepository::COL_LOCATION];
                        if (empty($safeCat) && !empty($vr[IssueSheetRepository::COL_CATEGORY]) && $vr[IssueSheetRepository::COL_CATEGORY] !== 'undefined') $safeCat = $vr[IssueSheetRepository::COL_CATEGORY];
                        if (empty($safeDept) && !empty($vr[IssueSheetRepository::COL_ORIGIN_DEPT]) && $vr[IssueSheetRepository::COL_ORIGIN_DEPT] !== 'undefined') $safeDept = $vr[IssueSheetRepository::COL_ORIGIN_DEPT];
                    }
                }

                // Reporter fallback
                $safeReporter = (!empty($latestRow[IssueSheetRepository::COL_REPORTER]) && $latestRow[IssueSheetRepository::COL_REPORTER] !== 'undefined') ? $latestRow[IssueSheetRepository::COL_REPORTER] : '';
                if (empty($safeReporter)) {
                    foreach (array_reverse($versions) as $vr) {
                        if (!empty($vr[IssueSheetRepository::COL_REPORTER]) && $vr[IssueSheetRepository::COL_REPORTER] !== 'undefined') {
                            $safeReporter = $vr[IssueSheetRepository::COL_REPORTER];
                            break;
                        }
                    }
                }

                // Created date: use first version or latest row
                $firstRow = $versions[0];
                $createdRaw = !empty($firstRow[IssueSheetRepository::COL_CREATED_DATE])
                    ? $firstRow[IssueSheetRepository::COL_CREATED_DATE]
                    : (!empty($latestRow[IssueSheetRepository::COL_CREATED_DATE]) ? $latestRow[IssueSheetRepository::COL_CREATED_DATE] : '');
                $timestamp = $this->parseTimestamp($createdRaw);

                // Date filtering by month (if targetMonth specified)
                if ($monthStart !== null && $monthEnd !== null && $timestamp > 0) {
                    if ($timestamp < $monthStart || $timestamp > $monthEnd) {
                        continue;
                    }
                }

                // Status normalization
                $rawStatus = strtolower(trim($latestRow[IssueSheetRepository::COL_STATUS] ?? 'open'));
                if ($rawStatus === 'in progress' || $rawStatus === 'in_progress') {
                    $rawStatus = 'progress';
                }

                // Priority normalization
                $rawPriority = strtolower(trim($latestRow[IssueSheetRepository::COL_PRIORITY] ?? 'low'));
                $priority = in_array($rawPriority, ['critical', 'emergency', 'urgent', 'high'])
                    ? 'high'
                    : (in_array($rawPriority, ['medium', 'med']) ? 'med' : 'low');

                // Tagged departments
                $rawTagged = trim($latestRow[IssueSheetRepository::COL_TAGGED_DEPTS] ?? '');
                $taggedDepartments = !empty($rawTagged) ? array_values(array_filter(array_map('trim', explode(',', $rawTagged)))) : [];

                $parsedIssues[] = [
                    'id'                  => $id,
                    'title'               => $safeTitle,
                    'location'            => $safeLoc,
                    'description'         => $safeDesc,
                    'department'          => $safeDept ?: 'General',
                    'assignedDepartments'=> IssueSheetRepository::getAssignedDepartments($latestRow),
                    'taggedDepartments'  => $taggedDepartments,
                    'category'            => $safeCat,
                    'reporter'            => $safeReporter ?: 'Staff',
                    'status'              => $rawStatus,
                    'taker'               => trim($latestRow[IssueSheetRepository::COL_TAKER] ?? ''),
                    'solvedBy'            => trim($latestRow[IssueSheetRepository::COL_SOLVED_BY] ?? ''),
                    'solvedAt'            => trim($latestRow[IssueSheetRepository::COL_SOLVED_DATE] ?? ''),
                    'reportedAt'          => $createdRaw,
                    'reportedAtFormatted' => $timestamp > 0 ? date('d M Y', $timestamp) : ($createdRaw ?: '-'),
                    'priority'            => $priority,
                    'pendingReason'       => trim($latestRow[IssueSheetRepository::COL_PENDING_REASON] ?? ''),
                    'pendingBy'           => trim($latestRow[IssueSheetRepository::COL_PENDING_BY] ?? ''),
                    'durationLabel'       => trim($latestRow[IssueSheetRepository::COL_DURATION] ?? '-'),
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
        $durationsInMinutes = [];
        foreach ($issues as $issue) {
            $status = strtolower($issue['status'] ?? '');
            if ($status !== 'solved') continue;

            // Try durationLabel if present (e.g., "2 Jam 15 Menit", "45 Menit", "1 Hari")
            $durStr = trim($issue['durationLabel'] ?? '');
            if (!empty($durStr) && $durStr !== '-') {
                $mins = 0;
                if (preg_match('/(\d+)\s*hari/i', $durStr, $m)) $mins += ((int)$m[1]) * 1440;
                if (preg_match('/(\d+)\s*(?:jam|hr|h)\b/i', $durStr, $m)) $mins += ((int)$m[1]) * 60;
                if (preg_match('/(\d+)\s*(?:menit|min|m)\b/i', $durStr, $m)) $mins += (int)$m[1];
                if ($mins > 0) {
                    $durationsInMinutes[] = $mins;
                    continue;
                }
            }

            // Fallback: calculate from reportedAt and solvedAt timestamps
            $repTime = $this->parseTimestamp($issue['reportedAt'] ?? null);
            $solvTime = $this->parseTimestamp($issue['solvedAt'] ?? null);
            if ($repTime > 0 && $solvTime > $repTime) {
                $diffMins = (int)(($solvTime - $repTime) / 60);
                if ($diffMins > 0) {
                    $durationsInMinutes[] = $diffMins;
                }
            }
        }

        if (empty($durationsInMinutes)) {
            return "-";
        }

        $avgMins = (int)(array_sum($durationsInMinutes) / count($durationsInMinutes));
        if ($avgMins < 60) {
            return "{$avgMins} Menit";
        }
        $hours = floor($avgMins / 60);
        $remMins = $avgMins % 60;
        if ($hours < 24) {
            return $remMins > 0 ? "{$hours}j {$remMins}m" : "{$hours} Jam";
        }
        $days = floor($hours / 24);
        $remHours = $hours % 24;
        return $remHours > 0 ? "{$days}h {$remHours}j" : "{$days} Hari";
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
