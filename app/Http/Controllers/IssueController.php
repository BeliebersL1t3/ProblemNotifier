<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\DashboardNotification;
use App\Services\GoogleService;
use App\Services\IssueSheetRepository;
use App\Services\TicketNotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
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
            Http::withHeaders([
                'X-Bot-Key' => config('services.bot.api_key'),
            ])->connectTimeout(1)->timeout(1)->post('http://localhost:3000/notify', $payload);
        } catch (\Throwable $e) {
            // Non-blocking: ignore if bot is offline
        }
    }

    /**
     * Formats any deadline representation (timestamp ms, string date, etc.) into readable 'Y-m-d H:i:s' in Asia/Jakarta.
     */
    private function formatDeadlineToReadable(?string $rawDeadline): string
    {
        if (empty($rawDeadline)) {
            return '';
        }
        $rawDeadline = trim($rawDeadline);
        if ($rawDeadline === 'undefined' || $rawDeadline === 'null') {
            return '';
        }
        // Numeric epoch timestamp
        if (is_numeric($rawDeadline)) {
            $timestamp = (float)$rawDeadline;
            if ($timestamp < 10000000000) {
                $timestamp *= 1000;
            }
            try {
                return \Carbon\Carbon::createFromTimestampMs($timestamp, 'Asia/Jakarta')->format('Y-m-d H:i:s');
            } catch (\Throwable $e) {
                return $rawDeadline;
            }
        }
        // Date string
        try {
            return \Carbon\Carbon::parse($rawDeadline, 'Asia/Jakarta')->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            return $rawDeadline;
        }
    }

    /**
     * Parses any deadline string/number into numeric millisecond timestamp.
     */
    private function parseDeadlineToTimestampMs(?string $rawDeadline): ?float
    {
        if (empty($rawDeadline)) {
            return null;
        }
        $rawDeadline = trim($rawDeadline);
        if ($rawDeadline === 'undefined' || $rawDeadline === 'null') {
            return null;
        }
        if (is_numeric($rawDeadline)) {
            $timestamp = (float)$rawDeadline;
            if ($timestamp < 10000000000) {
                $timestamp *= 1000;
            }
            return $timestamp > 0 ? $timestamp : null;
        }
        try {
            return (float)(\Carbon\Carbon::parse($rawDeadline, 'Asia/Jakarta')->timestamp * 1000);
        } catch (\Throwable $e) {
            return null;
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
                'link' => $issueId ? "/dashboard?issue={$issueId}" : null,
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

    private function computeDescriptionHistory(array $versions, bool $isAdmin): array
    {
        $descriptionHistory = [];
        $seenDescriptions = [];

        foreach ($versions as $vItem) {
            $vRow = $vItem['row'] ?? $vItem;
            $desc = trim($vRow[2] ?? '');
            if (empty($desc) || $desc === 'undefined') {
                continue;
            }

            if (empty($seenDescriptions) || end($seenDescriptions) !== $desc) {
                $seenDescriptions[] = $desc;
                $note = trim($vRow[24] ?? '');
                $date = trim($vRow[7] ?? '');
                $editor = $vRow[6] ?? 'Pelapor';

                if (count($seenDescriptions) > 1) {
                    if (preg_match('/^\[(.*?)\]\s*([^:]+):/s', $note, $m)) {
                        $date = trim($m[1]);
                        $editor = trim($m[2]);
                    } else if (!empty($note)) {
                        $editor = 'Admin';
                    }
                }

                $descriptionHistory[] = [
                    'version'     => count($seenDescriptions),
                    'description' => $desc,
                    'editedAt'    => $date ?: null,
                    'by'          => $editor,
                    'isOriginal'  => (count($seenDescriptions) === 1),
                ];
            }
        }

        $editCount = max(0, count($descriptionHistory) - 1);
        $canEditDescription = ($editCount < 2 && $isAdmin);

        return [
            'history'            => $descriptionHistory,
            'editCount'          => $editCount,
            'canEditDescription' => $canEditDescription,
        ];
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

        $assignedList = IssueSheetRepository::getAssignedDepartments($currentRow);
        $assignedListUpper = array_map('strtoupper', $assignedList);
        if (empty($assignedList) || in_array('ALL', $assignedListUpper)) {
            return true;
        }

        $originDept = $currentRow[IssueSheetRepository::COL_ORIGIN_DEPT] ?? '';
        $userSubdiv = $user->subdivision ?? '';

        $assignedNorm = array_map(fn($d) => IssueSheetRepository::normalizeDeptKey($d), $assignedList);
        $userDeptNorm = IssueSheetRepository::normalizeDeptKey($userDept);
        $userSubdivNorm = !empty($userSubdiv) ? IssueSheetRepository::normalizeDeptKey($userSubdiv) : '';
        $originNorm = !empty($originDept) ? IssueSheetRepository::normalizeDeptKey($originDept) : '';

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
        if (!$authUser || ! $authUser->isAdmin()) {
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
        if (!$authUser || ! $authUser->isAdmin()) {
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
            'row'            => IssueSheetRepository::padRow($currentRow),
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

            $user = $request->user();
            $isAdmin = $user && $user->isAdmin();
            $isBot = ($request->header('X-Bot-Key') === config('services.bot.api_key'));

            if ($showArchived) {
                if (!$user || !$isAdmin) {
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

            $userDirectory = \App\Models\User::all(['id', 'name', 'staff_name', 'department', 'subdivision', 'email'])
                ->sortBy(function ($u) {
                    return $u->is_dummy_email ? 1 : 0;
                });

            $issues = [];

            foreach ($sheetsToFetch as $currentSheet) {
                $this->googleService->setSheet($currentSheet);
                $rows = $this->googleService->getRows($forceRefresh);

                // Group all rows by Issue ID to support versioned append-only rows
                $grouped = [];
                foreach ($rows as $index => $row) {
                    $id = IssueSheetRepository::getId($row);
                    if (empty($id)) {
                        continue;
                    }
                    $grouped[$id][] = [
                        'row'      => IssueSheetRepository::padRow($row),
                        'rowIndex' => $index + 2,
                    ];
                }

                foreach ($grouped as $id => $versions) {
                    $latestItem = end($versions);
                    $latestRow = $latestItem['row'];
                    $latestRowIndex = $latestItem['rowIndex'];

                    $isArchived = IssueSheetRepository::isArchived($latestRow);

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
                        if (str_contains($cleanChanges, '[LATE_SEND]') || str_contains($lower, 'terlambat terkirim') || str_contains($lower, 'laporan susulan') || str_contains($lower, 'antrean offline')) {
                            $type = 'late_upload';
                        } else if (str_contains($lower, 'klaim') || str_contains($lower, 'claim') || str_contains($lower, 'diambil')) {
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

                    $isLateUpload = false;
                    $lateDuration = null;
                    $uploadedAt = null;

                    foreach ($editLogs as $log) {
                        if (($log['type'] ?? '') === 'late_upload' || str_contains($log['changes'] ?? '', '[LATE_SEND]')) {
                            $isLateUpload = true;
                            $uploadedAt = $log['date'] ?? null;
                            if (preg_match('/\(\+([^\)]+?)\s+tertunda/i', $log['changes'] ?? '', $durMatches)) {
                                $lateDuration = trim($durMatches[1]);
                            }
                            break;
                        }
                    }

                    $rawTaker = $latestRow[9] ?? null;
                    $takerCurrentDept = null;
                    $takerHasTransferred = false;

                    if (!empty($rawTaker)) {
                        $takerClean = trim(preg_replace('/\s*via\s+WhatsApp/i', '', $rawTaker));
                        $takerBase = trim(preg_replace('/\s*\([^)]*\)/', '', $takerClean));

                        $matchedUser = $userDirectory->first(function ($u) use ($takerBase) {
                            $uName = trim($u->name ?? '');
                            $uStaff = trim($u->staff_name ?? '');
                            return (!empty($uName) && (strcasecmp($uName, $takerBase) === 0 || stripos($takerBase, $uName) !== false || stripos($uName, $takerBase) !== false))
                                || (!empty($uStaff) && (strcasecmp($uStaff, $takerBase) === 0 || stripos($takerBase, $uStaff) !== false || stripos($uStaff, $takerBase) !== false));
                        });

                        if ($matchedUser && !empty($matchedUser->department)) {
                            $takerCurrentDept = $matchedUser->department;
                            $assignedDepts = !empty($latestRow[23]) 
                                ? array_map('trim', explode(',', $latestRow[23])) 
                                : (!empty($latestRow[21]) ? array_map('trim', explode(',', $latestRow[21])) : []);
                            $taggedDepts = !empty($latestRow[21]) ? array_map('trim', explode(',', $latestRow[21])) : [];
                            $allScopes = array_map('strtolower', array_merge($assignedDepts, $taggedDepts, [$safeDept]));
                            $takerHasTransferred = !in_array(strtolower($takerCurrentDept), $allScopes);
                        }
                    }

                    $isConfidential = IssueSheetRepository::isConfidential($latestRow);

                    // Confidential Issue Security Scope Protection:
                    // Only Admin, Bot, Origin Dept, Assigned Depts, Tagged Depts, or Reporter can view confidential issues.
                    // Other departments (even with can_view_all_departments) are strictly barred.
                    if ($isConfidential && !$isAdmin && !$isBot) {
                        $userDeptKey = !empty($user?->department) ? IssueSheetRepository::normalizeDeptKey($user->department) : '';
                        $originDeptKey = IssueSheetRepository::normalizeDeptKey($safeDept);
                        $assignedList = !empty($latestRow[23]) 
                            ? array_map('trim', explode(',', $latestRow[23])) 
                            : (!empty($latestRow[21]) ? array_map('trim', explode(',', $latestRow[21])) : []);
                        $taggedList = !empty($latestRow[21]) ? array_map('trim', explode(',', $latestRow[21])) : [];
                        
                        $assignedKeys = array_map([IssueSheetRepository::class, 'normalizeDeptKey'], $assignedList);
                        $taggedKeys = array_map([IssueSheetRepository::class, 'normalizeDeptKey'], $taggedList);

                        $isReporter = false;
                        if ($user) {
                            $userName = strtolower(trim($user->name ?? ''));
                            $userStaff = strtolower(trim($user->staff_name ?? ''));
                            $rep = strtolower(trim($latestRow[6] ?? ''));
                            if (!empty($rep) && (($userName && (strcasecmp($rep, $userName) === 0 || str_contains($rep, $userName))) || ($userStaff && (strcasecmp($rep, $userStaff) === 0 || str_contains($rep, $userStaff))))) {
                                $isReporter = true;
                            }
                        }

                        $isAuthorized = ($userDeptKey && ($userDeptKey === $originDeptKey || in_array($userDeptKey, $assignedKeys) || in_array($userDeptKey, $taggedKeys))) || $isReporter;

                        if (!$isAuthorized) {
                            continue;
                        }
                    }

                    $descMeta = $this->computeDescriptionHistory($versions, (bool)$isAdmin);

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
                        'taker'          => $rawTaker,
                        'takerCurrentDept' => $takerCurrentDept,
                        'takerHasTransferred' => $takerHasTransferred,
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
                        'isLateUpload'   => $isLateUpload,
                        'lateDuration'   => $lateDuration,
                        'uploadedAt'     => !empty($uploadedAt) ? (strtotime($uploadedAt) ? strtotime($uploadedAt) * 1000 : $uploadedAt) : null,
                        'uploadedAtStr'  => $uploadedAt,
                        'isArchived'     => $isArchived,
                        'archivedAt'     => !empty($archivedAt) ? (strtotime($archivedAt) ? strtotime($archivedAt) * 1000 : $archivedAt) : null,
                        'archivedAtStr'  => $archivedAt,
                        'archivedBy'     => $archivedBy,
                        'archivedRole'   => 'Admin',
                        'isConfidential' => $isConfidential,
                        'descriptionHistory' => $descMeta['history'],
                        'editCount'          => $descMeta['editCount'],
                        'canEditDescription' => $descMeta['canEditDescription'],
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
            $isConfidential = IssueSheetRepository::isConfidential($currentRow);

            $user = $request->user();
            $isAdmin = $user && $user->isAdmin();
            $isBot = ($request->header('X-Bot-Key') === config('services.bot.api_key'));

            if ($isConfidential && !$isAdmin && !$isBot) {
                $userDeptKey = !empty($user?->department) ? IssueSheetRepository::normalizeDeptKey($user->department) : '';
                $originDeptKey = IssueSheetRepository::normalizeDeptKey($currentRow[22] ?? '');
                $assignedList = !empty($currentRow[23]) 
                    ? array_map('trim', explode(',', $currentRow[23])) 
                    : (!empty($currentRow[21]) ? array_map('trim', explode(',', $currentRow[21])) : []);
                $taggedList = !empty($currentRow[21]) ? array_map('trim', explode(',', $currentRow[21])) : [];
                
                $assignedKeys = array_map([IssueSheetRepository::class, 'normalizeDeptKey'], $assignedList);
                $taggedKeys = array_map([IssueSheetRepository::class, 'normalizeDeptKey'], $taggedList);

                $isReporter = false;
                if ($user) {
                    $userName = strtolower(trim($user->name ?? ''));
                    $userStaff = strtolower(trim($user->staff_name ?? ''));
                    $rep = strtolower(trim($currentRow[6] ?? ''));
                    if (!empty($rep) && (($userName && (strcasecmp($rep, $userName) === 0 || str_contains($rep, $userName))) || ($userStaff && (strcasecmp($rep, $userStaff) === 0 || str_contains($rep, $userStaff))))) {
                        $isReporter = true;
                    }
                }

                $isAuthorized = ($userDeptKey && ($userDeptKey === $originDeptKey || in_array($userDeptKey, $assignedKeys) || in_array($userDeptKey, $taggedKeys))) || $isReporter;

                if (!$isAuthorized) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Akses Ditolak: Isu ini bersifat rahasia (Confidential) dan hanya dapat diakses oleh pihak/departemen terkait.',
                    ], 403);
                }
            }

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

            $targetSheet = $issueData['sheet'] ?? $this->resolveSheet(null);
            $this->googleService->setSheet($targetSheet);
            $allRows = $this->googleService->getRows();
            $matchedVersions = [];
            foreach ($allRows as $r) {
                if (($r[0] ?? '') === ($currentRow[0] ?? (string)$queryId)) {
                    $matchedVersions[] = IssueSheetRepository::padRow($r);
                }
            }
            $descMeta = $this->computeDescriptionHistory($matchedVersions, (bool)$isAdmin);

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
                    'isConfidential'      => $isConfidential,
                    'descriptionHistory' => $descMeta['history'],
                    'editCount'          => $descMeta['editCount'],
                    'canEditDescription' => $descMeta['canEditDescription'],
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
        // Enforce authorization for authenticated web users (BOLA protection)
        if (auth()->check()) {
            $user = auth()->user();
            if (!$user->isAdmin() && !$user->hasPermission('can_manage_issues')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized. Anda tidak memiliki izin untuk membuat isu.',
                ], 403);
            }
        }

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
                'is_confidential' => 'nullable',
                'isConfidential'  => 'nullable',
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

            $now = Carbon::now();
            $isOfflineQueued = $request->boolean('isOfflineQueued') || $request->input('isOfflineQueued') === '1' || !empty($request->queuedAt);

            $reportedTime = !empty($request->reportedAt)
                ? Carbon::parse($request->reportedAt)
                : $now;

            $submittedAt = $reportedTime->toIso8601String();

            // Detect late send: explicitly queued offline OR diff between reported time and server receive time >= 5 minutes
            $diffMinutes = max(0, $reportedTime->diffInMinutes($now, false));
            $isLateUpload = $isOfflineQueued || ($diffMinutes >= 5);

            $lateDurationText = '';
            $initialLog = '';

            if ($isLateUpload) {
                if ($diffMinutes >= 60) {
                    $hours = floor($diffMinutes / 60);
                    $remMins = $diffMinutes % 60;
                    $lateDurationText = $remMins > 0 ? "{$hours} jam {$remMins} menit" : "{$hours} jam";
                } else {
                    $lateDurationText = max(1, $diffMinutes) . " menit";
                }
                $initialLog = "[" . $now->format('M d, Y H:i:s') . "] Sistem: [LATE_SEND] Laporan susulan / terlambat terkirim (+{$lateDurationText} tertunda di antrean offline karena kehilangan sinyal Wi-Fi)";
            }

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

            $isConfidential = !$isEmergency && ($request->boolean('is_confidential') || $request->boolean('isConfidential') || $request->input('is_confidential') === '1' || $request->input('is_confidential') === 1);

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
                $this->formatDeadlineToReadable($request->deadline ?? ''),
                '', // 18 pendingReason
                '', // 19 pendingBy
                '', // 20 pendingImageUrl
                $taggedDeptsStr, // 21 tagged_departments (info only)
                $dept ?: ($isEmergency ? 'Emergency' : 'General'), // 22 origin_department
                $assignedDeptsStr, // 23 assigned_department (responsible to fix)
                $initialLog, // 24 Edit History (Column Y: stores late send note if applicable)
                '1', // 25 Display Status (Column Z: 1 = active)
                $isConfidential ? '1' : '0', // 26 is_confidential (Column AA)
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

                if ($isLateUpload) {
                    $descBlock .= "\n\n⏳ *CATATAN PENGIRIMAN:* Laporan susulan / terlambat terkirim (+{$lateDurationText} tertunda di antrean offline karena kehilangan sinyal Wi-Fi)";
                }

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
                        $deadlineMs = $this->parseDeadlineToTimestampMs($request->deadline);
                        if ($deadlineMs) {
                            $minutes = round(($deadlineMs - (now()->timestamp * 1000)) / 60000);
                            if ($minutes <= 0) {
                                $priorityStr .= " *(DEADLINE: NOW)*";
                            } else {
                                $priorityStr .= " *(DEADLINE: {$minutes}m)*";
                            }
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

                $lateNotice = $isLateUpload 
                    ? "\n⏳ *Catatan:* Laporan susulan / terlambat terkirim (+{$lateDurationText} tertunda di antrean offline karena kehilangan sinyal Wi-Fi)" 
                    : "";

                $catName = ucwords(str_replace('-', ' ', $request->category ?? 'General'));
                $confidentialPrefix = $isConfidential ? "🔒 *[ISU RAHASIA / CONFIDENTIAL]*\n" : "";

                $message = "{$confidentialPrefix}📋 *New Issue Submitted!*{$priorityStr}\n\n"
                    . "*Title:* {$request->title}\n"
                    . "*Location:* {$request->location}\n"
                    . "*Category:* {$catName}\n"
                    . "*Origin:* {$originName}"
                    . "{$assignedStr}"
                    . "{$taggedStr}\n"
                    . "*Reporter:* {$request->reporter}"
                    . "{$lateNotice}"
                    . "{$descBlock}\n\n"
                    . "*ID:* {$id}";
            }

            $this->notifyWhatsApp([
                'message' => $message,
                'imageUrl' => $resolvedImageUrl,
                'assignedDepartments' => $assignedDeptsStr,
                'taggedDepartments' => $taggedDeptsStr,
                'department' => $originName,
                'priority' => $request->priority ?? 'low',
                'isConfidential' => $isConfidential,
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
                    'isConfidential' => $isConfidential,
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
            // Strict IDOR prevention: authenticated users cannot spoof department via input parameter
            $claimantDept = ($authUser && !empty($authUser->department)) ? $authUser->department : ($request->input('department') ?? '');
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
            $currentRow = IssueSheetRepository::padRow($currentRow);
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
            if ($authUser && !$this->isAuthorizedToModifyIssue($authUser, $currentRow)) {
                $userDept = $authUser->department ?? 'lain';
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
            $currentRow = IssueSheetRepository::padRow($currentRow);
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
            if ($authUser && !$this->isAuthorizedToModifyIssue($authUser, $currentRow)) {
                $userDept = $authUser->department ?? 'lain';
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
            $currentRow = IssueSheetRepository::padRow($currentRow);
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

            $newRow = IssueSheetRepository::padRow($currentRow);
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

        if (!$user->isAdmin()) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Pengeditan isu hanya dapat dilakukan oleh Administrator.',
            ], 403);
        }

        try {
            $request->validate([
                'description' => 'required|string|min:3',
            ]);
        } catch (ValidationException $ve) {
            $firstError = collect($ve->errors())->flatten()->first();
            return response()->json([
                'success' => false,
                'message' => $firstError ?: 'Deskripsi tidak boleh kosong (minimal 3 karakter).',
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

            $targetSheet = $issueData['sheet'] ?? $this->resolveSheet(null);
            $this->googleService->setSheet($targetSheet);
            $allRows = $this->googleService->getRows();
            $matchedId = $currentRow[0] ?? (string)$idOrRowIndex;

            $matchedVersions = [];
            foreach ($allRows as $r) {
                if (($r[0] ?? '') === $matchedId) {
                    $matchedVersions[] = IssueSheetRepository::padRow($r);
                }
            }

            $descMeta = $this->computeDescriptionHistory($matchedVersions, true);
            $currentEditCount = $descMeta['editCount'];

            if ($currentEditCount >= 2) {
                return response()->json([
                    'success' => false,
                    'message' => 'Batas maksimum edit isu (2 kali) telah tercapai untuk tiket ini.',
                    'editCount' => $currentEditCount,
                    'canEditDescription' => false,
                ], 422);
            }

            $rawDesc = trim($request->input('description', ''));
            $formattedDesc = self::formatParagraphText($rawDesc);
            $oldDesc = trim($currentRow[2] ?? '');

            if ($formattedDesc === $oldDesc) {
                return response()->json([
                    'success' => true,
                    'message' => 'Tidak ada perubahan pada deskripsi isu.',
                    'data'    => [
                        'id'                  => $currentRow[0],
                        'description'         => $oldDesc,
                        'editCount'           => $currentEditCount,
                        'canEditDescription'  => ($currentEditCount < 2),
                        'descriptionHistory'  => $descMeta['history'],
                    ],
                ]);
            }

            $nextEditNum = $currentEditCount + 1;
            $editorName = $user->staff_name ?? $user->name ?? 'Admin';
            $nowFormatted = Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');

            $newRow = IssueSheetRepository::padRow($currentRow);
            $newRow[2]  = $formattedDesc; // Column C: Description
            $newRow[24] = "[{$nowFormatted}] {$editorName}: Edit Deskripsi (Ke-{$nextEditNum}/2)\n[Awal] {$oldDesc}\n[Revisi] {$formattedDesc}"; // Column Y: Edit log note
            $newRow[25] = '1'; // Column Z: Active

            $newRowIndex = $this->googleService->insertRowAfter($issueData['rowIndex'], $newRow, $targetSheet);
            if ($newRowIndex) {
                $this->googleService->colorRowByCategory($newRowIndex, $newRow[4] ?? 'other', $targetSheet);
            }

            // Target departemen:
            // Column W (index 22): origin department
            // Column X (index 23): assigned departments
            // Column V (index 21): tagged departments
            $originDept = trim($currentRow[22] ?? '');
            $assignedDepts = trim($currentRow[23] ?? '');
            $taggedDepts = trim($currentRow[21] ?? '');

            $issueId = $currentRow[0] ?? '';
            $issueTitle = $currentRow[1] ?? 'Tanpa Judul';
            $issueLocation = $currentRow[3] ?? '-';
            $issueCategory = $currentRow[4] ?? '-';
            $issuePriority = $currentRow[16] ?? 'low';

            $comparisonMsg = "✏️ *Deskripsi Isu Diperbarui oleh Admin!*\n"
                . "━━━━━━━━━━━━━━━━━━━━\n"
                . "📌 *ID:* {$issueId}\n"
                . "📋 *Judul:* {$issueTitle}\n"
                . "📍 *Lokasi:* {$issueLocation}\n"
                . "🏷️ *Kategori:* {$issueCategory}\n"
                . "👤 *Admin Pengedit:* {$editorName}\n"
                . "🔢 *Riwayat Editan:* Ke-{$nextEditNum} dari 2\n"
                . "━━━━━━━━━━━━━━━━━━━━\n"
                . "📝 *Deskripsi Sebelumnya:*\n"
                . "_{$oldDesc}_\n\n"
                . "✨ *Deskripsi Terbaru:*\n"
                . "{$formattedDesc}\n"
                . "━━━━━━━━━━━━━━━━━━━━\n"
                . "🔗 *Buka Dashboard:* " . url('/dashboard');

            // Dispatch WhatsApp Notification (Khusus departemen terkait, bypass channel publik & grup general)
            $this->notifyWhatsApp([
                'message'             => $comparisonMsg,
                'imageUrl'            => $this->resolveImageUrl($currentRow[8] ?? ''),
                'department'          => $originDept,
                'assignedDepartments' => $assignedDepts,
                'taggedDepartments'   => $taggedDepts,
                'priority'            => $issuePriority,
                'departmentOnly'      => true,
            ]);

            $updatedHistory = array_merge($descMeta['history'], [[
                'version'     => count($descMeta['history']) + 1,
                'description' => $formattedDesc,
                'editedAt'    => $nowFormatted,
                'by'          => $editorName,
                'isOriginal'  => false,
            ]]);

            return response()->json([
                'success' => true,
                'message' => "Deskripsi isu berhasil diperbarui (Editan ke-{$nextEditNum}/2).",
                'data'    => [
                    'id'                  => $currentRow[0],
                    'description'         => $formattedDesc,
                    'editCount'           => $nextEditNum,
                    'canEditDescription'  => ($nextEditNum < 2),
                    'descriptionHistory'  => $updatedHistory,
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
                'message' => 'Unauthorized. Hanya Administrator yang memiliki hak akses untuk menghapus isu.',
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
            $archiveNote = "[{$nowFormatted}] {$adminName}: Isu dihapus oleh Admin";

            // Insert a new version row directly below the latest row to preserve all prior edit history
            $newRow = IssueSheetRepository::padRow($currentRow);
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
                'message' => "📢 🗑️ *ISSUE DELETED / ANNOUNCEMENT*\n*ID:* {$deletedId}\n*Title:* {$deletedTitle}\n*Location:* {$deletedLoc}{$originStr}{$assignedStr}{$taggedStr}\n*Deleted By Admin:* {$adminName}\n*Status:* Deleted (Display Status: 0 in Spreadsheet)",
                'department' => $originDept,
                'assignedDepartments' => $assignedDepts,
                'taggedDepartments' => $taggedDepts,
            ]);

            return response()->json([
                'success' => true,
                'message' => "Issue {$deletedId} deleted successfully.",
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete issue: ' . $e->getMessage(),
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
            $newRow = IssueSheetRepository::padRow($currentRow);
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

    /**
     * Notify Reporter and HODs when an assigned department has no active staff to work on the issue.
     */
    public function notifyEmptyDepartment(Request $request, $rowIndex)
    {
        $validated = $request->validate([
            'department' => 'required|string',
        ]);

        $targetDept = trim($validated['department']);

        try {
            $issueData = $this->getLatestIssueRowData((string)$rowIndex);
            if (!$issueData) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
            }

            $currentRow = $issueData['row'];
            $issueId = $currentRow[0] ?? $rowIndex;
            $title = $currentRow[1] ?? 'Isu';
            $location = $currentRow[3] ?? '-';
            $originDept = trim($currentRow[IssueSheetRepository::COL_ORIGIN_DEPT] ?? '');

            $notifiedTargets = [];

            // 1. In-app notification to the reporter's origin department
            if (!empty($originDept)) {
                $this->notifyIssueProgress(
                    $originDept,
                    "⚠️ Dept {$targetDept} Kosong — Tiket #{$issueId}",
                    "Tiket #{$issueId} ('{$title}') tidak dapat diproses karena Departemen {$targetDept} saat ini tidak memiliki staf aktif. Harap alihkan penugasan.",
                    $issueId
                );
                $notifiedTargets[] = "Dept {$originDept}";
            }

            // 2. In-app notification & direct WhatsApp to HODs of the origin department
            if (!empty($originDept)) {
                $originHods = User::where('department', $originDept)
                    ->where('is_hod', true)
                    ->where('is_active', true)
                    ->get();

                foreach ($originHods as $hod) {
                    DashboardNotification::create([
                        'user_id'     => $hod->id,
                        'department'  => $originDept,
                        'role_target' => 'hod',
                        'type'        => 'issue_empty_department',
                        'title'       => "⚠️ Dept {$targetDept} Kosong — Tiket #{$issueId}",
                        'message'     => "Tiket #{$issueId} ('{$title}') di {$location} terhenti karena Departemen {$targetDept} tidak memiliki staf aktif. Mohon edit tiket untuk mengalihkan departemen.",
                        'link'        => "/dashboard?issue={$issueId}",
                        'is_read'     => false,
                    ]);

                    if ($hod->whatsapp_number) {
                        $waMsg = "⚠️ *Peringatan Penugasan Tiket Telunas*\n\n"
                            . "*Tiket:* #{$issueId} - {$title}\n"
                            . "*Lokasi:* {$location}\n"
                            . "*Kendala:* Departemen *{$targetDept}* yang ditugaskan saat ini *tidak memiliki staf aktif*.\n\n"
                            . "Mohon buka sistem dan alihkan penugasan ke departemen lain melalui menu *Edit Isu*.";

                        TicketNotificationService::sendWhatsApp($hod->whatsapp_number, $waMsg);
                        $notifiedTargets[] = "HOD {$hod->name}";
                    }
                }
            }

            // 3. General WhatsApp group notification broadcast
            $this->notifyWhatsApp([
                'message' => "⚠️ *Peringatan Penugasan Tiket!*\n*Tiket:* #{$issueId} - {$title}\n*Lokasi:* {$location}\n*Kendala:* Departemen *{$targetDept}* saat ini tidak memiliki staf aktif terdaftar.\n*Tindakan:* Mohon pembuat isu atau HoD mengalihkan penugasan.",
                'department' => $originDept,
            ]);

            return response()->json([
                'success' => true,
                'message' => "Peringatan berhasil dikirim kepada Pembuat Isu" . (!empty($originDept) ? " ({$originDept})" : '') . " dan HoD terkait.",
                'notified_targets' => array_values(array_unique($notifiedTargets)),
            ]);
        } catch (\Throwable $e) {
            Log::error("notifyEmptyDepartment failed: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Gagal mengirim notifikasi: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function getBotStatus()
    {
        $port = env('BOT_PORT', 3000);
        foreach (["http://127.0.0.1:{$port}/status", "http://localhost:{$port}/status"] as $url) {
            try {
                $response = \Illuminate\Support\Facades\Http::timeout(2.0)->get($url);
                if ($response->successful()) {
                    $data = $response->json();
                    if (!empty($data['phone'])) {
                        $clean = preg_replace('/[^0-9]/', '', (string)$data['phone']);
                        $data['wa_url'] = "https://wa.me/{$clean}";
                    } else {
                        $data['wa_url'] = null;
                    }
                    return response()->json($data);
                }
            } catch (\Throwable $e) {
                // Try next url
            }
        }
        return response()->json(['connected' => false, 'status' => 'offline', 'wa_url' => null], 200);
    }

    public function startBot(Request $request)
    {
        $user = $request->user();
        if (!$user || (method_exists($user, 'isAdmin') && !$user->isAdmin() && $user->role !== 'admin')) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat menyalakan bot.'], 403);
        }

        $port = env('BOT_PORT', 3000);
        // Check if bot is already responding
        try {
            $check = \Illuminate\Support\Facades\Http::timeout(1.0)->get("http://127.0.0.1:{$port}/status");
            if ($check->successful()) {
                return response()->json(['success' => true, 'message' => 'Bot sudah aktif dan berjalan.']);
            }
        } catch (\Throwable $e) {}

        $botDir = base_path('whatsapp-bot');
        $logFile = $botDir . DIRECTORY_SEPARATOR . 'bot_runtime.log';

        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            // Windows detached background launch
            $cmd = "start /B cmd /C \"cd /D " . escapeshellarg($botDir) . " && node bot.js >> " . escapeshellarg($logFile) . " 2>&1\"";
            pclose(popen($cmd, "r"));
        } else {
            // Linux/macOS detached background launch
            $cmd = "cd " . escapeshellarg($botDir) . " && node bot.js >> " . escapeshellarg($logFile) . " 2>&1 &";
            exec($cmd);
        }

        return response()->json([
            'success' => true,
            'message' => 'Perintah menyalakan bot berhasil dikirim. Bot sedang booting di background.'
        ]);
    }

    public function stopBot(Request $request)
    {
        $user = $request->user();
        if (!$user || (method_exists($user, 'isAdmin') && !$user->isAdmin() && $user->role !== 'admin')) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat mematikan bot.'], 403);
        }

        $port = env('BOT_PORT', 3000);
        $apiKey = env('BOT_API_KEY', '');

        // 1. Try graceful shutdown via HTTP
        try {
            \Illuminate\Support\Facades\Http::timeout(2.0)
                ->withHeaders(['X-Bot-Key' => $apiKey])
                ->post("http://127.0.0.1:{$port}/shutdown");
        } catch (\Throwable $e) {}

        // 2. Fallback: Force kill process listening on port 3000 if still active
        usleep(500000); // 0.5s wait
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            $out = @shell_exec("netstat -ano | findstr :{$port}");
            if ($out) {
                $lines = explode("\n", trim($out));
                foreach ($lines as $line) {
                    if (preg_match('/LISTENING\s+(\d+)/i', $line, $m)) {
                        $pid = $m[1];
                        @shell_exec("taskkill /F /PID {$pid}");
                    }
                }
            }
        } else {
            @shell_exec("fuser -k {$port}/tcp");
        }

        return response()->json([
            'success' => true,
            'message' => 'Bot berhasil dimatikan.'
        ]);
    }

    public function restartBot(Request $request)
    {
        $this->stopBot($request);
        sleep(2);
        return $this->startBot($request);
    }

    public function getBotLogs(Request $request)
    {
        $user = $request->user();
        if (!$user || (method_exists($user, 'isAdmin') && !$user->isAdmin() && $user->role !== 'admin')) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat melihat log bot.'], 403);
        }

        $botDir = base_path('whatsapp-bot');
        $logFile = $botDir . DIRECTORY_SEPARATOR . 'bot_runtime.log';

        if (!file_exists($logFile)) {
            return response()->json(['success' => true, 'logs' => ['Belum ada log runtime yang tercatat.']]);
        }

        $content = @file_get_contents($logFile);
        if (!$content) {
            return response()->json(['success' => true, 'logs' => []]);
        }

        $lines = explode("\n", trim($content));
        $recent = array_slice($lines, -40);

        return response()->json(['success' => true, 'logs' => $recent]);
    }

    public function getBotAuthState(Request $request)
    {
        $user = $request->user();
        if (!$user || (method_exists($user, 'isAdmin') && !$user->isAdmin() && $user->role !== 'admin')) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat memeriksa state otentikasi bot.'], 403);
        }

        $port = env('BOT_PORT', 3000);
        $apiKey = env('BOT_API_KEY', '');

        foreach (["http://127.0.0.1:{$port}/auth-state", "http://localhost:{$port}/auth-state"] as $url) {
            try {
                $response = \Illuminate\Support\Facades\Http::timeout(3.0)
                    ->withHeaders(['X-Bot-Key' => $apiKey])
                    ->get($url);
                if ($response->successful()) {
                    return response()->json($response->json());
                }
            } catch (\Throwable $e) {}
        }

        return response()->json([
            'success' => false,
            'connected' => false,
            'status' => 'offline',
            'phone' => null,
            'qr' => null,
            'pairingCode' => null,
            'message' => 'Bot service offline atau tidak merespons.'
        ], 200);
    }

    public function pairBotPhone(Request $request)
    {
        $user = $request->user();
        if (!$user || (method_exists($user, 'isAdmin') && !$user->isAdmin() && $user->role !== 'admin')) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat menghubungkan nomor bot baru.'], 403);
        }

        $validated = $request->validate([
            'phone' => 'required|string|min:8|max:30',
        ]);

        $port = env('BOT_PORT', 3000);
        $apiKey = env('BOT_API_KEY', '');

        // Auto start bot if not running
        try {
            $check = \Illuminate\Support\Facades\Http::timeout(1.0)->get("http://127.0.0.1:{$port}/status");
            if (!$check->successful()) {
                $this->startBot($request);
                sleep(2);
            }
        } catch (\Throwable $e) {
            $this->startBot($request);
            sleep(2);
        }

        try {
            $response = \Illuminate\Support\Facades\Http::timeout(15.0)
                ->withHeaders(['X-Bot-Key' => $apiKey])
                ->post("http://127.0.0.1:{$port}/request-pairing-code", [
                    'phone' => $validated['phone'],
                ]);

            if ($response->successful()) {
                return response()->json($response->json());
            }

            return response()->json([
                'success' => false,
                'message' => $response->json('error') ?? 'Gagal meminta kode pairing dari bot.'
            ], $response->status());
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal berkomunikasi dengan WhatsApp bot service: ' . $e->getMessage()
            ], 500);
        }
    }

    public function unlinkBot(Request $request)
    {
        $user = $request->user();
        if (!$user || (method_exists($user, 'isAdmin') && !$user->isAdmin() && $user->role !== 'admin')) {
            return response()->json(['success' => false, 'message' => 'Hanya Admin yang dapat memutuskan sesi bot.'], 403);
        }

        $port = env('BOT_PORT', 3000);
        $apiKey = env('BOT_API_KEY', '');

        try {
            $response = \Illuminate\Support\Facades\Http::timeout(10.0)
                ->withHeaders(['X-Bot-Key' => $apiKey])
                ->post("http://127.0.0.1:{$port}/unlink");

            if ($response->successful()) {
                return response()->json($response->json());
            }

            return response()->json([
                'success' => false,
                'message' => $response->json('error') ?? 'Gagal memutuskan sesi bot.'
            ], $response->status());
        } catch (\Throwable $e) {
            // Fallback: manually delete auth_info_baileys and restart bot
            try {
                $botDir = base_path('whatsapp-bot');
                $authDir = $botDir . DIRECTORY_SEPARATOR . 'auth_info_baileys';
                $this->stopBot($request);
                sleep(1);
                if (file_exists($authDir)) {
                    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                        @shell_exec("rmdir /s /q " . escapeshellarg($authDir));
                    } else {
                        @shell_exec("rm -rf " . escapeshellarg($authDir));
                    }
                }
                $this->startBot($request);
                return response()->json([
                    'success' => true,
                    'message' => 'Sesi bot berhasil di-reset secara manual. Bot sedang booting ulang.'
                ]);
            } catch (\Throwable $e2) {
                return response()->json([
                    'success' => false,
                    'message' => 'Gagal me-reset sesi bot: ' . $e2->getMessage()
                ], 500);
            }
        }
    }

    public function getPublicBotContact(Request $request)
    {
        $port = env('BOT_PORT', 3000);
        foreach (["http://127.0.0.1:{$port}/status", "http://localhost:{$port}/status"] as $url) {
            try {
                $response = \Illuminate\Support\Facades\Http::timeout(1.5)->get($url);
                if ($response->successful()) {
                    $json = $response->json();
                    $phone = $json['phone'] ?? null;
                    $clean = $phone ? preg_replace('/[^0-9]/', '', (string)$phone) : null;
                    return response()->json([
                        'success' => true,
                        'connected' => (bool) ($json['connected'] ?? false),
                        'phone' => $phone,
                        'name' => $json['name'] ?? null,
                        'wa_url' => $clean ? "https://wa.me/{$clean}" : null
                    ]);
                }
            } catch (\Throwable $e) {}
        }

        return response()->json([
            'success' => true,
            'connected' => false,
            'phone' => null,
            'name' => null,
            'wa_url' => null
        ]);
    }

    public function markDuplicate(Request $request, $rowIndex)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'master_issue_id' => 'required|string|max:50',
            'note' => 'nullable|string|max:255',
        ]);

        $masterId = trim($validated['master_issue_id']);
        $note = trim($validated['note'] ?? '');

        try {
            $issueData = $this->getLatestIssueRowData((string)$rowIndex);
            if (!$issueData) {
                return response()->json(['success' => false, 'message' => 'Isu tidak ditemukan.'], 404);
            }

            $currentRow = $issueData['row'];
            $sheet = $issueData['sheet'] ?? $this->resolveSheet();
            $issueId = $currentRow[0] ?? $rowIndex;

            if ($masterId === (string)$issueId) {
                return response()->json(['success' => false, 'message' => 'Isu tidak dapat ditandai sebagai duplikat dari dirinya sendiri.'], 422);
            }

            $fixDesc = "Duplikat dari Isu #{$masterId}" . ($note ? " ({$note})" : '');
            $solverName = $user->staff_name ?: $user->name ?: 'Admin';
            $nowStr = Carbon::now('Asia/Jakarta')->format('Y-m-d H:i:s');

            $updatedRow = IssueSheetRepository::padRow($currentRow);
            $updatedRow[5]  = 'solved'; // status
            $updatedRow[11] = $solverName; // solver
            $updatedRow[12] = $nowStr; // solvedAt
            $updatedRow[13] = $fixDesc; // fixDescription

            // Append edit log
            $existingNote = trim($updatedRow[24] ?? '');
            $duplicateLog = "[{$nowStr}] {$solverName}: Ditandai sebagai duplikat dari Isu #{$masterId}";
            $updatedRow[24] = empty($existingNote) ? $duplicateLog : "{$existingNote}\n{$duplicateLog}";

            $this->googleService->setSheet($sheet);
            $this->googleService->appendRow($updatedRow);

            // Audit Log
            try {
                \App\Models\AuditLog::create([
                    'user_id' => $user->id,
                    'user_name' => $user->name,
                    'user_role' => $user->role,
                    'department' => $user->department,
                    'action' => 'MARK_DUPLICATE',
                    'target_type' => 'Issue',
                    'target_id' => $issueId,
                    'description' => "Menandai isu #{$issueId} sebagai duplikat dari isu #{$masterId}",
                    'ip_address' => $request->ip() === '::1' ? '127.0.0.1' : $request->ip(),
                ]);
            } catch (\Throwable $e) {}

            return response()->json([
                'success' => true,
                'message' => "Isu #{$issueId} berhasil ditandai sebagai duplikat dari #{$masterId}.",
            ]);
        } catch (\Throwable $e) {
            Log::error("markDuplicate failed: " . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Gagal menandai duplikat: ' . $e->getMessage()], 500);
        }
    }
}

