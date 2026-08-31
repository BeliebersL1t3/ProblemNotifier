<?php

namespace App\Http\Controllers;

use App\Services\GoogleService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class OperationsController extends Controller
{
    protected GoogleService $googleService;

    public function __construct(GoogleService $googleService)
    {
        $this->googleService = $googleService;
    }

    /** GET /api/operations?dept=Engineer&sheets=2026,2027 or dept=all */
    public function index(Request $request)
    {
        $dept = trim($request->query('dept', 'all'));
        $isAll = empty($dept) || strtolower($dept) === 'all';

        $sheetsParam = $request->query('sheets', '');
        $selectedSheets = [];
        if (!empty($sheetsParam) && $sheetsParam !== 'all') {
            $selectedSheets = is_array($sheetsParam) ? $sheetsParam : array_filter(array_map('trim', explode(',', $sheetsParam)));
        }

        $forceRefresh = $request->boolean('refresh');
        $cacheKey = 'ops_data_' . md5(strtolower($dept) . '_' . implode(',', $selectedSheets));

        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        try {
            $data = Cache::remember($cacheKey, 60, function () use ($dept, $isAll, $selectedSheets, $forceRefresh) {
                $allSheets = $this->googleService->listSheets();
                $availableIssueSheets = array_values(array_filter($allSheets, fn($s) => !str_starts_with($s, 'Ops_')));

                if ($isAll) {
                    $manualItems = $this->googleService->getAllOpsWorkItems($forceRefresh);
                    $manualItems = array_map(function($item) {
                        if (!empty($item['photoUrl'])) {
                            $item['photoUrl'] = $this->resolveImageUrl($item['photoUrl']);
                        }
                        return $item;
                    }, $manualItems);
                } else {
                    $manualItems = $this->googleService->getOpsWorkItems($dept, $forceRefresh);
                    $manualItems = array_map(function($item) {
                        if (!empty($item['photoUrl'])) {
                            $item['photoUrl'] = $this->resolveImageUrl($item['photoUrl']);
                        }
                        return $item;
                    }, $manualItems);
                }

                $issueItems  = $this->getRelevantIssues($dept, $selectedSheets);
                return [
                    'availableSheets' => $availableIssueSheets,
                    'manual'          => $manualItems,
                    'issues'          => $issueItems,
                ];
            });

            return response()->json([
                'success'         => true,
                'dept'            => $dept,
                'availableSheets' => $data['availableSheets'],
                'manual'          => $data['manual'],
                'issues'          => $data['issues'],
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    private function resolveImageUrl(?string $raw): string
    {
        if (empty($raw)) {
            return '';
        }

        $raw = trim($raw);

        if (str_starts_with($raw, 'data:')) {
            return $raw;
        }

        // Convert Google Drive view/open links to direct high-res image stream
        if (preg_match('#drive\.google\.com/(?:file/d/|open\?id=)([a-zA-Z0-9_\-]+)#', $raw, $matches)) {
            return 'https://lh3.googleusercontent.com/d/' . $matches[1];
        }

        if (str_starts_with($raw, 'http://') || str_starts_with($raw, 'https://')) {
            if (str_contains($raw, '/uploads/')) {
                $path = parse_url($raw, PHP_URL_PATH);
                $filename = basename($path);
                return asset('uploads/' . $filename);
            }
            return $raw;
        }

        $cleanFile = ltrim(str_replace('uploads/', '', $raw), '/');
        return asset('uploads/' . $cleanFile);
    }

    private function parsePendingTimeline($rawData, $legacyBy = '', $legacyImage = ''): array
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

        return [
            [
                'date'   => '',
                'by'     => $legacyBy ?: 'Staff',
                'reason' => $rawData,
                'image'  => $this->resolveImageUrl($legacyImage),
            ]
        ];
    }

    private function getRelevantIssues(string $dept, array $selectedSheets = []): array
    {
        $isAll       = empty($dept) || strtolower($dept) === 'all';
        $allSheets   = $this->googleService->listSheets();
        $issueSheets = array_values(array_filter($allSheets, fn($s) => !str_starts_with($s, 'Ops_')));

        if (!empty($selectedSheets)) {
            $issueSheets = array_values(array_intersect($issueSheets, $selectedSheets));
        }

        $results     = [];
        $seenIds     = [];

        // Process newest sheets first and deduplicate by Issue ID so no job is repeated
        foreach (array_reverse($issueSheets) as $sheetName) {
            $this->googleService->setSheet($sheetName);
            try {
                $rows = $this->googleService->getRows(false);
            } catch (\Throwable $e) {
                continue;
            }

            foreach ($rows as $idx => $row) {
                $row = array_pad($row, 24, '');
                $id  = trim($row[0] ?? '');
                if (empty($id) || isset($seenIds[$id])) {
                    continue;
                }

                $status           = strtolower($row[5]  ?? '');
                $originDept       = $row[22] ?? '';
                $assignedDeptRaw  = $row[23] ?? '';
                $taggedDeptRaw    = $row[21] ?? '';

                if ($status === 'solved') continue;

                $assignedDepts = !empty($assignedDeptRaw)
                    ? (json_decode($assignedDeptRaw, true) ?: array_map('trim', explode(',', $assignedDeptRaw)))
                    : [];
                $taggedDepts   = !empty($taggedDeptRaw)
                    ? (json_decode($taggedDeptRaw, true) ?: array_map('trim', explode(',', $taggedDeptRaw)))
                    : [];

                $deptLower     = strtolower(trim($dept));
                $originMatch   = strtolower(trim($originDept)) === $deptLower;
                $assignedMatch = collect($assignedDepts)->contains(fn($d) => strtolower(trim($d)) === $deptLower);
                $taggedMatch   = collect($taggedDepts)->contains(fn($d) => strtolower(trim($d)) === $deptLower);

                if (!$isAll && !$originMatch && !$assignedMatch && !$taggedMatch) continue;

                $seenIds[$id] = true;

                $pendingTimeline = $this->parsePendingTimeline($row[18] ?? '', $row[19] ?? '', $row[20] ?? '');
                $cleanPendingReason = '';
                if (!empty($pendingTimeline)) {
                    $latest = end($pendingTimeline);
                    $cleanPendingReason = $latest['reason'] ?? '';
                } elseif (!empty($row[18])) {
                    $cleanPendingReason = $row[18];
                }

                $results[] = [
                    'id'              => $id,
                    'type'            => 'issue',
                    'department'      => $originDept,
                    'assignedDepts'   => $assignedDepts,
                    'taggedDepts'     => $taggedDepts,
                    'involvedAs'      => array_values(array_filter([
                        $originMatch   ? 'origin'   : null,
                        $assignedMatch ? 'assigned' : null,
                        $taggedMatch   ? 'tagged'   : null,
                    ])),
                    'title'           => $row[1] ?? '',
                    'description'     => $row[2] ?? '',
                    'location'        => $row[3] ?? '',
                    'category'        => $row[4] ?? '',
                    'status'          => $status,
                    'reporter'        => $row[6] ?? '',
                    'reportedAt'      => $row[7] ?? '',
                    'imageUrl'        => $this->resolveImageUrl($row[8] ?? ''),
                    'claimedBy'       => $row[9] ?? '',
                    'claimedAt'       => $row[10] ?? '',
                    'pendingReason'   => $cleanPendingReason,
                    'pendingTimeline' => $pendingTimeline,
                    'pendingBy'       => $row[19] ?? '',
                    'pendingImageUrl' => $this->resolveImageUrl($row[20] ?? ''),
                    'priority'        => $row[16] ?? 'normal',
                    'sheet'           => $sheetName,
                ];
            }
        }

        return $results;
    }

    /** POST /api/operations */
    public function store(Request $request)
    {
        $data = $request->validate([
            'dept'        => 'required|string|max:100',
            'title'       => 'required|string|max:200',
            'description' => 'nullable|string',
            'location'    => 'nullable|string|max:200',
            'photoUrl'    => 'nullable|string|max:1000',
            'photo'       => 'nullable|file|image|mimes:jpg,jpeg,png,webp|max:10240',
            'startDate'   => 'nullable|string',
            'endDate'     => 'nullable|string',
            'priority'    => 'nullable|in:low,normal,urgent',
            'notes'       => 'nullable|string',
            'createdBy'   => 'nullable|string|max:100',
        ]);

        // If authenticated user is a department user, force their department & staff_name
        $authUser = auth()->user();
        if ($authUser && $authUser->role === 'department') {
            $data['dept']      = $authUser->department;
            $data['createdBy'] = $authUser->staff_name ?? $authUser->name;
        }

        try {
            if ($request->hasFile('photo')) {
                $deptCode = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $data['dept']), 0, 4)) ?: 'OPS';
                $customToken = "ops-{$deptCode}-" . time() . '-' . rand(1000, 9999);
                $data['photoUrl'] = $this->googleService->uploadImage($request->file('photo'), $customToken);
            }

            $id = $this->googleService->appendOpsWorkItem($data['dept'], $data);
            Cache::forget('google_ops_work_items_' . $data['dept']);
            Cache::flush();
            $fullPhotoUrl = !empty($data['photoUrl']) ? $this->resolveImageUrl($data['photoUrl']) : '';

            return response()->json([
                'success'  => true,
                'id'       => $id,
                'photoUrl' => $fullPhotoUrl,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /** PATCH or POST /api/operations/{rowIndex} */
    public function update(Request $request, int $rowIndex)
    {
        $dept   = $request->input('dept');
        $fields = $request->only([
            'title', 'description', 'location', 'photoUrl',
            'startDate', 'endDate', 'priority', 'status',
            'completedAt', 'notes',
        ]);

        if (!$dept) {
            return response()->json(['success' => false, 'message' => 'dept is required'], 422);
        }

        if ($request->hasFile('photo')) {
            $deptCode = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $dept), 0, 4)) ?: 'OPS';
            $customToken = "ops-{$deptCode}-" . time() . '-' . rand(1000, 9999);
            $fields['photoUrl'] = $this->googleService->uploadImage($request->file('photo'), $customToken);
        }

        if (($fields['status'] ?? '') === 'done' && empty($fields['completedAt'])) {
            $fields['completedAt'] = now()->toIso8601String();
        }

        try {
            $this->googleService->updateOpsWorkItem($dept, $rowIndex, $fields);
            Cache::forget('google_ops_work_items_' . $dept);
            Cache::flush();
            $fullPhotoUrl = isset($fields['photoUrl']) ? $this->resolveImageUrl($fields['photoUrl']) : null;
            return response()->json([
                'success'  => true,
                'photoUrl' => $fullPhotoUrl,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /** DELETE /api/operations/{rowIndex} */
    public function destroy(Request $request, int $rowIndex)
    {
        $dept = $request->input('dept');
        if (!$dept) {
            return response()->json(['success' => false, 'message' => 'dept is required'], 422);
        }
        try {
            $this->googleService->deleteOpsWorkItem($dept, $rowIndex);
            Cache::forget('google_ops_work_items_' . $dept);
            Cache::flush();
            return response()->json(['success' => true]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    /** POST /api/operations/sync-calendar */
    public function syncCalendar()
    {
        try {
            $result = $this->googleService->syncAllToGoogleCalendar();
            return response()->json([
                'success' => true,
                'data'    => $result,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}
