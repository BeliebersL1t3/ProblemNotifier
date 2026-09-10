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
                        'pendingReason'  => $this->parsePendingReason($row[18] ?? ''),
                        'pendingTimeline'=> $this->parsePendingTimeline($row[18] ?? '', $row[19] ?? '', $row[20] ?? ''),
                        'pendingBy'      => $row[19] ?? '',
                        'pendingImageUrl'=> $this->resolveImageUrl($row[20] ?? ''),
                        'editLogs'       => $this->parseEditLogs($row[24] ?? ''),
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

            $existingLogs = $this->parseEditLogs($currentRow[24] ?? '');
            $existingLogs[] = [
                'date'         => Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s'),
                'by'           => $request->taker,
                'dept'         => $request->department ?? '',
                'role'         => 'Department',
                'type'         => 'claim',
                'from'         => 'open',
                'to'           => 'progress',
                'statusChange' => 'open → progress',
                'reason'       => null,
                'changes'      => "Pekerjaan diambil / diklaim oleh {$request->taker}" . (!empty($request->department) ? " ({$request->department})" : ""),
            ];

            $this->googleService->updateRow($targetRowIndex, [
                'F' => 'progress',
                'J' => $request->taker,
                'K' => $takenAt,
                'Y' => json_encode($existingLogs),
            ]);

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

            // Audit log in Column Y
            $existingLogs = $this->parseEditLogs($currentRow[24] ?? '');
            $nowFormatted = Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');
            $existingLogs[] = [
                'date' => $nowFormatted,
                'by' => $request->solver,
                'dept' => auth()->user()?->department ?? '',
                'role' => auth()->user()?->role ?? 'Department',
                'type' => 'solve',
                'from' => $currentRow[5] ?? 'progress',
                'to' => 'solved',
                'statusChange' => ($currentRow[5] ?? 'progress') . ' → solved',
                'reason' => $formattedFix,
                'proofImage' => $proofUrl,
                'duration' => $durationLabel,
                'changes' => "Pekerjaan diselesaikan oleh {$request->solver}",
            ];

            $this->googleService->updateRow($targetRowIndex, [
                'F' => 'solved',
                'L' => $request->solver,
                'M' => $solvedAt,
                'N' => $formattedFix,
                'O' => $proofUrl,
                'P' => $durationLabel,
                'Y' => json_encode($existingLogs),
            ]);

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

            $this->googleService->updateRow($targetRowIndex, [
                'F' => 'pending',
                'S' => $newJson,
                'T' => $request->pendingBy,
                'U' => $pendingImageUrl,
            ]);

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

    public function update(Request $request, $idOrRowIndex)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        try {
            $request->validate([
                'title'               => 'required|string|max:255',
                'description'         => 'required|string',
                'location'            => 'required|string|max:255',
                'category'            => 'required|string',
                'priority'            => 'nullable|string',
                'deadline'            => 'nullable|string',
                'assignedDepartments' => 'nullable|string',
                'taggedDepartments'   => 'nullable|string',
                'image'               => 'nullable|file|image|mimes:jpg,jpeg,png,webp|max:5120',
                // State-specific fields
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
            $foundLocation = $this->googleService->findIssueAcrossSheets((string)$idOrRowIndex);
            if ($foundLocation) {
                $targetSheet    = $foundLocation['sheet'];
                $this->googleService->setSheet($targetSheet);
                $targetRowIndex = $foundLocation['rowIndex'];
            } else {
                $targetSheet = $this->resolveSheet(null);
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

            $rows = $this->googleService->getRows();
            $currentRow = $rows[$targetRowIndex - 2] ?? null;
            if (!$currentRow) {
                return response()->json(['success' => false, 'message' => 'Issue row data not found.'], 404);
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

            if (!$canEditReport && !$canEditClaim && !$canEditPending && !$canEditSolved) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized. You do not have permission to edit this issue.',
                ], 403);
            }

            $changes = [];
            $updateCols = [];

            // ================= 1. INITIAL REPORT FIELDS (Origin or Admin) =================
            if ($canEditReport) {
                $oldTitle = $currentRow[1] ?? '';
                $newTitle = trim($request->title);
                if ($oldTitle !== $newTitle) {
                    $changes[] = "Title: \"{$newTitle}\"";
                }

                $oldDesc = $currentRow[2] ?? '';
                $newDesc = self::formatParagraphText($request->description);
                if ($oldDesc !== $newDesc) {
                    $changes[] = "Description updated";
                }

                $oldLoc = $currentRow[3] ?? '';
                $newLoc = trim($request->location);
                if ($oldLoc !== $newLoc) {
                    $changes[] = "Location: \"{$newLoc}\"";
                }

                $oldCat = $currentRow[4] ?? '';
                $newCat = trim($request->category);
                if ($oldCat !== $newCat) {
                    $changes[] = "Category: {$oldCat} → {$newCat}";
                }

                $oldPriority = $currentRow[16] ?? 'low';
                $newPriority = trim($request->input('priority', 'low'));
                if ($oldPriority !== $newPriority) {
                    $changes[] = "Priority: {$oldPriority} → {$newPriority}";
                }

                $newDeadline = $request->input('deadline', '');
                if (($currentRow[17] ?? '') !== $newDeadline) {
                    $changes[] = "Deadline updated";
                }

                $rawAssigned = $request->input('assignedDepartments', '');
                $rawTagged   = $request->input('taggedDepartments', '');

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
                }

                if (($currentRow[21] ?? '') !== $newTagged) {
                    $changes[] = "Tagged: {$newTagged}";
                }

                $imageUrl = $currentRow[8] ?? '';
                if ($request->hasFile('image')) {
                    $imageUrl = $this->googleService->uploadImage($request->file('image'), "{$currentRow[0]}-updated-" . time());
                    $changes[] = "Photo updated";
                }

                $updateCols['B'] = $newTitle;
                $updateCols['C'] = $newDesc;
                $updateCols['D'] = $newLoc;
                $updateCols['E'] = $newCat;
                $updateCols['I'] = $imageUrl;
                $updateCols['Q'] = $newPriority;
                $updateCols['R'] = $newDeadline;
                $updateCols['V'] = $newTagged;
                $updateCols['X'] = $newAssigned;
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

            $updateCols['Y'] = $logsJson;

            $this->googleService->updateRow($targetRowIndex, $updateCols);
            if ($canEditReport && isset($oldCat) && isset($newCat) && $oldCat !== $newCat) {
                $this->googleService->colorRowByCategory($targetRowIndex, $newCat);
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

        try {
            $foundLocation = $this->googleService->findIssueAcrossSheets((string)$idOrRowIndex);
            if ($foundLocation) {
                $targetSheet    = $foundLocation['sheet'];
                $this->googleService->setSheet($targetSheet);
                $targetRowIndex = $foundLocation['rowIndex'];
            } else {
                $targetSheet = $this->resolveSheet(null);
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

            $rows = $this->googleService->getRows();
            $currentRow = $rows[$targetRowIndex - 2] ?? null;
            if (!$currentRow) {
                return response()->json(['success' => false, 'message' => 'Issue row data not found.'], 404);
            }

            // Authorization check: Admin OR creator's department
            $originDept = $currentRow[22] ?? '';
            $isAuthorized = $user->isAdmin() || (
                $user->isDepartmentUser() && 
                !empty($user->department) && 
                strtolower(trim($user->department)) === strtolower(trim($originDept))
            );

            if (!$isAuthorized) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized. You can only delete issues created by your department.',
                ], 403);
            }

            $deletedId    = $currentRow[0] ?? (string)$idOrRowIndex;
            $deletedTitle = $currentRow[1] ?? '';
            $deletedLoc   = $currentRow[3] ?? '';
            $assignedDepts= $currentRow[23] ?? ($currentRow[21] ?? '');
            $taggedDepts  = $currentRow[21] ?? '';

            // Perform deletion
            $this->googleService->deleteRow($targetRowIndex, $targetSheet);

            $deleterName = $user->staff_name ?? $user->name ?? 'Staff';
            $deleterDept = $user->department ?? ($user->isAdmin() ? 'Admin' : '');
            $deleterRole = $user->isAdmin() ? 'Admin' : 'Department';

            // Dispatch WhatsApp deletion announcement
                $originStr = !empty($originDept) ? "\n*Origin:* {$originDept}" : '';
                $assignedStr = !empty($assignedDepts) ? "\n*Assigned:* {$assignedDepts}" : '';
                $taggedStr   = !empty($taggedDepts) ? "\n*Tagged:* {$taggedDepts}" : '';

                $this->notifyWhatsApp([
                    'message' => "📢 🗑️ *ISSUE DELETED / ANNOUNCEMENT*\n*ID:* {$deletedId}\n*Title:* {$deletedTitle}\n*Location:* {$deletedLoc}{$originStr}{$assignedStr}{$taggedStr}\n*Deleted By:* {$deleterName} ({$deleterRole}" . ($deleterDept ? " - {$deleterDept}" : "") . ")\n*Status:* Permanently Removed from System",
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
}

