<?php

namespace App\Http\Controllers;

use App\Services\GoogleService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class IssueController extends Controller
{
    protected GoogleService $googleService;

    public function __construct(GoogleService $googleService)
    {
        $this->googleService = $googleService;
    }

    private function notifyWhatsApp(array $payload): void
    {
        try {
            Http::connectTimeout(1)->timeout(1)->post('http://localhost:3000/notify', $payload);
        } catch (\Throwable $e) {
            // Non-blocking: ignore if bot is offline
        }
    }

    private function notifyIssueProgress(?string $department, string $title, string $message, ?string $issueId = null): void
    {
        if (empty($department)) {
            return;
        }
        try {
            \App\Models\DashboardNotification::create([
                'department' => $department,
                'role_target' => 'department_user',
                'type' => 'issue_progress',
                'title' => $title,
                'message' => $message,
                'link' => $issueId ? "/?search={$issueId}" : null,
                'is_read' => false,
            ]);
        } catch (\Throwable $e) {}
    }

    private function resolveImageUrl(?string $raw): string
    {
        if (empty($raw)) {
            return '';
        }

        if (str_starts_with($raw, 'http://') || str_starts_with($raw, 'https://') || str_starts_with($raw, 'data:')) {
            // Handle legacy rows where an IP address URL was saved
            if (str_contains($raw, '/uploads/')) {
                $path = parse_url($raw, PHP_URL_PATH);
                $filename = basename($path);
                return asset('uploads/' . $filename);
            }
            return $raw;
        }

        // Hashed filename token stored in Sheets -> resolve to current active server asset URL!
        return asset('uploads/' . ltrim($raw, '/'));
    }

    private function formatPendingDateString($rawDate): string
    {
        if (empty($rawDate)) return '';
        try {
            $carbon = Carbon::parse($rawDate);
            return $carbon->format('M d, Y H:i:s');
        } catch (\Throwable $e) {
            return (string)$rawDate;
        }
    }

    private function parsePendingTimeline($rawData, $legacyBy = '', $legacyImage = '')
    {
        if (empty($rawData)) {
            return [];
        }

        $decoded = json_decode($rawData, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            $deduped = [];
            foreach ($decoded as $item) {
                if (!is_array($item)) continue;
                $img = $item['image'] ?? ($item['pendingImageUrl'] ?? '');
                $item['image'] = $this->resolveImageUrl($img);
                $item['date'] = $this->formatPendingDateString($item['date'] ?? '');

                // Deduplicate if identical to the previous item
                $last = end($deduped);
                if (
                    $last &&
                    ($last['reason'] ?? '') === ($item['reason'] ?? '') &&
                    ($last['by'] ?? '') === ($item['by'] ?? '') &&
                    ($last['date'] ?? '') === ($item['date'] ?? '')
                ) {
                    continue;
                }
                $deduped[] = $item;
            }
            return $deduped;
        }

        // Fallback for legacy plain text reason
        return [
            [
                'date'   => '',
                'by'     => $legacyBy ?: 'Staff',
                'reason' => $rawData,
                'image'  => $this->resolveImageUrl($legacyImage),
            ]
        ];
    }

    private function parsePendingReason($rawData): string
    {
        if (empty($rawData)) {
            return '';
        }
        $decoded = json_decode($rawData, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            $last = end($decoded);
            return is_array($last) ? ($last['reason'] ?? '') : '';
        }
        return (string)$rawData;
    }

    private function parseEditLogs($rawData): array
    {
        if (empty($rawData)) {
            return [];
        }
        $decoded = json_decode($rawData, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $decoded;
        }
        return [];
    }

    private static function formatParagraphText(?string $text, int $width = 70): string
    {
        if (empty($text)) return '';
        $trimmed = trim($text);
        if (str_contains($trimmed, "\n")) return $trimmed;
        if (strlen($trimmed) > $width) {
            return wordwrap($trimmed, $width, "\n");
        }
        return $trimmed;
    }

    private function normalizeDeptKey(?string $dept): string
    {
        if (empty($dept)) return '';
        $key = strtolower(trim($dept));
        $map = [
            'legal'           => 'hr',
            'lnd'             => 'hr',
            'transportasi'    => 'hr',
            'tekong'          => 'hr',
            'gre'             => 'gr',
            'guest relations' => 'gr',
            'service'         => 'gr',
            'bar'             => 'gr',
            'spa'             => 'gr',
            'tirek'           => 'gr',
            'f&b'             => 'kitchen',
            'fnb'             => 'kitchen',
            'pest control'    => 'hk',
            'sales'           => 'reservasi',
            'marketing'       => 'reservasi',
            'sales/marketing' => 'reservasi',
            'security'        => 'fasilitas',
        ];
        return $map[$key] ?? $key;
    }

    /**
     * Check whether an authenticated user is authorized to modify/action an issue.
     * Regular staff transferred to another department cannot modify issues from their past department.
     */
    private function isAuthorizedToModifyIssue($user, array $currentRow): bool
    {
        if (!$user) return false;
        if ($user->isAdmin()) return true;

        $userDept = $user->department ?? '';
        if (empty($userDept)) return false;

        $rawAssigned = !empty($currentRow[23]) ? $currentRow[23] : (!empty($currentRow[21]) ? $currentRow[21] : '');
        $assignedList = !empty($rawAssigned) ? array_map('trim', explode(',', $rawAssigned)) : [];
        $assignedListUpper = array_map('strtoupper', $assignedList);
        if (empty($assignedList) || in_array('ALL', $assignedListUpper)) {
            return true;
        }

        $originDept = $currentRow[22] ?? '';
        $userSubdiv = $user->subdivision ?? '';

        $assignedNorm = array_map(fn($d) => $this->normalizeDeptKey($d), $assignedList);
        $userDeptNorm = $this->normalizeDeptKey($userDept);
        $userSubdivNorm = !empty($userSubdiv) ? $this->normalizeDeptKey($userSubdiv) : '';
        $originNorm = !empty($originDept) ? $this->normalizeDeptKey($originDept) : '';

        return in_array($userDeptNorm, $assignedNorm) ||
               (!empty($userSubdivNorm) && in_array($userSubdivNorm, $assignedNorm)) ||
               (!empty($originNorm) && $userDeptNorm === $originNorm);
    }

    /** Resolve the active sheet: use ?sheet= param, else the newest sheet tab. */
    private function resolveSheet(?string $sheetParam = null): string
    {
        $allSheets = $this->googleService->listSheets();
        if ($sheetParam && in_array($sheetParam, $allSheets)) {
            $this->googleService->setSheet($sheetParam);
            return $sheetParam;
        }
        // Default to the LAST (newest) sheet, or fallback to Sheet1
        $newest = !empty($allSheets) ? end($allSheets) : 'Sheet1';
        $this->googleService->setSheet($newest);
        return $newest;
    }

    public function listSheets()
    {
        try {
            $sheets = $this->googleService->listSheets();
            return response()->json([
                'success' => true,
                'data'    => $sheets,
                'newest'  => !empty($sheets) ? end($sheets) : 'Sheet1',
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to list sheets: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function createSheet(Request $request)
    {
        $authUser = auth()->user();
        if ($authUser && ! $authUser->isAdmin()) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only administrators can create new periods/sheets.',
            ], 403);
        }

        try {
            $name = trim($request->input('name', (string) date('Y')));
            $existing = $this->googleService->listSheets();
            if (in_array($name, $existing)) {
                return response()->json([
                    'success' => false,
                    'message' => "A sheet named '{$name}' already exists.",
                ], 422);
            }
            $this->googleService->createYearSheet($name);
            return response()->json([
                'success' => true,
                'message' => "Sheet '{$name}' created successfully.",
                'data'    => ['name' => $name],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create sheet: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function deleteSheet(Request $request)
    {
        $authUser = auth()->user();
        if ($authUser && ! $authUser->isAdmin()) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only administrators can delete periods/sheets.',
            ], 403);
        }

        try {
            $name = trim($request->input('name', ''));
            if (empty($name)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Sheet name is required.',
                ], 422);
            }

            $existing = $this->googleService->listSheets(true);
            if (!in_array($name, $existing)) {
                return response()->json([
                    'success' => false,
                    'message' => "Sheet '{$name}' does not exist.",
                ], 404);
            }

            if (count($existing) <= 1) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot delete the only sheet in the spreadsheet.',
                ], 422);
            }

            $this->googleService->deleteSheet($name);

            // Fetch updated list of sheets
            $remaining = $this->googleService->listSheets(true);
            $newActive = !empty($remaining) ? end($remaining) : 'Sheet1';

            return response()->json([
                'success' => true,
                'message' => "Sheet '{$name}' deleted successfully.",
                'data'    => [
                    'remaining' => $remaining,
                    'newActive' => $newActive
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete sheet: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Resolve the latest row version for an issue across sheets.
     * Supports lookup by issue ID (e.g. 'HR-010926-9') or legacy row index.
     */
    private function getLatestIssueRowData(string $idOrRowIndex): ?array
    {
        $crossYear = false;
        $targetSheet = null;
        $targetRowIndex = null;
        $currentRow = null;

        $foundLocation = $this->googleService->findIssueAcrossSheets((string)$idOrRowIndex);
        if ($foundLocation) {
            $allSheets = $this->googleService->listSheets();
            $newestSheet = !empty($allSheets) ? end($allSheets) : 'Sheet1';
            if ($foundLocation['sheet'] !== $newestSheet) {
                $crossYear = true;
            }
            $targetSheet = $foundLocation['sheet'];
            $this->googleService->setSheet($targetSheet);
            $rows = $this->googleService->getRows();
        } else {
            $targetSheet = $this->resolveSheet(null);
            $rows = $this->googleService->getRows();
        }

        $matchedId = null;
        $matchedRowIndices = [];
        // First pass: locate the row matching either row number or ID
        foreach ($rows as $index => $row) {
            $actualRowIndex = $index + 2;
            if (($row[0] ?? '') === (string)$idOrRowIndex || (string)$actualRowIndex === (string)$idOrRowIndex) {
                $matchedId = $row[0] ?? null;
                $targetRowIndex = $actualRowIndex;
                $currentRow = $row;
            }
        }

        // If we found an issue ID, ensure we pick the LATEST row with that ID and collect ALL row indices
        if (!empty($matchedId)) {
            foreach ($rows as $index => $row) {
                $actualRowIndex = $index + 2;
                if (($row[0] ?? '') === $matchedId) {
                    $matchedRowIndices[] = $actualRowIndex;
                    $targetRowIndex = $actualRowIndex;
                    $currentRow = $row;
                }
            }
        } else if ($targetRowIndex) {
            $matchedRowIndices[] = $targetRowIndex;
        }

        if (!$targetRowIndex || !$currentRow) {
            return null;
        }

        return [
            'sheet'          => $targetSheet,
            'rowIndex'       => $targetRowIndex,
            'allRowIndices'  => !empty($matchedRowIndices) ? array_values(array_unique($matchedRowIndices)) : [$targetRowIndex],
            'row'            => array_pad($currentRow, 26, ''),
            'crossYear'      => $crossYear,
            'foundLocation'  => $foundLocation,
        ];
    }

    public function index(Request $request)
    {
        try {
            $sheetParam = $request->query('sheet');
            $forceRefresh = $request->boolean('refresh') || $request->boolean('sync');
            $showArchived = $request->boolean('archived');

            if ($showArchived) {
                $user = $request->user();
                if (!$user || !$user->isAdmin()) {
                    return response()->json([
                        'success' => true,
                        'data'    => [],
                        'sheet'   => $sheetParam ?: '2026',
                    ]);
                }
            }

            $allAvailableSheets = $this->googleService->listSheets($forceRefresh);
            
            $sheetsToFetch = [];
            if ($sheetParam === 'all') {
                $sheetsToFetch = $allAvailableSheets;
            } else {
                $sheetsToFetch = [$this->resolveSheet($sheetParam)];
            }

            $issues = [];

            foreach ($sheetsToFetch as $currentSheet) {
                $this->googleService->setSheet($currentSheet);
                $rows = $this->googleService->getRows($forceRefresh);

                // Group all rows by Issue ID to support versioned append-only rows
                $grouped = [];
                foreach ($rows as $index => $row) {
                    if (empty($row[0])) {
                        continue;
                    }
                    $id = trim($row[0]);
                    $grouped[$id][] = [
                        'row'      => array_pad($row, 26, ''),
                        'rowIndex' => $index + 2,
                    ];
                }

                foreach ($grouped as $id => $versions) {
                    $latestItem = end($versions);
                    $latestRow = $latestItem['row'];
                    $latestRowIndex = $latestItem['rowIndex'];

                    $displayStatus = trim($latestRow[25] ?? '');
                    $isArchived = ($displayStatus === '0');

                    // Filter by archive status
                    if ($showArchived && !$isArchived) {
                        continue;
                    }
                    if (!$showArchived && $isArchived) {
                        continue;
                    }

                    // Reconstruct editLogs across all versions/rows of this issue
                    $editLogs = [];
                    foreach ($versions as $vItem) {
                        $vRow = $vItem['row'];
                        $rawNote = trim($vRow[24] ?? '');
                        if (empty($rawNote)) {
                            continue;
                        }

                        // Support legacy JSON blob if present
                        $decoded = json_decode($rawNote, true);
                        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                            foreach ($decoded as $logEntry) {
                                if (is_array($logEntry)) {
                                    $editLogs[] = $logEntry;
                                }
                            }
                            continue;
                        }

                        // Human-readable plain text note in Column Y
                        $date = '';
                        $cleanChanges = $rawNote;
                        if (preg_match('/^\[(.*?)\]\s*(.*)$/s', $rawNote, $matches)) {
                            $date = trim($matches[1]);
                            $cleanChanges = trim($matches[2]);
                        }

                        $lower = strtolower($cleanChanges);
                        $type = 'edit';
                        if (str_contains($lower, 'klaim') || str_contains($lower, 'claim') || str_contains($lower, 'diambil')) {
                            $type = 'claim';
                        } else if (str_contains($lower, 'diselesaikan') || str_contains($lower, 'solved') || str_contains($lower, 'selesai')) {
                            $type = 'solve';
                        } else if (str_contains($lower, 'pending') || str_contains($lower, 'tunda')) {
                            $type = 'pending';
                        } else if (str_contains($lower, 'arsip') || str_contains($lower, 'archive') || str_contains($lower, 'hapus')) {
                            $type = 'archive';
                        } else if (str_contains($lower, 'pulih') || str_contains($lower, 'restore')) {
                            $type = 'restore';
                        } else if (str_contains($lower, 'rollback') || str_contains($lower, 'kembali')) {
                            $type = 'revert_status';
                        }

                        $logActor = $vRow[9] ?: ($vRow[11] ?: ($vRow[19] ?: $vRow[6]));
                        if (preg_match('/^([^:]+):\s*(.*)$/s', $cleanChanges, $actorMatches) && !str_contains($cleanChanges, 'Status')) {
                            $candidate = trim($actorMatches[1]);
                            if (strlen($candidate) < 40) {
                                $logActor = $candidate;
                            }
                        }

                        $editLogs[] = [
                            'date'         => $date ?: ($vRow[10] ?: ($vRow[12] ?: ($vRow[7] ?? ''))),
                            'by'           => $logActor,
                            'dept'         => $vRow[22] ?? '',
                            'role'         => 'Department',
                            'type'         => $type,
                            'statusChange' => null,
                            'changes'      => $cleanChanges,
                            'reason'       => $vRow[13] ?: ($vRow[18] ?: null),
                            'proofImage'   => !empty($vRow[14]) ? $this->resolveImageUrl($vRow[14]) : null,
                            'duration'     => $vRow[15] ?? null,
                        ];
                    }

                    // Robust fallback for corrupted fields (e.g. literal 'undefined')
                    $safeTitle = (!empty($latestRow[1]) && $latestRow[1] !== 'undefined') ? $latestRow[1] : '';
                    $safeDesc  = (!empty($latestRow[2]) && $latestRow[2] !== 'undefined') ? $latestRow[2] : '';
                    $safeLoc   = (!empty($latestRow[3]) && $latestRow[3] !== 'undefined') ? $latestRow[3] : '';
                    $safeCat   = (!empty($latestRow[4]) && $latestRow[4] !== 'undefined') ? $latestRow[4] : '';
                    $safeDept  = (!empty($latestRow[22]) && $latestRow[22] !== 'undefined') ? $latestRow[22] : '';

                    if (empty($safeTitle) || empty($safeDesc) || empty($safeLoc) || empty($safeCat) || empty($safeDept)) {
                        foreach (array_reverse($versions) as $v) {
                            $vr = $v['row'];
                            if (empty($safeTitle) && !empty($vr[1]) && $vr[1] !== 'undefined') $safeTitle = $vr[1];
                            if (empty($safeDesc) && !empty($vr[2]) && $vr[2] !== 'undefined') $safeDesc = $vr[2];
                            if (empty($safeLoc) && !empty($vr[3]) && $vr[3] !== 'undefined') $safeLoc = $vr[3];
                            if (empty($safeCat) && !empty($vr[4]) && $vr[4] !== 'undefined') $safeCat = $vr[4];
                            if (empty($safeDept) && !empty($vr[22]) && $vr[22] !== 'undefined') $safeDept = $vr[22];
                        }
                    }

                    $archivedAt = null;
                    $archivedBy = null;
                    if ($isArchived) {
                        for ($i = count($editLogs) - 1; $i >= 0; $i--) {
                            if (($editLogs[$i]['type'] ?? '') === 'archive') {
                                $archivedAt = $editLogs[$i]['date'] ?? null;
                                $archivedBy = $editLogs[$i]['by'] ?? null;
                                break;
                            }
                        }

                        $latestRawNote = trim($latestRow[24] ?? '');
                        if (empty($archivedBy)) {
                            // Extract author from latest raw note: [date] Author: ...
                            if (preg_match('/^\[(.*?)\]\s*([^:]+):/s', $latestRawNote, $m)) {
                                if (empty($archivedAt)) {
                                    $archivedAt = trim($m[1]);
                                }
                                $candidate = trim($m[2]);
                                if (strlen($candidate) < 40 && !str_contains($candidate, 'Status') && !str_contains($candidate, 'Detail')) {
                                    $archivedBy = $candidate;
                                }
                            }
                        }

                        if (empty($archivedAt)) {
                            if (preg_match('/^\[(.*?)\]/s', $latestRawNote, $m)) {
                                $archivedAt = trim($m[1]);
                            } else if (!empty($latestRow[12])) {
                                $archivedAt = $latestRow[12];
                            } else if (!empty($latestRow[10])) {
                                $archivedAt = $latestRow[10];
                            } else if (!empty($latestRow[7])) {
                                $archivedAt = $latestRow[7];
                            }
                        }

                        if (empty($archivedBy) || $archivedBy === 'Staff' || $archivedBy === 'Admin / Staff') {
                            $archivedBy = 'Admin';
                        }
                    }

                    $issues[] = [
                        'id'             => $latestRow[0],
                        'rowIndex'       => $latestRowIndex,
                        'sheet'          => $currentSheet,
                        'title'          => $safeTitle,
                        'description'    => $safeDesc,
                        'location'       => $safeLoc,
                        'category'       => $safeCat,
                        'department'     => $safeDept, // Origin department
                        'assignedDepartments' => !empty($latestRow[23]) 
                            ? array_map('trim', explode(',', $latestRow[23])) 
                            : (!empty($latestRow[21]) ? array_map('trim', explode(',', $latestRow[21])) : []),
                        'taggedDepartments' => !empty($latestRow[21]) ? array_map('trim', explode(',', $latestRow[21])) : [],
                        'status'         => $latestRow[5] ?? 'open',
                        'reporter'       => $latestRow[6] ?? 'Anonymous',
                        'reportedAt'     => !empty($latestRow[7]) ? strtotime($latestRow[7]) * 1000 : time() * 1000,
                        'reportedAtIso'  => $latestRow[7] ?? '',
                        'imageUrl'       => $this->resolveImageUrl($latestRow[8] ?? ''),
                        'taker'          => $latestRow[9] ?? null,
                        'takenAt'        => !empty($latestRow[10]) ? strtotime($latestRow[10]) * 1000 : null,
                        'solver'         => $latestRow[11] ?? '',
                        'solvedAt'       => $latestRow[12] ?? '',
                        'fixDescription' => $latestRow[13] ?? '',
                        'proofImageUrl'  => $this->resolveImageUrl($latestRow[14] ?? ''),
                        'durationLabel'  => $latestRow[15] ?? '',
                        'priority'       => $latestRow[16] ?? 'low',
                        'deadline'       => $latestRow[17] ?? '',
                        'pendingReason'  => $this->parsePendingReason($latestRow[18] ?? ''),
                        'pendingTimeline'=> $this->parsePendingTimeline($latestRow[18] ?? '', $latestRow[19] ?? '', $latestRow[20] ?? ''),
                        'pendingBy'      => $latestRow[19] ?? '',
                        'pendingImageUrl'=> $this->resolveImageUrl($latestRow[20] ?? ''),
                        'editLogs'       => $editLogs,
                        'isArchived'     => $isArchived,
                        'archivedAt'     => !empty($archivedAt) ? (strtotime($archivedAt) ? strtotime($archivedAt) * 1000 : $archivedAt) : null,
                        'archivedAtStr'  => $archivedAt,
                        'archivedBy'     => $archivedBy,
                        'archivedRole'   => 'Admin',
                    ];
                }
            }

            return response()->json([
                'success' => true,
                'data'    => $issues,
                'sheet'   => $sheetParam === 'all' ? 'all' : $sheetsToFetch[0],
            ]);
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            $isQuota = str_contains($msg, '429') || str_contains($msg, 'Quota exceeded') || str_contains($msg, 'RESOURCE_EXHAUSTED');

            return response()->json([
                'success' => false,
                'message' => $isQuota 
                    ? 'Google Sheets API rate limit reached (60 req/min). Retrying automatically shortly...' 
                    : 'Failed to fetch issues: ' . $msg,
                'isRateLimit' => $isQuota,
            ], $isQuota ? 429 : 500);
        }
    }

    public function lookup(Request $request, $id = null)
    {
        try {
            $queryId = $id ?: $request->query('id');
            if (empty($queryId)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue ID is required.',
                ], 422);
            }

            $issueData = $this->getLatestIssueRowData((string)$queryId);
            if (!$issueData) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
            }

            $currentRow = $issueData['row'];
            $displayStatus = trim($currentRow[25] ?? '');
            $isArchived = ($displayStatus === '0');

            $archivedAt = null;
            $archivedBy = null;
            if ($isArchived) {
                $rawNote = trim($currentRow[24] ?? '');
                if (preg_match('/\[(.*?)\]\s*([^:]+):\s*Isu diarsipkan/i', $rawNote, $m)) {
                    $archivedAt = trim($m[1]);
                    $candidate = trim($m[2]);
                    if ($candidate !== 'Staff' && $candidate !== 'Admin / Staff') {
                        $archivedBy = $candidate;
                    }
                }
                if (empty($archivedAt)) {
                    if (preg_match('/\[(.*?)\]/', $rawNote, $m)) {
                        $archivedAt = trim($m[1]);
                    } else {
                        $archivedAt = Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');
                    }
                }
                if (empty($archivedBy)) {
                    $archivedBy = 'Admin';
                }
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'id'                  => $currentRow[0] ?? (string)$queryId,
                    'title'               => $currentRow[1] ?? '',
                    'description'         => $currentRow[2] ?? '',
                    'location'            => $currentRow[3] ?? '',
                    'category'            => $currentRow[4] ?? '',
                    'status'              => $currentRow[5] ?? 'open',
                    'reporter'            => $currentRow[6] ?? '',
                    'submittedAt'         => $currentRow[7] ?? '',
                    'imageUrl'            => $this->resolveImageUrl($currentRow[8] ?? ''),
                    'taker'               => $currentRow[9] ?? '',
                    'takenAt'             => $currentRow[10] ?? '',
                    'solver'              => $currentRow[11] ?? '',
                    'solvedAt'            => $currentRow[12] ?? '',
                    'fixDescription'      => $currentRow[13] ?? '',
                    'proofImageUrl'       => $this->resolveImageUrl($currentRow[14] ?? ''),
                    'durationLabel'       => $currentRow[15] ?? '',
                    'priority'            => $currentRow[16] ?? 'low',
                    'deadline'            => $currentRow[17] ?? '',
                    'pendingReason'       => $this->parsePendingReason($currentRow[18] ?? ''),
                    'pendingBy'           => $currentRow[19] ?? '',
                    'pendingImageUrl'     => $this->resolveImageUrl($currentRow[20] ?? ''),
                    'taggedDepartments'   => !empty($currentRow[21]) ? array_map('trim', explode(',', $currentRow[21])) : [],
                    'originDepartment'    => $currentRow[22] ?? '',
                    'assignedDepartments' => !empty($currentRow[23]) ? array_map('trim', explode(',', $currentRow[23])) : (!empty($currentRow[21]) ? array_map('trim', explode(',', $currentRow[21])) : []),
                    'rowIndex'            => $issueData['rowIndex'],
                    'sheet'               => $issueData['sheet'],
                    'isArchived'          => $isArchived,
                    'archivedAt'          => !empty($archivedAt) ? (strtotime($archivedAt) ? strtotime($archivedAt) * 1000 : $archivedAt) : null,
                    'archivedAtStr'       => $archivedAt,
                    'archivedBy'          => $archivedBy,
                ]
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error looking up issue: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $request->validate([
                'title'       => 'required|string|max:255',
                'description' => 'required|string',
                'location'    => 'required|string|max:255',
                'category'    => 'required|string',
                'department'  => 'required|string',
                'assignedDepartments' => 'nullable|string',
                'taggedDepartments'   => 'nullable|string',
                'reporter'    => 'required|string|max:255',
                'reportedAt'  => 'nullable|string',
                'image'       => 'nullable|file|image|mimes:jpg,jpeg,png,webp|max:5120',
            ]);
        } catch (ValidationException $ve) {
            $firstError = collect($ve->errors())->flatten()->first();
            return response()->json([
                'success' => false,
                'message' => $firstError ?: 'Invalid form input.',
                'errors'  => $ve->errors(),
            ], 422);
        }

        try {
            // Always write new issues to the NEWEST sheet
            $this->resolveSheet(null);

            // Get total rows to determine sequential index
            $rows = $this->googleService->getRows();
            $sequentialIndex = count($rows) + 2; 

            // Map full department name to 3-letter code if provided, else use first 3 chars
            $deptCodes = [
                'Engineer'     => 'Eng',
                'Fasilitas'    => 'Fas',
                'Security'     => 'Sec',
                'HK'           => 'HK',
                'Pest Control' => 'Pst',
                'Kitchen'      => 'Ktc',
                'F&B'          => 'Ktc',
                'GR'           => 'GR',
                'GRE'          => 'GRE',
                'Service'      => 'Svc',
                'Bar'          => 'Bar',
                'Spa'          => 'Spa',
                'TiRek'        => 'TRK',
                'HR'           => 'HR',
                'Legal'        => 'LGL',
                'LnD'          => 'LnD',
                'Transportasi' => 'Trp',
                'Tekong'       => 'Trp',
                'IT'           => 'IT',
                'OE'           => 'OE',
                'Procurement'  => 'PRc',
                'Reservasi'    => 'Res',
                'Sales'        => 'Sls',
                'Marketing'    => 'Mkt',
                'Sales/Marketing' => 'Sls',
                'Finance'      => 'Fin',
            ];
            
            $dept = $request->department;
            $isEmergency = strtolower($request->category ?? '') === 'emergency' 
                || strtolower($request->priority ?? '') === 'sos' 
                || !empty($request->is_emergency) 
                || strtolower($dept ?? '') === 'emergency' 
                || strtolower($dept ?? '') === 'sos';

            if ($isEmergency) {
                $deptCode = 'SOS';
                if (empty($dept) || strtolower($dept) === 'undefined') {
                    $dept = 'Emergency';
                }
            } else {
                $deptCode = $deptCodes[$dept] ?? (!empty($dept) ? strtoupper(substr($dept, 0, 3)) : 'GEN');
            }

            $submittedAt = !empty($request->reportedAt)
                ? Carbon::parse($request->reportedAt)->toIso8601String()
                : Carbon::now()->toIso8601String();

            $dateMonth = Carbon::parse($submittedAt)->format('dmy'); // e.g. 190826
            
            $id = "{$deptCode}-{$dateMonth}-{$sequentialIndex}";
            
            $imageUrl = '';
            if ($request->hasFile('image')) {
                $imageUrl = $this->googleService->uploadImage($request->file('image'), "{$id}-problem");
            } else if ($request->priority === 'critical' || $isEmergency) {
                // Fallback to urgent placeholder for critical issues without images
                $imageUrl = url('/urgent.png');
            }
            
            $formattedDesc = self::formatParagraphText($request->description);

            if (!$isEmergency) {
                $assignedList = !empty($request->assignedDepartments) ? array_filter(array_map('trim', explode(',', $request->assignedDepartments))) : [];
                $taggedList = !empty($request->taggedDepartments) ? array_filter(array_map('trim', explode(',', $request->taggedDepartments))) : [];
                
                // Origin department CANNOT assign or tag itself
                if (!empty($dept)) {
                    $assignedList = array_values(array_filter($assignedList, fn($d) => strtolower($d) !== strtolower($dept)));
                    $taggedList = array_values(array_filter($taggedList, fn($d) => strtolower($d) !== strtolower($dept)));
                }

                // Mutually exclusive: remove any tagged department that is already assigned
                $taggedList = array_values(array_filter($taggedList, function($d) use ($assignedList) {
                    return !in_array(strtolower($d), array_map('strtolower', $assignedList));
                }));
                $assignedDeptsStr = implode(', ', $assignedList);
                $taggedDeptsStr   = implode(', ', $taggedList);
            } else {
                $assignedDeptsStr = 'ALL';
                $taggedDeptsStr   = 'ALL';
            }

            $newRow = [
                $id,
                $request->title,
                $formattedDesc,
                $request->location,
                $request->category,
                'open',
                $request->reporter,
                $submittedAt,
                $imageUrl,
                '', // taker
                '', // takenAt
                '', // solver
                '', // solvedAt
                '', // fixDescription
                '', // proofImageUrl
                '', // durationLabel
                $request->priority ?? 'low',
                $request->deadline ?? '',
                '', // 18 pendingReason
                '', // 19 pendingBy
                '', // 20 pendingImageUrl
                $taggedDeptsStr, // 21 tagged_departments (info only)
                $dept ?: ($isEmergency ? 'Emergency' : 'General'), // 22 origin_department
                $assignedDeptsStr, // 23 assigned_department (responsible to fix)
                '', // 24 Edit History (Column Y: empty on creation)
                '1', // 25 Display Status (Column Z: 1 = active)
            ];

            $rowIndex = $this->googleService->appendRow($newRow);
            if ($rowIndex) {
                $this->googleService->colorRowByCategory($rowIndex, $request->category);
            }

            $resolvedImageUrl = $this->resolveImageUrl($imageUrl);
            $originName = $dept ?: ($isEmergency ? 'Emergency (SOS)' : 'General');

            if ($isEmergency) {
                // High-Impact S.O.S Emergency Broadcast Template
                $cleanDesc = trim(str_replace('[EMERGENCY FAST-TRACK]', '', $request->description ?? ''));
                $descBlock = !empty($cleanDesc) ? "\n\n📝 *SITUATION DETAILS:*\n\"{$cleanDesc}\"" : "";

                $message = "🚨🚨🚨 *EMERGENCY S.O.S ALERT* 🚨🚨🚨\n"
                    . "⚡ *IMMEDIATE ACTION REQUIRED (NOW)* ⚡\n\n"
                    . "🔴 *INCIDENT:* {$request->title}\n"
                    . "📍 *LOCATION:* {$request->location}\n"
                    . "🏠 *ORIGIN:* {$originName}\n"
                    . "👤 *REPORTER:* {$request->reporter}\n\n"
                    . "⚠️ *DISPATCH DIRECTIVE:*\n"
                    . "🚨 *ALL RESORT TEAMS ON ALERT:* This is an emergency broadcast. All on-duty teams and available personnel please assess and assist immediately!"
                    . "{$descBlock}\n\n"
                    . "🆔 *TICKET ID:* {$id}";
            } else {
                // Clean Standard Maintenance Report Template
                $priorityStr = "";
                if ($request->priority === 'critical') {
                    $priorityStr = "\n🚨 *PRIORITY: CRITICAL*";
                    if (!empty($request->deadline)) {
                        $deadlineMs = (float) $request->deadline;
                        $minutes = round(($deadlineMs - (now()->timestamp * 1000)) / 60000);
                        if ($minutes <= 0) {
                            $priorityStr .= " *(DEADLINE: NOW)*";
                        } else {
                            $priorityStr .= " *(DEADLINE: {$minutes}m)*";
                        }
                    }
                } else if ($request->priority === 'high') {
                    $priorityStr = "\n⚡ *Priority:* High";
                }

                $assignedStr = '';
                if (!empty($assignedDeptsStr)) {
                    $assignedTags = array_map('trim', explode(',', $assignedDeptsStr));
                    $assignedStr = "\n🎯 *Assigned to:* " . implode(' ', array_map(fn($t) => "@{$t}", $assignedTags)) . " *(Action Required)*";
                }

                $taggedStr = '';
                if (!empty($taggedDeptsStr)) {
                    $tags = array_map('trim', explode(',', $taggedDeptsStr));
                    $taggedStr = "\n📢 *Tagged:* " . implode(' ', array_map(fn($t) => "@{$t}", $tags)) . " *(FYI / Awareness)*";
                }

                $cleanDesc = trim($request->description ?? '');
                $descBlock = !empty($cleanDesc) ? "\n\n📝 *Description:*\n\"{$cleanDesc}\"" : "";

                $catName = ucwords(str_replace('-', ' ', $request->category ?? 'General'));

                $message = "📋 *New Issue Submitted!*{$priorityStr}\n\n"
                    . "*Title:* {$request->title}\n"
                    . "*Location:* {$request->location}\n"
                    . "*Category:* {$catName}\n"
                    . "*Origin:* {$originName}"
                    . "{$assignedStr}"
                    . "{$taggedStr}\n"
                    . "*Reporter:* {$request->reporter}"
                    . "{$descBlock}\n\n"
                    . "*ID:* {$id}";
            }

            $this->notifyWhatsApp([
                'message' => $message,
                'imageUrl' => $resolvedImageUrl,
                'assignedDepartments' => $assignedDeptsStr,
                'taggedDepartments' => $taggedDeptsStr,
                'department' => $originName,
                'priority' => $request->priority ?? 'low'
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Issue reported successfully!',
                'data'    => [
                    'id'          => $id,
                    'title'       => $request->title,
                    'description' => $request->description,
                    'location'    => $request->location,
                    'category'    => $request->category,
                    'status'      => 'open',
                    'reporter'    => $request->reporter,
                    'reportedAt'  => strtotime($submittedAt) * 1000,
                    'imageUrl'    => $resolvedImageUrl,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to report issue: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function claim(Request $request, $idOrRowIndex)
    {
        if (auth()->check() && !auth()->user()->isAdmin() && !auth()->user()->hasPermission('can_manage_issues')) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Izin mengelola isu dinonaktifkan untuk akun Anda oleh Administrator.',
            ], 403);
        }

        try {
            $request->validate([
                'taker' => 'required|string|max:255',
            ]);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'Name required.',
            ], 422);
        }

        try {
            $issueData = $this->getLatestIssueRowData((string)$idOrRowIndex);
            if (!$issueData) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
            }

            $currentRow = $issueData['row'];
            $crossYear = $issueData['crossYear'];
            $foundLocation = $issueData['foundLocation'];

            $displayStatus = trim($currentRow[25] ?? '');
            if ($displayStatus === '0') {
                return response()->json([
                    'success'    => false,
                    'message'    => 'Kartu masalah ini sudah diarsipkan oleh Admin (Archived).',
                    'isArchived' => true,
                ], 422);
            }

            $currentStatus = $currentRow[5] ?? 'open';

            if ($currentStatus !== 'open') {
                return response()->json([
                    'success' => false,
                    'message' => 'Job already taken or resolved.',
                ], 422);
            }

            // Department authorization check
            $rawAssigned = !empty($currentRow[23]) ? $currentRow[23] : (!empty($currentRow[21]) ? $currentRow[21] : '');
            $assignedList = !empty($rawAssigned) ? array_map('trim', explode(',', $rawAssigned)) : [];
            $assignedListUpper = array_map('strtoupper', $assignedList);
            $isAllAssigned = empty($assignedList) || in_array('ALL', $assignedListUpper);

            $authUser = auth()->user();
            $claimantDept = $request->input('department') ?? ($authUser?->department ?? '');
            $claimantSubdiv = $authUser?->subdivision ?? '';

            if (!$isAllAssigned && (! $authUser || ! $authUser->isAdmin()) && !empty($claimantDept)) {
                $assignedNorm = array_map(fn($d) => $this->normalizeDeptKey($d), $assignedList);
                $claimantDeptNorm = $this->normalizeDeptKey($claimantDept);
                $claimantSubdivNorm = !empty($claimantSubdiv) ? $this->normalizeDeptKey($claimantSubdiv) : '';

                $isAuthorized = in_array($claimantDeptNorm, $assignedNorm) ||
                                (!empty($claimantSubdivNorm) && in_array($claimantSubdivNorm, $assignedNorm));

                if (!$isAuthorized) {
                    $assignedStr = implode(', ', array_filter($assignedList, fn($d) => strtoupper($d) !== 'ALL'));
                    return response()->json([
                        'success' => false,
                        'message' => "Klaim tidak diizinkan: Masalah ini ditugaskan khusus untuk [{$assignedStr}]. Departemen Anda ({$claimantDept}) tidak dapat mengklaimnya.",
                    ], 403);
                }
            }

            $takenAt = Carbon::now()->toIso8601String();

            // Lifecycle progress (open -> progress): update in-place without creating a new row
            $currentRow = array_pad($currentRow, 26, '');
            $currentRow[5]  = 'progress';
            $currentRow[9]  = $request->taker;
            $currentRow[10] = $takenAt;
            $currentRow[25] = '1';
            $targetSheet = $issueData['foundLocation']['sheet'] ?? null;
            if ($targetSheet) {
                $this->googleService->updateRow($issueData['rowIndex'], $currentRow, $targetSheet);
            } else {
                $this->googleService->updateRow($issueData['rowIndex'], $currentRow);
            }

            $crossYearNotice = $crossYear ? "\n📋 *Note: This issue is from a previous period ({$foundLocation['sheet']}).*" : '';
            $originDept = $currentRow[22] ?? '';
            $assignedDepts = $currentRow[23] ?? ($currentRow[21] ?? '');
            $taggedDepts = $currentRow[21] ?? '';
            $originStr = !empty($originDept) ? "\n*Origin:* {$originDept}" : '';
            $takerDeptStr = !empty($request->department) ? " ({$request->department})" : '';

            $this->notifyWhatsApp([
                'message' => "👷 *Issue Claimed!*{$crossYearNotice}\n*Title:* {$currentRow[1]}\n*Location:* {$currentRow[3]}{$originStr}\n*Taken by:* {$request->taker}{$takerDeptStr}\n*ID:* {$currentRow[0]}",
                'department' => $originDept,
                'assignedDepartments' => $assignedDepts,
                'taggedDepartments' => $taggedDepts,
            ]);

            $this->notifyIssueProgress(
                $originDept,
                "Isu Diklaim: {$currentRow[1]}",
                "Isu '{$currentRow[1]}' telah diklaim oleh {$request->taker}{$takerDeptStr}.",
                $currentRow[0]
            );

            return response()->json([
                'success'   => true,
                'message'   => 'Job claimed successfully!',
                'crossYear' => $crossYear,
                'data'    => [
                    'status'  => 'progress',
                    'taker'   => $request->taker,
                    'takenAt' => strtotime($takenAt) * 1000,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to claim job: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function resolve(Request $request, $idOrRowIndex)
    {
        if (auth()->check() && !auth()->user()->isAdmin() && !auth()->user()->hasPermission('can_manage_issues')) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Izin mengelola isu dinonaktifkan untuk akun Anda oleh Administrator.',
            ], 403);
        }

        try {
            $request->validate([
                'solver'         => 'required|string|max:255',
                'fixDescription' => 'required|string',
                'proofImage'     => 'nullable|file|image|mimes:jpg,jpeg,png,webp|max:5120',
            ]);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'Invalid input.',
            ], 422);
        }

        try {
            $issueData = $this->getLatestIssueRowData((string)$idOrRowIndex);
            if (!$issueData) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
            }

            $currentRow = $issueData['row'];

            $displayStatus = trim($currentRow[25] ?? '');
            if ($displayStatus === '0') {
                return response()->json([
                    'success'    => false,
                    'message'    => 'Kartu masalah ini sudah diarsipkan oleh Admin (Archived).',
                    'isArchived' => true,
                ], 422);
            }

            $authUser = auth()->user();
            if (!$this->isAuthorizedToModifyIssue($authUser, $currentRow)) {
                $userDept = $authUser?->department ?? 'lain';
                return response()->json([
                    'success' => false,
                    'message' => "Akses Ditolak: Anda saat ini bertugas di departemen {$userDept}. Riwayat isu dari departemen terdahulu hanya dapat dilihat (Read-Only).",
                ], 403);
            }

            $submittedAtRaw = $currentRow[7] ?? null;

            $proofUrl = '';
            if ($request->hasFile('proofImage')) {
                $proofUrl = $this->googleService->uploadImage($request->file('proofImage'), "{$idOrRowIndex}-proof");
            }

            $solvedAtCarbon = Carbon::now();
            $solvedAt = $solvedAtCarbon->toIso8601String();

            $durationLabel = 'Solved';
            if ($submittedAtRaw) {
                $submittedCarbon = Carbon::parse($submittedAtRaw);
                $diffInMinutes = max(1, intval($submittedCarbon->diffInMinutes($solvedAtCarbon)));

                if ($diffInMinutes < 60) {
                    $durationLabel = "Solved in {$diffInMinutes} minute" . ($diffInMinutes === 1 ? '' : 's');
                } else {
                    $diffInHours = intdiv($diffInMinutes, 60);
                    if ($diffInHours < 24) {
                        $durationLabel = "Solved in {$diffInHours} hour" . ($diffInHours == 1 ? '' : 's');
                    } else {
                        $diffInDays = intdiv($diffInHours, 24);
                        $remHours = $diffInHours % 24;
                        if ($remHours === 0) {
                            $durationLabel = "Solved in {$diffInDays} day" . ($diffInDays == 1 ? '' : 's');
                        } else {
                            $durationLabel = "Solved in {$diffInDays} day" . ($diffInDays == 1 ? '' : 's') . " {$remHours} hour" . ($remHours == 1 ? '' : 's');
                        }
                    }
                }
            }

            $formattedFix = self::formatParagraphText($request->fixDescription);

            // Lifecycle progress (progress/pending -> solved): update in-place without creating a new row
            $currentRow = array_pad($currentRow, 26, '');
            $currentRow[5]  = 'solved';
            $currentRow[11] = $request->solver;
            $currentRow[12] = $solvedAt;
            $currentRow[13] = $formattedFix;
            $currentRow[14] = $proofUrl ?: ($currentRow[14] ?? '');
            $currentRow[15] = $durationLabel;
            $currentRow[25] = '1';

            $targetSheet = $issueData['foundLocation']['sheet'] ?? null;
            if ($targetSheet) {
                $this->googleService->updateRow($issueData['rowIndex'], $currentRow, $targetSheet);
            } else {
                $this->googleService->updateRow($issueData['rowIndex'], $currentRow);
            }

            $resolvedProofUrl = $this->resolveImageUrl($proofUrl);

            $originDept = $currentRow[22] ?? '';
            $assignedDepts = $currentRow[23] ?? ($currentRow[21] ?? '');
            $taggedDepts = $currentRow[21] ?? '';
            $originStr = !empty($originDept) ? "\n*Origin:* {$originDept}" : '';

            $this->notifyWhatsApp([
                    'message' => "✅ *Issue Resolved!*\n*Title:* {$currentRow[1]}\n*Location:* {$currentRow[3]}{$originStr}\n*Solved by:* {$request->solver}\n*Notes:* {$request->fixDescription}\n*ID:* {$currentRow[0]}",
                    'imageUrl' => $resolvedProofUrl,
                    'department' => $originDept,
                    'assignedDepartments' => $assignedDepts,
                    'taggedDepartments' => $taggedDepts,
                ]);

            $this->notifyIssueProgress(
                $originDept,
                "Isu Selesai (Solved): {$currentRow[1]}",
                "Isu '{$currentRow[1]}' telah diselesaikan oleh {$request->solver}.",
                $currentRow[0]
            );

            return response()->json([
                'success' => true,
                'message' => 'Issue resolved successfully!',
                'data'    => [
                    'status'         => 'solved',
                    'solver'         => $request->solver,
                    'solvedAt'       => strtotime($solvedAt) * 1000,
                    'fixDescription' => $request->fixDescription,
                    'proofImageUrl'  => $resolvedProofUrl,
                    'durationLabel'  => $durationLabel,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to resolve issue: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function pending(Request $request, $idOrRowIndex)
    {
        if (auth()->check() && !auth()->user()->isAdmin() && !auth()->user()->hasPermission('can_manage_issues')) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Izin mengelola isu dinonaktifkan untuk akun Anda oleh Administrator.',
            ], 403);
        }

        try {
            $request->validate([
                'pendingBy'     => 'required|string|max:255',
                'pendingReason' => 'required|string',
                'pendingImage'  => 'nullable|file|image|mimes:jpg,jpeg,png,webp|max:5120',
            ]);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'Invalid input.',
            ], 422);
        }

        try {
            $issueData = $this->getLatestIssueRowData((string)$idOrRowIndex);
            if (!$issueData) {
                return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
            }

            $currentRow = $issueData['row'];

            $displayStatus = trim($currentRow[25] ?? '');
            if ($displayStatus === '0') {
                return response()->json([
                    'success'    => false,
                    'message'    => 'Kartu masalah ini sudah diarsipkan oleh Admin (Archived).',
                    'isArchived' => true,
                ], 422);
            }

            $authUser = auth()->user();
            if (!$this->isAuthorizedToModifyIssue($authUser, $currentRow)) {
                $userDept = $authUser?->department ?? 'lain';
                return response()->json([
                    'success' => false,
                    'message' => "Akses Ditolak: Anda saat ini bertugas di departemen {$userDept}. Riwayat isu dari departemen terdahulu hanya dapat dilihat (Read-Only).",
                ], 403);
            }

            $pendingDataRaw = $currentRow[18] ?? '';
            $existingItems = [];
            if (!empty($pendingDataRaw)) {
                $decoded = json_decode($pendingDataRaw, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    $existingItems = $decoded;
                } else {
                    $existingItems = [[
                        'date'   => '',
                        'by'     => $currentRow[19] ?? 'Staff',
                        'reason' => $pendingDataRaw,
                        'image'  => $currentRow[20] ?? '',
                    ]];
                }
            }

            $date = \Carbon\Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');
            
            $pendingImageUrl = '';
            if ($request->hasFile('pendingImage')) {
                $timestamp = time();
                $pendingImageUrl = $this->googleService->uploadImage($request->file('pendingImage'), "{$idOrRowIndex}-pending-{$timestamp}");
            }

            $isDuplicate = false;
            if (!empty($existingItems)) {
                $last = end($existingItems);
                if (
                    is_array($last) &&
                    ($last['reason'] ?? '') === $request->pendingReason &&
                    ($last['by'] ?? '') === $request->pendingBy &&
                    ($last['date'] ?? '') === $date
                ) {
                    $isDuplicate = true;
                }
            }

            if (!$isDuplicate) {
                $existingItems[] = [
                    'date'   => $date,
                    'by'     => $request->pendingBy,
                    'reason' => $request->pendingReason,
                    'image'  => $pendingImageUrl,
                ];
            }

            $newJson = json_encode($existingItems);

            // Lifecycle progress (progress -> pending): update in-place without creating a new row
            $currentRow = array_pad($currentRow, 26, '');
            $currentRow[5]  = 'pending';
            $currentRow[18] = $newJson;
            $currentRow[19] = $request->pendingBy;
            $currentRow[20] = $pendingImageUrl ?: ($currentRow[20] ?? '');
            $currentRow[25] = '1';

            $targetSheet = $issueData['foundLocation']['sheet'] ?? null;
            if ($targetSheet) {
                $this->googleService->updateRow($issueData['rowIndex'], $currentRow, $targetSheet);
            } else {
                $this->googleService->updateRow($issueData['rowIndex'], $currentRow);
            }

            $resolvedPendingUrl = $this->resolveImageUrl($pendingImageUrl);
            $resolvedTimeline = $this->parsePendingTimeline($newJson);

            $originDept = $currentRow[22] ?? '';
            $assignedDepts = $currentRow[23] ?? ($currentRow[21] ?? '');
            $taggedDepts = $currentRow[21] ?? '';
            $originStr = !empty($originDept) ? "\n*Origin:* {$originDept}" : '';

            $this->notifyWhatsApp([
                    'message' => "⏸️ *Issue Pending!*\n*Title:* {$currentRow[1]}\n*Location:* {$currentRow[3]}{$originStr}\n*Pending By:* {$request->pendingBy}\n*Reason:* {$request->pendingReason}\n*ID:* {$currentRow[0]}",
                    'imageUrl' => $resolvedPendingUrl,
                    'department' => $originDept,
                    'assignedDepartments' => $assignedDepts,
                    'taggedDepartments' => $taggedDepts,
                ]);

            $this->notifyIssueProgress(
                $originDept,
                "Isu Tertunda (Pending): {$currentRow[1]}",
                "Isu '{$currentRow[1]}' ditandai pending oleh {$request->pendingBy}. Alasan: {$request->pendingReason}",
                $currentRow[0]
            );

            return response()->json([
                'success' => true,
                'message' => 'Issue marked as pending!',
                'data'    => [
                    'status'          => 'pending',
                    'pendingBy'       => $request->pendingBy,
                    'pendingReason'   => $newJson,
                    'pendingTimeline' => $resolvedTimeline,
                    'pendingImageUrl' => $resolvedPendingUrl,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to mark pending: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateCategory(Request $request, $idOrRowIndex)
    {
        if (auth()->check() && !auth()->user()->isAdmin() && !auth()->user()->hasPermission('can_manage_issues')) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Izin mengelola isu dinonaktifkan untuk akun Anda oleh Administrator.',
            ], 403);
        }

        $request->validate([
            'category' => 'required|string',
        ]);
        
        try {
            $issueData = $this->getLatestIssueRowData((string)$idOrRowIndex);
            if (!$issueData) {
                return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
            }

            $currentRow = $issueData['row'];

            $displayStatus = trim($currentRow[25] ?? '');
            if ($displayStatus === '0') {
                return response()->json([
                    'success'    => false,
                    'message'    => 'Kartu masalah ini sudah diarsipkan oleh Admin (Archived).',
                    'isArchived' => true,
                ], 422);
            }

            $nowFormatted = Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');
            $note = "[{$nowFormatted}] Kategori diubah ke {$request->category}";

            $newRow = array_pad($currentRow, 26, '');
            $newRow[4]  = $request->category;
            $newRow[24] = $note;
            $newRow[25] = '1';

            $targetSheet = $issueData['foundLocation']['sheet'] ?? null;
            $newRowIndex = $this->googleService->insertRowAfter($issueData['rowIndex'], $newRow, $targetSheet);
            if ($newRowIndex) {
                $this->googleService->colorRowByCategory($newRowIndex, $request->category, $targetSheet);
            }

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to update category: ' . $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $idOrRowIndex)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        if (!$user->isAdmin() && !$user->hasPermission('can_manage_issues')) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Izin mengedit isu dinonaktifkan untuk akun Anda oleh Administrator.',
            ], 403);
        }

        try {
            $request->validate([
                'title'               => 'nullable|string|max:255',
                'description'         => 'nullable|string',
                'location'            => 'nullable|string|max:255',
                'category'            => 'nullable|string',
                'priority'            => 'nullable|string',
                'deadline'            => 'nullable|string',
                'assignedDepartments' => 'nullable|string',
                'taggedDepartments'   => 'nullable|string',
                'image'               => 'nullable|file|image|mimes:jpg,jpeg,png,webp|max:5120',
                // State-specific fields
                'status'              => 'nullable|string',
                'statusReason'        => 'nullable|string',
                'removePending'       => 'nullable',
                'deletePendingIndex'  => 'nullable',
                'taker'               => 'nullable|string|max:255',
                'pendingBy'           => 'nullable|string|max:255',
                'pendingReason'       => 'nullable|string',
                'pendingImage'        => 'nullable|file|image|mimes:jpg,jpeg,png,webp|max:5120',
                'solver'              => 'nullable|string|max:255',
                'fixDescription'      => 'nullable|string',
                'proofImage'          => 'nullable|file|image|mimes:jpg,jpeg,png,webp|max:5120',
            ]);
        } catch (ValidationException $ve) {
            $firstError = collect($ve->errors())->flatten()->first();
            return response()->json([
                'success' => false,
                'message' => $firstError ?: 'Invalid form input.',
                'errors'  => $ve->errors(),
            ], 422);
        }

        try {
            $issueData = $this->getLatestIssueRowData((string)$idOrRowIndex);
            if (!$issueData) {
                return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
            }

            $currentRow = $issueData['row'];

            $displayStatus = trim($currentRow[25] ?? '');
            if ($displayStatus === '0') {
                return response()->json([
                    'success'    => false,
                    'message'    => 'Kartu masalah ini sudah diarsipkan oleh Admin (Archived).',
                    'isArchived' => true,
                ], 422);
            }

            // Granular Authorization check
            $originDept = $currentRow[22] ?? '';
            $userDept   = strtolower(trim($user->department ?? ''));
            $isAdmin    = $user->isAdmin();
            $isOrigin   = !empty($userDept) && $userDept === strtolower(trim($originDept));

            $assignedDeptsRaw = $currentRow[23] ?? ($currentRow[21] ?? '');
            $assignedList = !empty($assignedDeptsRaw) ? array_map('strtolower', array_map('trim', explode(',', $assignedDeptsRaw))) : [];
            $isAssigned = !empty($userDept) && in_array($userDept, $assignedList);

            $currentTaker     = $currentRow[9] ?? '';
            $currentSolver    = $currentRow[11] ?? '';
            $currentPendingBy = $currentRow[19] ?? '';

            $canEditReport  = $isAdmin || $isOrigin;
            $canEditClaim   = $isAdmin || $isAssigned || (!empty($currentTaker) && str_contains(strtolower($currentTaker), $userDept));
            $canEditPending = $isAdmin || $isAssigned || (!empty($currentPendingBy) && str_contains(strtolower($currentPendingBy), $userDept));
            $canEditSolved  = $isAdmin || $isAssigned || (!empty($currentSolver) && str_contains(strtolower($currentSolver), $userDept));

            if (!$isAdmin && !$isOrigin && !$isAssigned) {
                $deptDisplay = $user->department ?: 'lain';
                return response()->json([
                    'success' => false,
                    'message' => "Akses Ditolak: Anda saat ini bertugas di departemen {$deptDisplay}. Riwayat pekerjaan terdahulu hanya dapat dilihat (Read-Only).",
                ], 403);
            }

            if (!$canEditReport && !$canEditClaim && !$canEditPending && !$canEditSolved) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized. You do not have permission to edit this issue.',
                ], 403);
            }

            $changes = [];
            $updateCols = [];

            // ================= 1. INITIAL REPORT FIELDS (Origin or Admin) =================
            $newTitle    = $currentRow[1] ?? '';
            $newDesc     = $currentRow[2] ?? '';
            $newLoc      = $currentRow[3] ?? '';
            $newCat      = $currentRow[4] ?? 'broken';
            $newPriority = $currentRow[16] ?? 'low';
            $newDeadline = $currentRow[17] ?? '';
            $newAssigned = $currentRow[23] ?? '';
            $newTagged   = $currentRow[21] ?? '';

            if ($canEditReport) {
                if ($request->has('title')) {
                    $rawTitle = trim($request->input('title', ''));
                    if ($rawTitle !== '' && $rawTitle !== 'undefined' && $rawTitle !== ($currentRow[1] ?? '')) {
                        $newTitle = $rawTitle;
                        $changes[] = "Title: \"{$newTitle}\"";
                        $updateCols['B'] = $newTitle;
                    }
                }

                if ($request->has('description')) {
                    $rawDesc = trim($request->input('description', ''));
                    if ($rawDesc !== '' && $rawDesc !== 'undefined') {
                        $formattedDesc = self::formatParagraphText($rawDesc);
                        if ($formattedDesc !== ($currentRow[2] ?? '')) {
                            $newDesc = $formattedDesc;
                            $changes[] = "Description updated";
                            $updateCols['C'] = $newDesc;
                        }
                    }
                }

                if ($request->has('location')) {
                    $rawLoc = trim($request->input('location', ''));
                    if ($rawLoc !== '' && $rawLoc !== 'undefined' && $rawLoc !== ($currentRow[3] ?? '')) {
                        $newLoc = $rawLoc;
                        $changes[] = "Location: \"{$newLoc}\"";
                        $updateCols['D'] = $newLoc;
                    }
                }

                if ($request->has('category')) {
                    $rawCat = trim($request->input('category', ''));
                    if ($rawCat !== '' && $rawCat !== 'undefined' && $rawCat !== ($currentRow[4] ?? '')) {
                        $newCat = $rawCat;
                        $changes[] = "Category: " . ($currentRow[4] ?? '') . " → {$newCat}";
                        $updateCols['E'] = $newCat;
                    }
                }

                if ($request->has('priority')) {
                    $rawPriority = trim($request->input('priority', ''));
                    if ($rawPriority !== '' && $rawPriority !== 'undefined' && $rawPriority !== ($currentRow[16] ?? 'low')) {
                        $newPriority = $rawPriority;
                        $changes[] = "Priority: " . ($currentRow[16] ?? 'low') . " → {$newPriority}";
                        $updateCols['Q'] = $newPriority;
                    }
                }

                if ($request->has('deadline')) {
                    $rawDeadline = trim($request->input('deadline', ''));
                    if ($rawDeadline !== 'undefined' && $rawDeadline !== ($currentRow[17] ?? '')) {
                        $newDeadline = $rawDeadline;
                        $changes[] = "Deadline updated";
                        $updateCols['R'] = $newDeadline;
                    }
                }

                if ($request->has('assignedDepartments') || $request->has('taggedDepartments')) {
                    $rawAssigned = $request->input('assignedDepartments', '');
                    $rawTagged   = $request->input('taggedDepartments', '');

                    if ($rawAssigned !== 'undefined' && $rawTagged !== 'undefined') {
                        $assignedListParsed = !empty($rawAssigned) ? array_filter(array_map('trim', explode(',', $rawAssigned))) : [];
                        $taggedListParsed   = !empty($rawTagged) ? array_filter(array_map('trim', explode(',', $rawTagged))) : [];

                        // Origin department cannot assign or tag itself
                        if (!empty($originDept)) {
                            $assignedListParsed = array_values(array_filter($assignedListParsed, fn($d) => strtolower($d) !== strtolower($originDept)));
                            $taggedListParsed   = array_values(array_filter($taggedListParsed, fn($d) => strtolower($d) !== strtolower($originDept)));
                        }

                        // Mutually exclusive: remove any tagged department that is already assigned
                        $taggedListParsed = array_values(array_filter($taggedListParsed, function($d) use ($assignedListParsed) {
                            return !in_array(strtolower($d), array_map('strtolower', $assignedListParsed));
                        }));

                        $newAssigned = implode(', ', $assignedListParsed);
                        $newTagged   = implode(', ', $taggedListParsed);

                        if (($currentRow[23] ?? '') !== $newAssigned) {
                            $changes[] = "Assigned: {$newAssigned}";
                            $updateCols['X'] = $newAssigned;
                        }

                        if (($currentRow[21] ?? '') !== $newTagged) {
                            $changes[] = "Tagged: {$newTagged}";
                            $updateCols['V'] = $newTagged;
                        }
                    }
                }

                $imageUrl = $currentRow[8] ?? '';
                if ($request->hasFile('image')) {
                    $imageUrl = $this->googleService->uploadImage($request->file('image'), "{$currentRow[0]}-updated-" . time());
                    $changes[] = "Photo updated";
                    $updateCols['I'] = $imageUrl;
                }
            }

            // ================= 2. CLAIM FIELDS (Claiming/Assigned Dept or Admin) =================
            if ($canEditClaim && $request->has('taker')) {
                $newTaker = trim($request->input('taker', ''));
                $oldTaker = $currentRow[9] ?? '';
                if ($oldTaker !== $newTaker) {
                    $changes[] = "Petugas / Taker: " . ($oldTaker ?: 'None') . " → " . ($newTaker ?: 'None');
                    $updateCols['J'] = $newTaker;
                }
            }

            // ================= 3. PENDING FIELDS (Pending/Assigned Dept or Admin) =================
            if ($canEditPending && ($request->has('pendingReason') || $request->has('pendingBy') || $request->hasFile('pendingImage'))) {
                $pendingDataRaw = $currentRow[18] ?? '';
                $existingTimeline = [];
                if (!empty($pendingDataRaw)) {
                    $decoded = json_decode($pendingDataRaw, true);
                    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                        $existingTimeline = $decoded;
                    }
                }

                $newPendingReason = $request->has('pendingReason') ? trim($request->input('pendingReason', '')) : null;
                $newPendingBy = $request->has('pendingBy') ? trim($request->input('pendingBy', '')) : null;
                $uploadedPendingImg = null;
                if ($request->hasFile('pendingImage')) {
                    $uploadedPendingImg = $this->googleService->uploadImage($request->file('pendingImage'), "{$currentRow[0]}-pending-" . time());
                    $updateCols['U'] = $uploadedPendingImg;
                    $changes[] = "Pending Photo updated";
                }

                if (!empty($existingTimeline)) {
                    $lastIdx = count($existingTimeline) - 1;
                    $timelineChanged = false;
                    if ($newPendingReason !== null && ($existingTimeline[$lastIdx]['reason'] ?? '') !== $newPendingReason) {
                        $changes[] = "Pending Reason updated";
                        $existingTimeline[$lastIdx]['reason'] = $newPendingReason;
                        $timelineChanged = true;
                    }
                    if ($newPendingBy !== null && ($existingTimeline[$lastIdx]['by'] ?? '') !== $newPendingBy) {
                        $changes[] = "Pending By updated";
                        $existingTimeline[$lastIdx]['by'] = $newPendingBy;
                        $updateCols['T'] = $newPendingBy;
                        $timelineChanged = true;
                    }
                    if ($uploadedPendingImg) {
                        $existingTimeline[$lastIdx]['image'] = $uploadedPendingImg;
                        $timelineChanged = true;
                    }
                    if ($timelineChanged) {
                        $updateCols['S'] = json_encode($existingTimeline);
                    }
                } else {
                    if ($newPendingBy !== null) {
                        $oldPendingBy = $currentRow[19] ?? '';
                        if ($oldPendingBy !== $newPendingBy) {
                            $changes[] = "Pending By: " . ($oldPendingBy ?: 'None') . " → " . ($newPendingBy ?: 'None');
                            $updateCols['T'] = $newPendingBy;
                        }
                    }
                    if ($newPendingReason !== null) {
                        $oldReason = $currentRow[18] ?? '';
                        if ($oldReason !== $newPendingReason) {
                            $changes[] = "Pending Reason updated";
                            $updateCols['S'] = $newPendingReason;
                        }
                    }
                }
            }

            // ================= 4. SOLVED FIELDS (Solver/Assigned Dept or Admin) =================
            if ($canEditSolved) {
                if ($request->has('solver')) {
                    $newSolver = trim($request->input('solver', ''));
                    $oldSolver = $currentRow[11] ?? '';
                    if ($oldSolver !== $newSolver) {
                        $changes[] = "Solver: " . ($oldSolver ?: 'None') . " → " . ($newSolver ?: 'None');
                        $updateCols['L'] = $newSolver;
                    }
                }

                if ($request->has('fixDescription')) {
                    $newFixDesc = self::formatParagraphText($request->input('fixDescription', ''));
                    $oldFixDesc = $currentRow[13] ?? '';
                    if ($oldFixDesc !== $newFixDesc) {
                        $changes[] = "Fix Description updated";
                        $updateCols['N'] = $newFixDesc;
                    }
                }

                if ($request->hasFile('proofImage')) {
                    $proofImgUrl = $this->googleService->uploadImage($request->file('proofImage'), "{$currentRow[0]}-proof-" . time());
                    $updateCols['O'] = $proofImgUrl;
                    $changes[] = "Proof Photo updated";
                }
            }

            // ================= 5. STATUS TRANSITIONS & PROGRESS ROLLBACK =================
            $oldStatus = $currentRow[5] ?? 'open';
            $newStatus = $request->has('status') ? trim($request->input('status')) : $oldStatus;
            $statusReason = trim($request->input('statusReason', ''));

            if ($newStatus !== $oldStatus) {
                // Strict validation: update() only allows backward rollbacks (not jumping forward to solved/pending/progress)
                $isValidTransition = false;
                if ($oldStatus === 'solved' && in_array($newStatus, ['pending', 'progress', 'open'])) {
                    $isValidTransition = true;
                } else if ($oldStatus === 'pending' && in_array($newStatus, ['progress', 'open'])) {
                    $isValidTransition = true;
                } else if ($oldStatus === 'progress' && $newStatus === 'open') {
                    $isValidTransition = true;
                }

                if (!$isValidTransition) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Invalid status transition. You can only roll back status from the edit menu. To claim, delay, or resolve, use the dedicated action buttons.',
                    ], 422);
                }

                // Determine authorization for status transition
                $canChangeStatus = false;
                if ($isAdmin) {
                    $canChangeStatus = true;
                } else if ($newStatus === 'open') {
                    // Unclaim / Reset to open
                    $canChangeStatus = $isOrigin || $canEditClaim || $canEditPending || $canEditSolved;
                } else if ($newStatus === 'progress') {
                    // Resume from pending or reopen from solved
                    $canChangeStatus = $canEditClaim || $canEditPending || $canEditSolved || $isOrigin;
                } else if ($newStatus === 'pending') {
                    $canChangeStatus = $canEditClaim || $canEditPending;
                }

                if (!$canChangeStatus) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Unauthorized to perform this status rollback.',
                    ], 403);
                }

                $updateCols['F'] = $newStatus;

                // Handle column resets based on rollback target
                if ($newStatus === 'open') {
                    // Unclaim: clear taker & takenAt & solver
                    $updateCols['J'] = '';
                    $updateCols['K'] = '';
                    $updateCols['L'] = '';
                    $updateCols['M'] = '';
                    $updateCols['N'] = '';
                    $updateCols['O'] = '';
                    $changes[] = "Status Rollback: " . strtoupper($oldStatus) . " ➔ OPEN" . ($statusReason ? " (Alasan: {$statusReason})" : "");
                } else if ($newStatus === 'progress') {
                    if ($oldStatus === 'solved') {
                        // Reopen solved issue
                        $updateCols['L'] = '';
                        $updateCols['M'] = '';
                        $changes[] = "Status Reopened: SOLVED ➔ IN PROGRESS" . ($statusReason ? " (Alasan: {$statusReason})" : "");
                    } else if ($oldStatus === 'pending') {
                        // Resume from pending
                        $changes[] = "Status Resumed: PENDING ➔ IN PROGRESS" . ($statusReason ? " (Alasan: {$statusReason})" : "");
                    } else {
                        $changes[] = "Status Changed: " . strtoupper($oldStatus) . " ➔ IN PROGRESS";
                    }
                } else {
                    $changes[] = "Status Changed: " . strtoupper($oldStatus) . " ➔ " . strtoupper($newStatus);
                }
            }

            // Optional: Remove pending delay entry if requested (e.g. accidental pending / mistake)
            if ($request->boolean('removePending') || $request->input('removePending') === 'latest' || $request->has('deletePendingIndex')) {
                $pendingDataRaw = $currentRow[18] ?? '';
                $existingPending = [];
                if (!empty($pendingDataRaw)) {
                    $decoded = json_decode($pendingDataRaw, true);
                    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                        $existingPending = $decoded;
                    } else {
                        $existingPending = [[
                            'date'   => '',
                            'by'     => $currentRow[19] ?? 'Staff',
                            'reason' => $pendingDataRaw,
                            'image'  => $currentRow[20] ?? '',
                        ]];
                    }
                }

                $delIdx = $request->has('deletePendingIndex') 
                    ? intval($request->input('deletePendingIndex')) 
                    : count($existingPending) - 1;

                if ($delIdx >= 0 && isset($existingPending[$delIdx])) {
                    $removedItem = $existingPending[$delIdx];
                    array_splice($existingPending, $delIdx, 1);
                    $changes[] = "Catatan pending dihapus: \"" . ($removedItem['reason'] ?? '') . "\"";
                }

                if (empty($existingPending)) {
                    $updateCols['S'] = '';
                    $updateCols['T'] = '';
                    $updateCols['U'] = '';
                } else {
                    $updateCols['S'] = json_encode(array_values($existingPending));
                    $lastItem = end($existingPending);
                    $updateCols['T'] = $lastItem['by'] ?? '';
                    $updateCols['U'] = $lastItem['image'] ?? '';
                }
            }

            // Append structured edit & audit log entry
            $existingLogs = $this->parseEditLogs($currentRow[24] ?? '');
            $editorName = $user->staff_name ?? $user->name ?? 'Staff';
            $editorDept = $user->department ?? ($user->isAdmin() ? 'Admin' : '');
            $editorRole = $user->isAdmin() ? 'Admin' : 'Department';

            $isRevert = ($newStatus !== $oldStatus) && (
                $newStatus === 'open' || 
                ($oldStatus === 'solved' && in_array($newStatus, ['progress', 'pending', 'open'])) ||
                ($oldStatus === 'pending' && in_array($newStatus, ['progress', 'open']))
            );

            $logType = 'edit';
            if ($isRevert && count($changes) > 1) {
                $logType = 'revert_and_edit';
            } else if ($isRevert) {
                $logType = 'revert_status';
            } else if ($newStatus !== $oldStatus) {
                $logType = 'status_change';
            }

            $editEntry = [
                'date'         => Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s'),
                'by'           => $editorName,
                'dept'         => $editorDept,
                'role'         => $editorRole,
                'type'         => $logType,
                'from'         => $oldStatus,
                'to'           => $newStatus,
                'statusChange' => $newStatus !== $oldStatus ? "{$oldStatus} → {$newStatus}" : null,
                'reason'       => $statusReason ?: null,
                'changes'      => !empty($changes) ? implode(', ', $changes) : 'Issue details modified',
            ];
            $existingLogs[] = $editEntry;
            $logsJson = json_encode($existingLogs);

            $newRow = array_pad($currentRow, 26, '');
            $colMap = [
                'B' => 1, 'C' => 2, 'D' => 3, 'E' => 4, 'F' => 5,
                'G' => 6, 'H' => 7, 'I' => 8, 'J' => 9, 'K' => 10,
                'L' => 11, 'M' => 12, 'N' => 13, 'O' => 14, 'P' => 15,
                'Q' => 16, 'R' => 17, 'S' => 18, 'T' => 19, 'U' => 20,
                'V' => 21, 'W' => 22, 'X' => 23,
            ];
            foreach ($updateCols as $col => $val) {
                if (isset($colMap[$col])) {
                    $newRow[$colMap[$col]] = $val;
                }
            }

            $nowFormatted = Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');
            $changeSummary = !empty($changes) ? implode(', ', $changes) : 'Detail isu diperbarui';
            $newRow[24] = "[{$nowFormatted}] {$editorName}: {$changeSummary}";
            $newRow[25] = '1';

            $targetSheet = $issueData['foundLocation']['sheet'] ?? null;
            $newRowIndex = $this->googleService->insertRowAfter($issueData['rowIndex'], $newRow, $targetSheet);
            if ($newRowIndex) {
                $this->googleService->colorRowByCategory($newRowIndex, $newRow[4] ?? 'other', $targetSheet);
            }

            // Dispatch WhatsApp notification
            $changeSummaryStr = !empty($changes) ? implode("\n• ", $changes) : 'Details updated';
            $originStr     = !empty($originDept) ? "\n*Origin:* {$originDept}" : '';
                $resolvedImg   = $this->resolveImageUrl($imageUrl ?? ($currentRow[8] ?? ''));

                // Notify union of new and previous departments
                $allAssigned = array_unique(array_filter(array_merge(
                    !empty($currentRow[23]) ? array_map('trim', explode(',', $currentRow[23])) : [],
                    !empty($newAssigned) ? array_map('trim', explode(',', $newAssigned)) : []
                )));
                $allTagged = array_unique(array_filter(array_merge(
                    !empty($currentRow[21]) ? array_map('trim', explode(',', $currentRow[21])) : [],
                    !empty($newTagged) ? array_map('trim', explode(',', $newTagged)) : []
                )));

                $assignedDisplayStr = !empty($newAssigned) ? "\n*Assigned:* {$newAssigned}" : (!empty($currentRow[23]) ? "\n*Assigned:* {$currentRow[23]}" : '');
                $taggedDisplayStr   = !empty($newTagged) ? "\n*Tagged:* {$newTagged}" : (!empty($currentRow[21]) ? "\n*Tagged:* {$currentRow[21]}" : '');

                $headerPrefix = $isRevert 
                    ? "🔄 ↩️ *ISSUE PROGRESS ROLLBACK / REVERTED!*" 
                    : "✏️ *Issue Edited / Updated!*";

                $statusNotice = ($newStatus !== $oldStatus)
                    ? "\n*Status Transition:* " . strtoupper($oldStatus) . " ➔ *" . strtoupper($newStatus) . "*" . ($statusReason ? "\n*Reason:* {$statusReason}" : "")
                    : "\n*Status:* " . strtoupper($newStatus);

                $this->notifyWhatsApp([
                    'message' => "{$headerPrefix}\n*ID:* {$currentRow[0]}\n*Title:* " . ($newTitle ?? $currentRow[1]) . "\n*Location:* " . ($newLoc ?? $currentRow[3]) . "{$originStr}{$assignedDisplayStr}{$taggedDisplayStr}{$statusNotice}\n*Category:* " . ($newCat ?? $currentRow[4]) . " | *Priority:* " . ($newPriority ?? $currentRow[16]) . "\n*Updated By:* {$editorName} ({$editorRole}" . ($editorDept ? " - {$editorDept}" : "") . ")\n*Modifications / Notes:*\n• {$changeSummaryStr}\n*Link:* " . url('/dashboard'),
                    'imageUrl' => $resolvedImg,
                    'department' => $originDept,
                    'assignedDepartments' => implode(', ', $allAssigned),
                    'taggedDepartments' => implode(', ', $allTagged),
                    'priority' => $newPriority ?? $currentRow[16] ?? 'low',
                ]);

                if ($newStatus !== $oldStatus) {
                    $this->notifyIssueProgress(
                        $originDept,
                        "Status Isu Diperbarui: " . ($newTitle ?? $currentRow[1]),
                        "Status berubah dari " . strtoupper($oldStatus) . " menjadi " . strtoupper($newStatus) . " oleh {$editorName}.",
                        $currentRow[0]
                    );
                }

            return response()->json([
                'success' => true,
                'message' => 'Issue updated successfully!',
                'data'    => [
                    'title'               => $newTitle ?? ($currentRow[1] ?? ''),
                    'description'         => $newDesc ?? ($currentRow[2] ?? ''),
                    'location'            => $newLoc ?? ($currentRow[3] ?? ''),
                    'category'            => $newCat ?? ($currentRow[4] ?? ''),
                    'status'              => $newStatus,
                    'priority'            => $newPriority ?? ($currentRow[16] ?? 'low'),
                    'deadline'            => $newDeadline ?? ($currentRow[17] ?? ''),
                    'imageUrl'            => $this->resolveImageUrl($imageUrl ?? ($currentRow[8] ?? '')),
                    'assignedDepartments' => !empty($newAssigned) ? array_map('trim', explode(',', $newAssigned)) : (!empty($currentRow[23]) ? array_map('trim', explode(',', $currentRow[23])) : []),
                    'taggedDepartments'   => !empty($newTagged) ? array_map('trim', explode(',', $newTagged)) : (!empty($currentRow[21]) ? array_map('trim', explode(',', $currentRow[21])) : []),
                    'editLogs'            => $existingLogs,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update issue: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function destroy(Request $request, $idOrRowIndex)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        if (!$user->isAdmin()) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Hanya Administrator yang memiliki hak akses untuk mengarsipkan isu.',
            ], 403);
        }

        try {
            $issueData = $this->getLatestIssueRowData((string)$idOrRowIndex);
            if (!$issueData) {
                return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
            }

            $currentRow = $issueData['row'];
            $originDept = $currentRow[22] ?? '';

            $deletedId    = $currentRow[0] ?? (string)$idOrRowIndex;
            $deletedTitle = $currentRow[1] ?? '';
            $deletedLoc   = $currentRow[3] ?? '';
            $assignedDepts= $currentRow[23] ?? ($currentRow[21] ?? '');
            $taggedDepts  = $currentRow[21] ?? '';

            $adminName = $user->staff_name ?: ($user->name ?: 'Admin');
            $targetSheet = $issueData['foundLocation']['sheet'] ?? null;
            $nowFormatted = Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');
            $archiveNote = "[{$nowFormatted}] {$adminName}: Isu diarsipkan oleh Admin";

            // Insert a new version row directly below the latest row to preserve all prior edit history
            $newRow = array_pad($currentRow, 26, '');
            $newRow[24] = $archiveNote;
            $newRow[25] = '0';

            $newRowIndex = $this->googleService->insertRowAfter($issueData['rowIndex'], $newRow, $targetSheet);
            if ($newRowIndex) {
                $this->googleService->colorRowByCategory($newRowIndex, $newRow[4] ?? 'other', $targetSheet);
            }

            // Soft-delete / hide: update Col Z to '0' across ALL row versions of this issue (permanent retention in sheet)
            $allRows = $issueData['allRowIndices'] ?? [$issueData['rowIndex']];
            if ($newRowIndex && !in_array($newRowIndex, $allRows)) {
                $allRows[] = $newRowIndex;
            }
            $this->googleService->batchUpdateColumn($allRows, 'Z', '0', $targetSheet);

            // Dispatch WhatsApp deletion announcement
            $originStr = !empty($originDept) ? "\n*Origin:* {$originDept}" : '';
            $assignedStr = !empty($assignedDepts) ? "\n*Assigned:* {$assignedDepts}" : '';
            $taggedStr   = !empty($taggedDepts) ? "\n*Tagged:* {$taggedDepts}" : '';

            $this->notifyWhatsApp([
                'message' => "📢 🗑️ *ISSUE ARCHIVED / ANNOUNCEMENT*\n*ID:* {$deletedId}\n*Title:* {$deletedTitle}\n*Location:* {$deletedLoc}{$originStr}{$assignedStr}{$taggedStr}\n*Archived By Admin:* {$adminName}\n*Status:* Archived (Hidden from Operational Dashboard)",
                'department' => $originDept,
                'assignedDepartments' => $assignedDepts,
                'taggedDepartments' => $taggedDepts,
            ]);

            return response()->json([
                'success' => true,
                'message' => "Issue {$deletedId} archived successfully.",
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to archive issue: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function restore(Request $request, $idOrRowIndex)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        if (!$user->isAdmin()) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Hanya Administrator yang memiliki hak akses untuk memulihkan isu.',
            ], 403);
        }

        try {
            $issueData = $this->getLatestIssueRowData((string)$idOrRowIndex);
            if (!$issueData) {
                return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
            }

            $currentRow = $issueData['row'];
            $adminName = $user->staff_name ?: ($user->name ?: 'Admin');
            $targetSheet = $issueData['foundLocation']['sheet'] ?? null;
            
            $nowFormatted = Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');
            $restoreNote = "[{$nowFormatted}] {$adminName}: Isu dipulihkan oleh Admin";

            // Insert a new version row directly below the latest row to preserve all prior edit history
            $newRow = array_pad($currentRow, 26, '');
            $newRow[24] = $restoreNote;
            $newRow[25] = '1';

            $newRowIndex = $this->googleService->insertRowAfter($issueData['rowIndex'], $newRow, $targetSheet);
            if ($newRowIndex) {
                $this->googleService->colorRowByCategory($newRowIndex, $newRow[4] ?? 'other', $targetSheet);
            }

            // Restore to active: update Col Z to '1' across ALL row versions of this issue
            $allRows = $issueData['allRowIndices'] ?? [$issueData['rowIndex']];
            if ($newRowIndex && !in_array($newRowIndex, $allRows)) {
                $allRows[] = $newRowIndex;
            }
            $this->googleService->batchUpdateColumn($allRows, 'Z', '1', $targetSheet);

            $originDept = $currentRow[22] ?? '';
            $assignedDepts = $currentRow[23] ?? ($currentRow[21] ?? '');
            $taggedDepts = $currentRow[21] ?? '';
            $originStr = !empty($originDept) ? "\n*Origin:* {$originDept}" : '';

            $this->notifyWhatsApp([
                'message' => "♻️ *ISSUE RESTORED FROM ARCHIVE*\n*ID:* {$currentRow[0]}\n*Title:* {$currentRow[1]}\n*Location:* {$currentRow[3]}{$originStr}\n*Restored By Admin:* {$adminName}\n*Status:* " . strtoupper($currentRow[5]),
                'department' => $originDept,
                'assignedDepartments' => $assignedDepts,
                'taggedDepartments' => $taggedDepts,
            ]);

            return response()->json([
                'success' => true,
                'message' => "Issue {$currentRow[0]} restored successfully.",
                'data'    => [
                    'id'     => $currentRow[0],
                    'status' => $currentRow[5],
                ]
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to restore issue: ' . $e->getMessage(),
            ], 500);
        }
    }
}

