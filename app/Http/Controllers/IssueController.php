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

    private function parsePendingTimeline($rawData, $legacyBy = '', $legacyImage = '')
    {
        if (empty($rawData)) {
            return [];
        }

        $decoded = json_decode($rawData, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return array_map(function ($item) {
                if (is_array($item)) {
                    $img = $item['image'] ?? ($item['pendingImageUrl'] ?? '');
                    $item['image'] = $this->resolveImageUrl($img);
                }
                return $item;
            }, $decoded);
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

    public function index(Request $request)
    {
        try {
            $sheetParam = $request->query('sheet');
            $forceRefresh = $request->boolean('refresh') || $request->boolean('sync');

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

                foreach ($rows as $index => $row) {
                    if (empty($row[0])) {
                        continue;
                    }

                    $rowIndex = $index + 2;

                    $issues[] = [
                        'id'             => $row[0],
                        'rowIndex'       => $rowIndex,
                        'sheet'          => $currentSheet,
                        'title'          => $row[1] ?? '',
                        'description'    => $row[2] ?? '',
                        'location'       => $row[3] ?? '',
                        'category'       => $row[4] ?? '',
                        'department'     => $row[22] ?? '', // Origin department
                        'assignedDepartments' => !empty($row[23]) 
                            ? array_map('trim', explode(',', $row[23])) 
                            : (!empty($row[21]) ? array_map('trim', explode(',', $row[21])) : []),
                        'taggedDepartments' => !empty($row[21]) ? array_map('trim', explode(',', $row[21])) : [],
                        'status'         => $row[5] ?? 'open',
                        'reporter'       => $row[6] ?? 'Anonymous',
                        'reportedAt'     => !empty($row[7]) ? strtotime($row[7]) * 1000 : time() * 1000,
                        'reportedAtIso'  => $row[7] ?? '',
                        'imageUrl'       => $this->resolveImageUrl($row[8] ?? ''),
                        'taker'          => $row[9] ?? null,
                        'takenAt'        => !empty($row[10]) ? strtotime($row[10]) * 1000 : null,
                        'solver'         => $row[11] ?? '',
                        'solvedAt'       => $row[12] ?? '',
                        'fixDescription' => $row[13] ?? '',
                        'proofImageUrl'  => $this->resolveImageUrl($row[14] ?? ''),
                        'durationLabel'  => $row[15] ?? '',
                        'priority'       => $row[16] ?? 'low',
                        'deadline'       => $row[17] ?? '',
                        'pendingReason'  => $row[18] ?? '',
                        'pendingTimeline'=> $this->parsePendingTimeline($row[18] ?? '', $row[19] ?? '', $row[20] ?? ''),
                        'pendingBy'      => $row[19] ?? '',
                        'pendingImageUrl'=> $this->resolveImageUrl($row[20] ?? ''),
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
                'Engineer' => 'Eng',
                'Tekong' => 'Tkg',
                'Pest Control' => 'Pst',
                'Security' => 'Scy',
                'Fasilitas' => 'Fas',
                'HK' => 'HK',
                'F&B' => 'FnB',
                'Service' => 'Svc',
                'Bar' => 'Bar',
                'GR' => 'GR',
                'Spa' => 'Spa',
                'TiRek' => 'TRK',
                'OE' => 'OE',
                'IT' => 'IT',
                'Procurement' => 'PRc',
                'Sales/Marketing' => 'Sls',
                'Reservasi'       => 'Res',
                'Finance'         => 'Fin',
                'Legal'           => 'LGL',
                'HR'              => 'HR',
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

            $dateMonth = Carbon::now()->format('dmy'); // e.g. 190826
            
            $id = "{$deptCode}-{$dateMonth}-{$sequentialIndex}";
            
            $imageUrl = '';
            if ($request->hasFile('image')) {
                $imageUrl = $this->googleService->uploadImage($request->file('image'), "{$id}-problem");
            } else if ($request->priority === 'critical' || $isEmergency) {
                // Fallback to urgent placeholder for critical issues without images
                $imageUrl = url('/urgent.png');
            }
            
            $submittedAt = Carbon::now()->toIso8601String();
            $formattedDesc = self::formatParagraphText($request->description);

            $assignedDeptsStr = $isEmergency ? 'ALL' : ($request->assignedDepartments ?? ($request->taggedDepartments ?? ''));
            $taggedDeptsStr   = $isEmergency ? 'ALL' : ($request->taggedDepartments ?? '');

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
            ];

            $rowIndex = $this->googleService->appendRow($newRow);
            if ($rowIndex) {
                $this->googleService->colorRowByCategory($rowIndex, $request->category);
            }

            $resolvedImageUrl = $this->resolveImageUrl($imageUrl);

            $priorityStr = "";
            if ($request->priority === 'critical') {
                $priorityStr = "\n\n🚨 *PRIORITY: CRITICAL* 🚨";
                if (!empty($request->deadline)) {
                    $deadlineMs = (float) $request->deadline;
                    $minutes = round(($deadlineMs - (now()->timestamp * 1000)) / 60000);
                    if ($minutes <= 0) {
                        $priorityStr .= "\n⏱️ *TIME LIMIT: NOW (IMMEDIATE ACTION REQUIRED)*";
                    } else {
                        $priorityStr .= "\n⏱️ *TIME LIMIT: {$minutes} Minutes*";
                    }
                }
                $priorityStr .= "\n";
            }

            // Formatting tags and assignments for WhatsApp Notification
            $assignedStr = '';
            if ($isEmergency || $assignedDeptsStr === 'ALL') {
                $assignedStr = "\n🎯 *Assigned to:* @ALL (ACTION REQUIRED)";
            } else if (!empty($assignedDeptsStr)) {
                $assignedTags = array_map('trim', explode(',', $assignedDeptsStr));
                $assignedStr = "\n🎯 *Assigned to:* " . implode(' ', array_map(fn($t) => "@{$t}", $assignedTags)) . " *(Action Required)*";
            }

            $taggedStr = '';
            if ($isEmergency || $taggedDeptsStr === 'ALL') {
                $taggedStr = "\n📢 *Tagged:* @ALL (Info Only)";
            } else if (!empty($taggedDeptsStr)) {
                $tags = array_map('trim', explode(',', $taggedDeptsStr));
                $taggedStr = "\n📢 *Tagged:* " . implode(' ', array_map(fn($t) => "@{$t}", $tags)) . " *(Info Only)*";
            }

            try {
                $originName = $dept ?: ($isEmergency ? 'Emergency (SOS)' : 'General');
                Http::timeout(3)->post('http://localhost:3000/notify', [
                    'message' => "🚨 *New Issue Submitted!*{$priorityStr}\n*Title:* {$request->title}\n*Location:* {$request->location}\n*Origin:* {$originName}{$assignedStr}{$taggedStr}\n*Category:* {$request->category}\n*Reporter:* {$request->reporter}\n*ID:* {$id}\n*Link:* " . url('/dashboard'),
                    'imageUrl' => $resolvedImageUrl,
                    'assignedDepartments' => $assignedDeptsStr,
                    'taggedDepartments' => $taggedDeptsStr,
                    'department' => $originName,
                    'priority' => $request->priority ?? 'low'
                ]);
            } catch (\Exception $e) {
                // Ignore if bot is offline
            }

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
            // Cross-sheet lookup: find which sheet this issue belongs to
            $crossYear = false;
            $foundLocation = $this->googleService->findIssueAcrossSheets((string)$idOrRowIndex);
            if ($foundLocation) {
                $allSheets = $this->googleService->listSheets();
                $newestSheet = end($allSheets);
                if ($foundLocation['sheet'] !== $newestSheet) {
                    $crossYear = true;
                }
                $this->googleService->setSheet($foundLocation['sheet']);
                $rows = $this->googleService->getRows();
            } else {
                $this->resolveSheet(null);
                $rows = $this->googleService->getRows();
            }
            $targetRowIndex = null;
            $currentRow = null;

            foreach ($rows as $index => $row) {
                $actualRowIndex = $index + 2;
                if (($row[0] ?? '') === (string)$idOrRowIndex || (string)$actualRowIndex === (string)$idOrRowIndex) {
                    $targetRowIndex = $actualRowIndex;
                    $currentRow = $row;
                    break;
                }
            }

            if (!$targetRowIndex || !$currentRow) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
            }

            $currentStatus = $currentRow[5] ?? 'open';

            if ($currentStatus !== 'open') {
                return response()->json([
                    'success' => false,
                    'message' => 'Job already taken or resolved.',
                ], 422);
            }

            $takenAt = Carbon::now()->toIso8601String();

            $this->googleService->updateRow($targetRowIndex, [
                'F' => 'progress',
                'J' => $request->taker,
                'K' => $takenAt,
            ]);

            try {
                $crossYearNotice = $crossYear ? "\n📋 *Note: This issue is from a previous period ({$foundLocation['sheet']}).*" : '';
                Http::timeout(3)->post('http://localhost:3000/notify', [
                    'message' => "👷 *Issue Claimed!*{$crossYearNotice}\n*Title:* {$currentRow[1]}\n*Location:* {$currentRow[3]}\n*Taken by:* {$request->taker}\n*Link:* " . url('/dashboard'),
                ]);
            } catch (\Exception $e) {}

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
            // Cross-sheet lookup
            $crossYear = false;
            $foundLocation = $this->googleService->findIssueAcrossSheets((string)$idOrRowIndex);
            if ($foundLocation) {
                $allSheets = $this->googleService->listSheets();
                $newestSheet = end($allSheets);
                if ($foundLocation['sheet'] !== $newestSheet) {
                    $crossYear = true;
                }
                $this->googleService->setSheet($foundLocation['sheet']);
                $rows = $this->googleService->getRows();
            } else {
                $this->resolveSheet(null);
                $rows = $this->googleService->getRows();
            }
            $targetRowIndex = null;
            $currentRow = null;

            foreach ($rows as $index => $row) {
                $actualRowIndex = $index + 2;
                if (($row[0] ?? '') === (string)$idOrRowIndex || (string)$actualRowIndex === (string)$idOrRowIndex) {
                    $targetRowIndex = $actualRowIndex;
                    $currentRow = $row;
                    break;
                }
            }

            if (!$targetRowIndex || !$currentRow) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
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
                    $diffInHours = round($diffInMinutes / 60);
                    if ($diffInHours < 48) {
                        $durationLabel = "Solved in {$diffInHours} hour" . ($diffInHours == 1 ? '' : 's');
                    } else {
                        $diffInDays = round($diffInHours / 24);
                        $durationLabel = "Solved in {$diffInDays} day" . ($diffInDays == 1 ? '' : 's');
                    }
                }
            }

            $formattedFix = self::formatParagraphText($request->fixDescription);

            $this->googleService->updateRow($targetRowIndex, [
                'F' => 'solved',
                'L' => $request->solver,
                'M' => $solvedAt,
                'N' => $formattedFix,
                'O' => $proofUrl,
                'P' => $durationLabel,
            ]);

            $resolvedProofUrl = $this->resolveImageUrl($proofUrl);

            try {
                Http::timeout(3)->post('http://localhost:3000/notify', [
                    'message' => "✅ *Issue Resolved!*\n*Title:* {$currentRow[1]}\n*Solved by:* {$request->solver}\n*Notes:* {$request->fixDescription}",
                    'imageUrl' => $resolvedProofUrl
                ]);
            } catch (\Exception $e) {}

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
            // Cross-sheet lookup
            $crossYear = false;
            $foundLocation = $this->googleService->findIssueAcrossSheets((string)$idOrRowIndex);
            if ($foundLocation) {
                $allSheets = $this->googleService->listSheets();
                $newestSheet = end($allSheets);
                if ($foundLocation['sheet'] !== $newestSheet) {
                    $crossYear = true;
                }
                $this->googleService->setSheet($foundLocation['sheet']);
                $rows = $this->googleService->getRows();
            } else {
                $this->resolveSheet(null);
                $rows = $this->googleService->getRows();
            }
            $targetRowIndex = null;
            $currentRow = null;

            foreach ($rows as $index => $row) {
                $actualRowIndex = $index + 2;
                if (($row[0] ?? '') === (string)$idOrRowIndex || (string)$actualRowIndex === (string)$idOrRowIndex) {
                    $targetRowIndex = $actualRowIndex;
                    $currentRow = $row;
                    break;
                }
            }

            if (!$targetRowIndex || !$currentRow) {
                return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
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

            $date = \Carbon\Carbon::now()->format('M d, H:i');
            
            $pendingImageUrl = '';
            if ($request->hasFile('pendingImage')) {
                $timestamp = time();
                $pendingImageUrl = $this->googleService->uploadImage($request->file('pendingImage'), "{$idOrRowIndex}-pending-{$timestamp}");
            }

            $existingItems[] = [
                'date'   => $date,
                'by'     => $request->pendingBy,
                'reason' => $request->pendingReason,
                'image'  => $pendingImageUrl,
            ];

            $newJson = json_encode($existingItems);

            $this->googleService->updateRow($targetRowIndex, [
                'F' => 'pending',
                'S' => $newJson,
                'T' => $request->pendingBy,
                'U' => $pendingImageUrl,
            ]);

            $resolvedPendingUrl = $this->resolveImageUrl($pendingImageUrl);
            $resolvedTimeline = $this->parsePendingTimeline($newJson);

            try {
                Http::timeout(3)->post('http://localhost:3000/notify', [
                    'message' => "⏸️ *Issue Pending!*\n*Title:* {$currentRow[1]}\n*Pending By:* {$request->pendingBy}\n*Reason:* {$request->pendingReason}",
                    'imageUrl' => $resolvedPendingUrl
                ]);
            } catch (\Exception $e) {}

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
        $request->validate([
            'category' => 'required|string',
        ]);
        
        try {
            $foundLocation = $this->googleService->findIssueAcrossSheets((string)$idOrRowIndex);
            if ($foundLocation) {
                $this->googleService->setSheet($foundLocation['sheet']);
                $targetRowIndex = $foundLocation['rowIndex'];
            } else {
                $this->resolveSheet(null);
                $rows = $this->googleService->getRows();
                $targetRowIndex = null;
                foreach ($rows as $index => $row) {
                    $actualRowIndex = $index + 2;
                    if (($row[0] ?? '') === (string)$idOrRowIndex || (string)$actualRowIndex === (string)$idOrRowIndex) {
                        $targetRowIndex = $actualRowIndex;
                        break;
                    }
                }
            }

            if (!$targetRowIndex) {
                return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
            }

            $this->googleService->updateRow($targetRowIndex, [
                'E' => $request->category
            ]);

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to update category: ' . $e->getMessage()], 500);
        }
    }
}

