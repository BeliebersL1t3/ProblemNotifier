<?php

namespace App\Http\Controllers;

use App\Models\DashboardNotification;
use App\Models\IssueDepartmentAction;
use App\Models\IssueDiscussion;
use App\Models\User;
use App\Services\GoogleService;
use App\Services\IssueSheetRepository;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class IssueDiscussionController extends Controller
{
    protected GoogleService $googleService;

    public function __construct(GoogleService $googleService)
    {
        $this->googleService = $googleService;
    }

    /**
     * Resolve issue data across sheets (cached or fresh).
     */
    private function getIssueData(string $idOrRowIndex): ?array
    {
        $targetSheet = null;
        $targetRowIndex = null;
        $currentRow = null;

        $foundLocation = $this->googleService->findIssueAcrossSheets($idOrRowIndex);
        if ($foundLocation) {
            $targetSheet = $foundLocation['sheet'];
            $this->googleService->setSheet($targetSheet);
            $rows = $this->googleService->getRows();
        } else {
            $allSheets = $this->googleService->listSheets();
            $targetSheet = !empty($allSheets) ? end($allSheets) : 'Sheet1';
            $this->googleService->setSheet($targetSheet);
            $rows = $this->googleService->getRows();
        }

        $matchedId = null;
        foreach ($rows as $index => $row) {
            $actualRowIndex = $index + 2;
            if (($row[0] ?? '') === $idOrRowIndex || (string)$actualRowIndex === $idOrRowIndex) {
                $matchedId = $row[0] ?? null;
                $targetRowIndex = $actualRowIndex;
                $currentRow = $row;
            }
        }

        if (!empty($matchedId)) {
            foreach ($rows as $index => $row) {
                $actualRowIndex = $index + 2;
                if (($row[0] ?? '') === $matchedId) {
                    $targetRowIndex = $actualRowIndex;
                    $currentRow = $row;
                }
            }
        }

        if (!$targetRowIndex || !$currentRow) {
            return null;
        }

        return [
            'sheet'         => $targetSheet,
            'rowIndex'      => $targetRowIndex,
            'row'           => IssueSheetRepository::padRow($currentRow),
            'id'            => IssueSheetRepository::getId($currentRow),
            'foundLocation' => $foundLocation,
        ];
    }

    /**
     * Compute dynamic role badge for a user relative to this issue.
     */
    private function computeUserBadge(User $user, array $row): string
    {
        $reporter = trim($row[IssueSheetRepository::COL_REPORTER] ?? '');
        $userName = trim($user->name ?: $user->staff_name ?: 'Staff');
        $dept = trim($user->department ?: 'Umum');

        // Check if user is the reporter
        if (!empty($reporter) && strcasecmp($reporter, $userName) === 0) {
            return "Pelapor | {$userName}";
        }

        if ($user->isAdmin()) {
            return "Admin | {$userName}";
        }

        if ($user->isHOD()) {
            return "HoD {$dept} | {$userName}";
        }

        return "{$dept} | {$userName}";
    }

    /**
     * Determine assigned departments for an issue.
     */
    private function getTargetDepartments(array $row): array
    {
        $assigned = IssueSheetRepository::getAssignedDepartments($row);
        if (empty($assigned)) {
            $origin = trim($row[IssueSheetRepository::COL_ORIGIN_DEPT] ?? '');
            if (!empty($origin)) {
                $assigned = [$origin];
            } else {
                $category = trim($row[IssueSheetRepository::COL_CATEGORY] ?? '');
                $assigned = !empty($category) ? [$category] : ['Umum'];
            }
        }
        return array_values(array_unique(array_filter(array_map('trim', $assigned))));
    }

    /**
     * Check if user is authorized to view/chat in this issue (especially for confidential issues).
     */
    private function checkAccess(User $user, array $row): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        $isConfidential = IssueSheetRepository::isConfidential($row);
        if (!$isConfidential) {
            return true;
        }

        $reporter = trim($row[IssueSheetRepository::COL_REPORTER] ?? '');
        $taker = trim($row[IssueSheetRepository::COL_TAKER] ?? '');
        $userName = trim($user->name ?: $user->staff_name ?: '');

        if (!empty($reporter) && strcasecmp($reporter, $userName) === 0) {
            return true;
        }

        if (!empty($taker) && stripos($taker, $userName) !== false) {
            return true;
        }

        $targetDepts = array_map('strtolower', $this->getTargetDepartments($row));
        $userDept = strtolower(trim($user->department ?: ''));

        return in_array($userDept, $targetDepts, true);
    }

    /**
     * Send notification to WhatsApp department group via local bot.
     */
    private function notifyWhatsAppGroup(string $department, string $message): void
    {
        try {
            Http::withHeaders([
                'X-Bot-Key' => config('services.bot.api_key'),
            ])->connectTimeout(1)->timeout(2)->post('http://localhost:3000/notify', [
                'department' => $department,
                'message'    => $message,
            ]);
        } catch (\Throwable $e) {
            Log::info("WhatsApp group notification skipped: " . $e->getMessage());
        }
    }

    /**
     * GET /api/issues/{idOrRowIndex}/discussion
     * Fetch all messages, department statuses, and metadata for this issue.
     */
    public function getDiscussion(Request $request, string $idOrRowIndex)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $issueData = $this->getIssueData($idOrRowIndex);
        if (!$issueData) {
            return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
        }

        $row = $issueData['row'];
        if (!$this->checkAccess($user, $row)) {
            return response()->json([
                'success' => false,
                'message' => 'Akses ditolak. Tiket ini bersifat rahasia (Confidential).',
            ], 403);
        }

        $issueId = $issueData['id'] ?: $idOrRowIndex;
        $status = strtolower(trim($row[IssueSheetRepository::COL_STATUS] ?? 'open'));
        $isArchived = IssueSheetRepository::isArchived($row);
        $isLocked = ($status === 'solved' || $isArchived);

        $targetDepts = $this->getTargetDepartments($row);

        // Fetch department readiness & solve actions
        $deptActions = IssueDepartmentAction::where('issue_id', $issueId)->get()->keyBy(function ($item) {
            return strtolower(trim($item->department));
        });

        $deptStatusList = [];
        $allReady = true;
        $allSolved = true;

        foreach ($targetDepts as $dept) {
            $key = strtolower(trim($dept));
            $action = $deptActions->get($key);

            $isReady = !empty($action?->ready_at);
            $isSolved = !empty($action?->solved_at);
            $isPending = !empty($action?->pending_at);

            if (!$isReady) {
                $allReady = false;
            }
            if (!$isSolved) {
                $allSolved = false;
            }

            $deptStatusList[] = [
                'department'      => $dept,
                'is_ready'        => $isReady,
                'ready_by'        => $action?->ready_by_name,
                'ready_at'        => $action?->ready_at?->toIso8601String(),
                'is_solved'       => $isSolved,
                'solved_by'       => $action?->solved_by_name,
                'solved_at'       => $action?->solved_at?->toIso8601String(),
                'action_note'     => $action?->action_note,
                'proof_image'     => $action?->proof_image,
                'is_pending'      => $isPending,
                'pending_by'      => $action?->pending_by_name,
                'pending_reason'  => $action?->pending_reason,
                'pending_at'      => $action?->pending_at?->toIso8601String(),
            ];
        }

        // Fetch discussion messages (including system events)
        $messages = IssueDiscussion::where('issue_id', $issueId)
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(function ($msg) {
                return [
                    'id'                     => $msg->id,
                    'user_id'                => $msg->user_id,
                    'sender_name'            => $msg->sender_name,
                    'sender_role_badge'      => $msg->sender_role_badge,
                    'message'                => $msg->message,
                    'attachment_url'         => $msg->attachment_url,
                    'is_whatsapp_dispatched' => (bool)$msg->is_whatsapp_dispatched,
                    'is_system_event'        => (bool)$msg->is_system_event,
                    'created_at'             => $msg->created_at->toIso8601String(),
                    'created_at_human'       => $msg->created_at->locale('id')->diffForHumans(),
                ];
            });

        $userBadge = $this->computeUserBadge($user, $row);

        return response()->json([
            'success'               => true,
            'issue_id'              => $issueId,
            'title'                 => $row[IssueSheetRepository::COL_TITLE] ?? '',
            'location'              => $row[IssueSheetRepository::COL_LOCATION] ?? '',
            'status'                => $status,
            'is_locked'             => $isLocked,
            'is_confidential'       => IssueSheetRepository::isConfidential($row),
            'target_departments'    => $targetDepts,
            'department_readiness'  => $deptStatusList,
            'all_departments_ready' => $allReady && !empty($targetDepts),
            'all_departments_solved'=> $allSolved && !empty($targetDepts),
            'current_user_badge'    => $userBadge,
            'messages'              => $messages,
        ]);
    }

    /**
     * POST /api/issues/{idOrRowIndex}/discussion
     * Post a new message to the issue discussion room.
     */
    public function postMessage(Request $request, string $idOrRowIndex)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'message'              => 'required|string|max:3000',
            'attachment'           => 'nullable|file|image|max:10240',
            'dispatch_to_whatsapp' => 'nullable|boolean',
        ]);

        $issueData = $this->getIssueData($idOrRowIndex);
        if (!$issueData) {
            return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
        }

        $row = $issueData['row'];
        if (!$this->checkAccess($user, $row)) {
            return response()->json(['success' => false, 'message' => 'Akses ditolak.'], 403);
        }

        $status = strtolower(trim($row[IssueSheetRepository::COL_STATUS] ?? 'open'));
        $isArchived = IssueSheetRepository::isArchived($row);
        if ($status === 'solved' || $isArchived) {
            return response()->json([
                'success' => false,
                'message' => 'Ruang diskusi telah dikunci (tiket sudah berstatus Solved/Archived).',
            ], 422);
        }

        $issueId = $issueData['id'] ?: $idOrRowIndex;
        $userBadge = $this->computeUserBadge($user, $row);

        $attachmentUrl = null;
        if ($request->hasFile('attachment')) {
            $timestamp = time();
            $attachmentUrl = $this->googleService->uploadImage($request->file('attachment'), "{$issueId}-chat-{$timestamp}");
        }

        $dispatchWa = (bool)$request->input('dispatch_to_whatsapp', false);

        $discussion = IssueDiscussion::create([
            'issue_id'               => $issueId,
            'user_id'                => $user->id,
            'sender_name'            => $user->name ?: 'Staff',
            'sender_role_badge'      => $userBadge,
            'message'                => trim($request->input('message')),
            'attachment_url'         => $attachmentUrl,
            'is_whatsapp_dispatched' => $dispatchWa,
            'is_system_event'        => false,
        ]);

        // Forward to WhatsApp department groups if requested
        if ($dispatchWa) {
            $targetDepts = $this->getTargetDepartments($row);
            $title = $row[IssueSheetRepository::COL_TITLE] ?? '';
            $location = $row[IssueSheetRepository::COL_LOCATION] ?? '';

            $waMessage = "💬 *[DISKUSI TIKET #{$issueId}]*\n"
                . "*Lokasi:* {$location}\n"
                . "*Judul:* {$title}\n"
                . "*Dari:* {$userBadge}\n\n"
                . "_{$discussion->message}_\n\n"
                . "Buka dashboard untuk membalas diskusi.";

            foreach ($targetDepts as $dept) {
                $this->notifyWhatsAppGroup($dept, $waMessage);
            }
        }

        // Create in-app dashboard notification for relevant users (except the sender)
        try {
            $targetDepts = $this->getTargetDepartments($row);
            $recipients = User::where('is_active', true)
                ->where('id', '!=', $user->id)
                ->where(function ($q) use ($targetDepts) {
                    $q->whereIn('department', $targetDepts)
                      ->orWhere('role', 'admin');
                })
                ->limit(20)
                ->get();

            foreach ($recipients as $recipient) {
                DashboardNotification::create([
                    'user_id'     => $recipient->id,
                    'department'  => $recipient->department,
                    'role_target' => $recipient->role,
                    'type'        => 'issue_chat',
                    'title'       => "💬 Pesan baru di Tiket #{$issueId}",
                    'message'     => "{$userBadge}: " . mb_substr($discussion->message, 0, 80) . (mb_strlen($discussion->message) > 80 ? '...' : ''),
                    'link'        => "/dashboard?issue={$issueId}",
                    'is_read'     => false,
                ]);
            }
        } catch (\Throwable $e) {
            Log::info("DashboardNotification creation skipped: " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Pesan berhasil dikirim.',
            'data'    => [
                'id'                     => $discussion->id,
                'user_id'                => $discussion->user_id,
                'sender_name'            => $discussion->sender_name,
                'sender_role_badge'      => $discussion->sender_role_badge,
                'message'                => $discussion->message,
                'attachment_url'         => $discussion->attachment_url,
                'is_whatsapp_dispatched' => (bool)$discussion->is_whatsapp_dispatched,
                'is_system_event'        => false,
                'created_at'             => $discussion->created_at->toIso8601String(),
                'created_at_human'       => $discussion->created_at->locale('id')->diffForHumans(),
            ],
        ]);
    }

    /**
     * POST /api/issues/{idOrRowIndex}/dept-ready
     * Progressive Ready: Department marks itself as ready to work.
     */
    public function deptReady(Request $request, string $idOrRowIndex)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $issueData = $this->getIssueData($idOrRowIndex);
        if (!$issueData) {
            return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
        }

        $row = $issueData['row'];
        $issueId = $issueData['id'] ?: $idOrRowIndex;
        $userDept = $user->department ?: 'Umum';

        $action = IssueDepartmentAction::firstOrNew([
            'issue_id'   => $issueId,
            'department' => $userDept,
        ]);

        $action->ready_by_user_id = $user->id;
        $action->ready_by_name = $user->name ?: 'Staff';
        $action->ready_at = Carbon::now('Asia/Jakarta');
        // Clear any previous pending flag if readying again
        $action->pending_at = null;
        $action->pending_reason = null;
        $action->save();

        $userBadge = $this->computeUserBadge($user, $row);

        // System event message
        IssueDiscussion::create([
            'issue_id'          => $issueId,
            'user_id'           => null,
            'sender_name'       => 'Sistem',
            'sender_role_badge' => 'Sistem',
            'message'           => "🟢 {$userBadge} menyatakan departemen {$userDept} SIAP DIKERJAKAN.",
            'is_system_event'   => true,
        ]);

        // Synchronize Google Sheet
        $targetDepts = $this->getTargetDepartments($row);
        $allDeptActions = IssueDepartmentAction::where('issue_id', $issueId)->get();
        $readyList = $allDeptActions->whereNotNull('ready_at')->map(function ($a) {
            return "{$a->department} ({$a->ready_by_name})";
        })->values()->implode(', ');

        $currentStatus = strtolower(trim($row[IssueSheetRepository::COL_STATUS] ?? 'open'));
        if ($currentStatus === 'open' || $currentStatus === 'pending') {
            $row[IssueSheetRepository::COL_STATUS] = 'progress';
        }
        $row[IssueSheetRepository::COL_TAKER] = $readyList ?: "{$userDept} ({$user->name})";
        if (empty($row[IssueSheetRepository::COL_TAKEN_DATE])) {
            $row[IssueSheetRepository::COL_TAKEN_DATE] = Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');
        }

        try {
            $this->googleService->updateRow($issueData['rowIndex'], $row, $issueData['sheet']);
        } catch (\Throwable $e) {
            Log::warning("Sheet update on deptReady skipped: " . $e->getMessage());
        }

        // Check if all departments are now ready
        $allReady = true;
        foreach ($targetDepts as $d) {
            $found = $allDeptActions->first(fn($a) => strcasecmp($a->department, $d) === 0 && !empty($a->ready_at));
            if (!$found) {
                $allReady = false;
                break;
            }
        }

        if ($allReady && count($targetDepts) > 1) {
            IssueDiscussion::create([
                'issue_id'          => $issueId,
                'user_id'           => null,
                'sender_name'       => 'Sistem',
                'sender_role_badge' => 'Sistem',
                'message'           => "🚀 Seluruh departemen (" . implode(', ', $targetDepts) . ") telah menyatakan SIAP! Pekerjaan bersama sedang berlangsung.",
                'is_system_event'   => true,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "Departemen {$userDept} berhasil dinyatakan Siap Dikerjakan.",
            'all_ready' => $allReady,
        ]);
    }

    /**
     * POST /api/issues/{idOrRowIndex}/dept-pending
     * Mark an issue pending with specific reason from a department.
     */
    public function deptPending(Request $request, string $idOrRowIndex)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'reason'       => 'required|string|max:1000',
            'pendingImage' => 'nullable|file|image|max:10240',
        ]);

        $issueData = $this->getIssueData($idOrRowIndex);
        if (!$issueData) {
            return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
        }

        $row = $issueData['row'];
        $issueId = $issueData['id'] ?: $idOrRowIndex;
        $userDept = $user->department ?: 'Umum';
        $reason = trim($request->input('reason'));

        $pendingImageUrl = null;
        if ($request->hasFile('pendingImage')) {
            $timestamp = time();
            $pendingImageUrl = $this->googleService->uploadImage($request->file('pendingImage'), "{$issueId}-pending-{$timestamp}");
        }

        $action = IssueDepartmentAction::firstOrNew([
            'issue_id'   => $issueId,
            'department' => $userDept,
        ]);

        $action->pending_by_user_id = $user->id;
        $action->pending_by_name = $user->name ?: 'Staff';
        $action->pending_reason = $reason;
        $action->pending_at = Carbon::now('Asia/Jakarta');
        $action->save();

        $userBadge = $this->computeUserBadge($user, $row);

        IssueDiscussion::create([
            'issue_id'          => $issueId,
            'user_id'           => null,
            'sender_name'       => 'Sistem',
            'sender_role_badge' => 'Sistem',
            'message'           => "⚠️ {$userBadge} menandai tiket PENDING: \"{$reason}\"",
            'attachment_url'    => $pendingImageUrl,
            'is_system_event'   => true,
        ]);

        // Update Sheet status to pending
        $row[IssueSheetRepository::COL_STATUS] = 'pending';
        $row[IssueSheetRepository::COL_PENDING_BY] = "{$user->name} ({$userDept})";
        $row[IssueSheetRepository::COL_PENDING_REASON] = $reason;
        if ($pendingImageUrl) {
            $row[IssueSheetRepository::COL_PENDING_IMAGE] = $pendingImageUrl;
        }

        try {
            $this->googleService->updateRow($issueData['rowIndex'], $row, $issueData['sheet']);
        } catch (\Throwable $e) {
            Log::warning("Sheet update on deptPending skipped: " . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Tiket berhasil dipending.',
        ]);
    }

    /**
     * POST /api/issues/{idOrRowIndex}/dept-solve
     * Collaborative Resolution: Department confirms completion (ACC Selesai).
     */
    public function deptSolve(Request $request, string $idOrRowIndex)
    {
        $user = auth()->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $request->validate([
            'action_note' => 'nullable|string|max:2000',
            'proofImage'  => 'nullable|file|image|max:10240',
        ]);

        $issueData = $this->getIssueData($idOrRowIndex);
        if (!$issueData) {
            return response()->json(['success' => false, 'message' => 'Issue not found.'], 404);
        }

        $row = $issueData['row'];
        $issueId = $issueData['id'] ?: $idOrRowIndex;
        $userDept = $user->department ?: 'Umum';
        $actionNote = trim($request->input('action_note', ''));

        $proofUrl = null;
        if ($request->hasFile('proofImage')) {
            $timestamp = time();
            $proofUrl = $this->googleService->uploadImage($request->file('proofImage'), "{$issueId}-proof-{$timestamp}");
        }

        $action = IssueDepartmentAction::firstOrNew([
            'issue_id'   => $issueId,
            'department' => $userDept,
        ]);

        $action->solved_by_user_id = $user->id;
        $action->solved_by_name = $user->name ?: 'Staff';
        $action->solved_at = Carbon::now('Asia/Jakarta');
        if (!empty($actionNote)) {
            $action->action_note = $actionNote;
        }
        if (!empty($proofUrl)) {
            $action->proof_image = $proofUrl;
        }
        $action->save();

        $userBadge = $this->computeUserBadge($user, $row);

        IssueDiscussion::create([
            'issue_id'          => $issueId,
            'user_id'           => null,
            'sender_name'       => 'Sistem',
            'sender_role_badge' => 'Sistem',
            'message'           => "✅ {$userBadge} meng-ACC penyelesaian untuk departemen {$userDept}" . (!empty($actionNote) ? ": \"{$actionNote}\"" : "."),
            'attachment_url'    => $proofUrl,
            'is_system_event'   => true,
        ]);

        $targetDepts = $this->getTargetDepartments($row);
        $allDeptActions = IssueDepartmentAction::where('issue_id', $issueId)->get();

        // Check if all assigned departments have confirmed completion
        $allSolved = true;
        foreach ($targetDepts as $d) {
            $found = $allDeptActions->first(fn($a) => strcasecmp($a->department, $d) === 0 && !empty($a->solved_at));
            if (!$found) {
                $allSolved = false;
                break;
            }
        }

        if ($allSolved) {
            $allSolvers = $allDeptActions->whereNotNull('solved_at')->map(function ($a) {
                return "{$a->department}: {$a->solved_by_name}";
            })->values()->implode(', ');

            $combinedNotes = $allDeptActions->whereNotNull('action_note')->map(function ($a) {
                return "[{$a->department}] {$a->action_note}";
            })->values()->implode(' | ');

            $latestProof = $proofUrl ?: $allDeptActions->whereNotNull('proof_image')->pluck('proof_image')->last();

            $row[IssueSheetRepository::COL_STATUS] = 'solved';
            $row[IssueSheetRepository::COL_SOLVED_BY] = $allSolvers ?: "{$userDept}: {$user->name}";
            $row[IssueSheetRepository::COL_SOLVED_DATE] = Carbon::now('Asia/Jakarta')->format('M d, Y H:i:s');
            $row[IssueSheetRepository::COL_ACTION_TAKEN] = $combinedNotes ?: ($actionNote ?: 'Telah diselesaikan bersama.');
            if ($latestProof) {
                $row[IssueSheetRepository::COL_PROOF_IMAGE] = $latestProof;
            }

            try {
                $this->googleService->updateRow($issueData['rowIndex'], $row, $issueData['sheet']);
            } catch (\Throwable $e) {
                Log::warning("Sheet update on allSolved skipped: " . $e->getMessage());
            }

            IssueDiscussion::create([
                'issue_id'          => $issueId,
                'user_id'           => null,
                'sender_name'       => 'Sistem',
                'sender_role_badge' => 'Sistem',
                'message'           => "🎉 Seluruh departemen yang ditugaskan (" . implode(', ', $targetDepts) . ") telah meng-ACC penyelesaian! Tiket resmi SOLVED dan diskusi ditutup.",
                'is_system_event'   => true,
            ]);
        }

        return response()->json([
            'success'    => true,
            'message'    => "Penyelesaian berhasil di-ACC untuk departemen {$userDept}.",
            'all_solved' => $allSolved,
        ]);
    }
}
