<?php

namespace App\Http\Controllers;

use App\Models\LeanIssue;
use App\Models\User;
use App\Services\GoogleSheetsSyncService;
use App\Services\TicketNotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class LeanController extends Controller
{
    public const DEPARTMENTS = [
        'Engineer',
        'HK',
        'Fasilitas',
        'Kitchen',
        'GR',
        'IT',
        'OE',
        'Procurement',
        'Finance',
        'Reservasi',
        'HR',
    ];

    public const MAIN_LOCATIONS = [
        'TPI',
        'TBR',
        'Kantor',
    ];

    /**
     * Normalize department names across UI, database accounts, and tests (e.g. Engineering -> Engineer).
     */
    public static function normalizeDepartment(?string $dept): string
    {
        if (empty($dept)) {
            return '';
        }

        $clean = mb_strtolower(trim($dept));
        $aliases = [
            'engineer'        => 'Engineer',
            'engineering'     => 'Engineer',
            'maintenance'     => 'Engineer',
            'hk'              => 'HK',
            'housekeeping'    => 'HK',
            'pest control'    => 'HK',
            'pestcontrol'     => 'HK',
            'fasilitas'       => 'Fasilitas',
            'facility'        => 'Fasilitas',
            'facilities'      => 'Fasilitas',
            'security'        => 'Fasilitas',
            'kitchen'         => 'Kitchen',
            'f&b'             => 'Kitchen',
            'fnb'             => 'Kitchen',
            'food & beverage' => 'Kitchen',
            'gr'              => 'GR',
            'gre'             => 'GR',
            'guest relations' => 'GR',
            'service'         => 'GR',
            'bar'             => 'GR',
            'spa'             => 'GR',
            'tirek'           => 'GR',
            'it'              => 'IT',
            'oe'              => 'OE',
            'procurement'     => 'Procurement',
            'finance'         => 'Finance',
            'reservasi'       => 'Reservasi',
            'reservation'     => 'Reservasi',
            'sales'           => 'Reservasi',
            'marketing'       => 'Reservasi',
            'hr'              => 'HR',
            'human resources' => 'HR',
            'legal'           => 'HR',
            'lnd'             => 'HR',
            'transportasi'    => 'HR',
            'tekong'          => 'HR',
        ];

        return $aliases[$clean] ?? trim($dept);
    }

    /**
     * Determine whether a user is allowed to mutate an issue's status/workflow.
     * Everyone can view all issues, but only Admin or accounts in target_departments can manage status.
     */
    public static function canUserManageIssue(?User $user, LeanIssue $issue): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->isAdmin()) {
            return true;
        }

        $userDept = self::normalizeDepartment($user->department);
        if ($userDept === '') {
            return false;
        }

        $targets = is_array($issue->target_departments)
            ? $issue->target_departments
            : (json_decode((string) $issue->target_departments, true) ?: []);

        foreach ($targets as $target) {
            if (strcasecmp(self::normalizeDepartment((string) $target), $userDept) === 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * Enforce department ownership authorization on status-changing endpoints.
     */
    protected function authorizeDepartmentAction(LeanIssue $issue): User
    {
        $user = auth()->user();
        if (!$user) {
            abort(403, 'Silakan login terlebih dahulu untuk mengubah status isu.');
        }

        if (!self::canUserManageIssue($user, $issue)) {
            $targetsStr = implode(', ', is_array($issue->target_departments) ? $issue->target_departments : []);
            abort(403, "Akses ditolak: Hanya akun dari departemen tujuan ({$targetsStr}) atau Admin yang dapat mengubah status isu ini.");
        }

        return $user;
    }

    /**
     * Resolve reporter WhatsApp number from active approved staff records when phone input is left blank.
     */
    protected function resolveReporterPhoneFallback(?string $submittedPhone, string $reporterName, ?string $reporterDept = null): ?string
    {
        $cleanSubmitted = trim((string) $submittedPhone);
        if ($cleanSubmitted !== '') {
            return $cleanSubmitted;
        }

        $targetName = mb_strtolower(trim($reporterName));
        if ($targetName === '') {
            return null;
        }

        $matches = User::activeApproved()
            ->whereNotNull('whatsapp_number')
            ->where('whatsapp_number', '!=', '')
            ->get(['id', 'name', 'staff_name', 'department', 'whatsapp_number'])
            ->filter(function (User $u) use ($targetName) {
                $staffLower = mb_strtolower(trim((string) $u->staff_name));
                $nameLower = mb_strtolower(trim((string) $u->name));
                return $staffLower === $targetName || $nameLower === $targetName;
            })
            ->values();

        if ($matches->count() === 1) {
            return trim((string) $matches->first()->whatsapp_number) ?: null;
        }

        if ($matches->count() > 1 && !empty($reporterDept)) {
            $normDept = self::normalizeDepartment($reporterDept);
            $deptMatches = $matches->filter(function (User $u) use ($normDept) {
                return strcasecmp(self::normalizeDepartment((string) $u->department), $normDept) === 0;
            })->values();

            if ($deptMatches->count() === 1) {
                return trim((string) $deptMatches->first()->whatsapp_number) ?: null;
            }
        }

        return null;
    }

    /**
     * Resolve reporter WhatsApp number for an existing issue, falling back to staff directory lookup.
     */
    protected function resolveIssueReporterPhone(LeanIssue $issue): ?string
    {
        return $this->resolveReporterPhoneFallback(
            $issue->reporter_phone,
            (string) $issue->reporter_name,
            $issue->reporter_dept
        );
    }

    /**
     * Display the mobile-first lean dashboard.
     */
    public function index(Request $request)
    {
        $authUser = auth()->user();

        $issues = LeanIssue::orderBy('created_at', 'desc')->get()->map(function ($item) use ($authUser) {
            $code = self::formatIssueCode($item);
            $imageUrl = $item->image_url ? (parse_url($item->image_url, PHP_URL_PATH) ?: $item->image_url) : null;
            $resImageUrl = $item->resolution_image_url ? (parse_url($item->resolution_image_url, PHP_URL_PATH) ?: $item->resolution_image_url) : null;

            return [
                'id'                   => $item->id,
                'issue_code'           => $code,
                'location'             => $item->location,
                'title'                => $item->title,
                'description'          => $item->description,
                'target_departments'   => $item->target_departments ?? [],
                'reporter_name'        => $item->reporter_name,
                'reporter_dept'        => $item->reporter_dept,
                'reporter_phone'       => $item->reporter_phone,
                'image_url'            => $imageUrl,
                'status'               => $item->status,
                'department_accs'      => $item->department_accs ?? [],
                'claimed_by_name'      => $item->claimed_by_name,
                'claimed_by_dept'      => $item->claimed_by_dept,
                'claimed_at'           => $item->claimed_at ? $item->claimed_at->toIso8601String() : null,
                'initial_workers'      => $item->initial_workers ?? [],
                'progress_workers'     => $item->progress_workers ?? [],
                'active_workers'       => $item->active_workers ?? [],
                'contributors'         => $item->contributors ?? [],
                'progress_logs'        => $item->progress_logs ?? [],
                'pending_reason'       => $item->pending_reason,
                'pending_since'        => $item->pending_since ? $item->pending_since->toIso8601String() : null,
                'resolved_by_name'     => $item->resolved_by_name,
                'resolved_by_dept'     => $item->resolved_by_dept,
                'resolved_at'          => $item->resolved_at ? $item->resolved_at->toIso8601String() : null,
                'resolution_note'      => $item->resolution_note,
                'resolution_image_url' => $resImageUrl,
                'created_at'           => $item->created_at ? $item->created_at->toIso8601String() : null,
                'created_at_human'     => $item->created_at ? $item->created_at->locale('id')->diffForHumans() : '',
                'transfer_history'     => $item->transfer_history ?? [],
                'can_manage'           => self::canUserManageIssue($authUser, $item),
            ];
        });

        $currentUser = $authUser ? [
            'id'         => $authUser->id,
            'name'       => $authUser->name,
            'staff_name' => $authUser->staff_name ?: $authUser->name,
            'department' => $authUser->department,
            'is_admin'   => $authUser->role === 'admin',
        ] : null;

        $spreadsheetId = config('services.google.lean_spreadsheet_id') ?: env('GOOGLE_LEAN_SPREADSHEET_ID', '1hF2X6DrcWvOv4h77T_B4pmcNklO2-Zq2CzAiAR-UYIg');
        $spreadsheetUrl = "https://docs.google.com/spreadsheets/d/{$spreadsheetId}/edit?usp=sharing";
        $monthGids = app(\App\Services\LeanSheetDirectService::class)->getMonthGids();

        $staffDirectory = User::activeApproved()
            ->select('id', 'name', 'staff_name', 'department', 'subdivision', 'whatsapp_number')
            ->orderBy('name')
            ->get()
            ->map(function ($u) {
                return [
                    'id'              => $u->id,
                    'name'            => $u->staff_name ?: $u->name,
                    'department'      => $u->department,
                    'subdivision'     => $u->subdivision,
                    'whatsapp_number' => $u->whatsapp_number,
                ];
            });

        $pendingSyncCount = LeanIssue::withTrashed()->where('needs_sheets_sync', true)->count();
        $needsAutoReconcile = $pendingSyncCount > 0 || \App\Services\LeanSheetDirectService::hasPendingClear();

        return Inertia::render('Lean/Index', [
            'issues'             => $issues,
            'departments'        => self::DEPARTMENTS,
            'locations'          => self::MAIN_LOCATIONS,
            'currentUser'        => $currentUser,
            'staffDirectory'     => $staffDirectory,
            'spreadsheetUrl'     => $spreadsheetUrl,
            'monthGids'          => $monthGids,
            'needsAutoReconcile' => $needsAutoReconcile,
        ]);
    }

    /**
     * Store a newly created lean issue in the sandbox.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'location'           => 'required|string|max:255',
            'title'              => 'required|string|max:255',
            'description'        => 'nullable|string|max:5000',
            'target_departments' => 'nullable|array',
            'target_departments.*' => 'string|max:50',
            'reporter_name'      => 'required|string|max:100',
            'reporter_dept'      => 'nullable|string|max:100',
            'reporter_phone'     => 'nullable|string|max:30',
            'image'              => 'nullable|image|max:10240',
            'reported_at'        => 'nullable|date',
            'start_in_progress'  => 'nullable',
        ]);

        $imageUrl = null;
        if ($request->hasFile('image')) {
            $file = $request->file('image');
            $filename = 'lean_' . time() . '_' . Str::random(8) . '.' . $file->getClientOriginalExtension();
            $file->move(public_path('uploads'), $filename);
            $imageUrl = '/uploads/' . $filename;
        }

        $currentUser = auth()->user();
        $receiverName = $currentUser ? ($currentUser->staff_name ?: $currentUser->name) : 'Leader Lapangan';
        $receiverDept = $currentUser && !empty($currentUser->department)
            ? $currentUser->department
            : 'Umum';

        $targetDepts = !empty($validated['target_departments'])
            ? $validated['target_departments']
            : [$receiverDept];

        $startInProgress = filter_var($request->input('start_in_progress', false), FILTER_VALIDATE_BOOLEAN);

        // Assigned workers resolution (multi-select array or comma-separated string)
        $rawWorkers = $request->input('assigned_workers');
        $workersList = [];
        $workerNames = null;
        if ($startInProgress) {
            $workersList = LeanIssue::normalizeWorkerList($rawWorkers);
            if (empty($workersList)) {
                $workersList = [$receiverName];
            }
            $workerNames = implode(', ', $workersList);
        }

        $accs = [];
        foreach ($targetDepts as $dept) {
            $isReceiverDept = strcasecmp(self::normalizeDepartment($dept), self::normalizeDepartment($receiverDept)) === 0;
            $accs[$dept] = [
                'is_acc' => $isReceiverDept,
                'acc_by' => $isReceiverDept ? $receiverName : null,
                'acc_at' => $isReceiverDept ? Carbon::now('Asia/Jakarta')->toIso8601String() : null,
            ];
        }

        $resolvedReporterPhone = $this->resolveReporterPhoneFallback(
            $validated['reporter_phone'] ?? null,
            $validated['reporter_name'],
            $validated['reporter_dept'] ?? null
        );

        $issue = new LeanIssue([
            'location'           => $validated['location'],
            'title'              => $validated['title'],
            'description'        => $validated['description'] ?? null,
            'target_departments' => $targetDepts,
            'reporter_name'      => $validated['reporter_name'],
            'reporter_dept'      => !empty($validated['reporter_dept']) ? $validated['reporter_dept'] : null,
            'reporter_phone'     => $resolvedReporterPhone,
            'image_url'          => $imageUrl,
            'status'             => $startInProgress ? 'in_progress' : 'open',
            'department_accs'    => $accs,
            'claimed_by_name'    => $workerNames,
            'claimed_by_dept'    => $startInProgress ? $receiverDept : null,
            'claimed_at'         => $startInProgress ? Carbon::now('Asia/Jakarta') : null,
            'initial_workers'    => $startInProgress ? $workersList : [],
            'progress_workers'   => $startInProgress ? $workersList : [],
            'active_workers'     => $startInProgress ? $workersList : [],
            'contributors'       => $startInProgress ? $workersList : [],
        ]);

        if ($startInProgress) {
            $issue->addProgressLog(
                'claim',
                $receiverName,
                $receiverDept,
                'Langsung mulai dikerjakan saat laporan dicatat.',
                ['workers' => $workersList, 'active_workers' => $workersList]
            );
        }

        if (!empty($validated['reported_at'])) {
            try {
                $issue->created_at = \Carbon\Carbon::parse($validated['reported_at']);
            } catch (\Throwable $t) {
                Log::warning('Failed parsing reported_at for LeanIssue: ' . $t->getMessage());
            }
        }

        $issue->save();

        // Dispatch automated WhatsApp notifications (reporter DM + target groups)
        $this->notifyReporterCreated($issue, $receiverName, $receiverDept, $workerNames);
        $this->notifyGroupsCreated($issue, $receiverName, $receiverDept, $workerNames);

        // Failsafe Google Sheets sync
        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on store: ' . $e->getMessage());
        }

        if (!$request->header('X-Inertia') && ($request->wantsJson() || $request->ajax())) {
            return response()->json([
                'success' => true,
                'message' => 'Laporan berhasil dibuat!',
                'issue'   => $issue,
            ]);
        }

        return redirect()->back()->with('success', 'Laporan berhasil dibuat!');
    }

    /**
     * Mark readiness / ACC for a specific department.
     */
    public function acc(Request $request, LeanIssue $issue)
    {
        $this->authorizeDepartmentAction($issue);

        $validator = Validator::make($request->all(), [
            'dept'       => 'required|string|max:50',
            'staff_name' => 'required|string|max:100',
        ]);
        if ($validator->fails()) {
            return $this->actionErrorResponse($request, $validator->errors()->first(), 422, $validator->errors()->toArray());
        }

        $accs = $issue->department_accs ?? [];
        $dept = $request->input('dept');
        $staffName = $request->input('staff_name');

        $accs[$dept] = [
            'is_acc' => true,
            'acc_by' => $staffName,
            'acc_at' => Carbon::now('Asia/Jakarta')->toIso8601String(),
        ];

        $issue->department_accs = $accs;
        $issue->save();

        $this->syncIssueToSheets($issue, 'acc');

        return $this->actionSuccessResponse($request, $issue, "Departemen {$dept} berhasil ACC / Siap!");
    }

    /**
     * Claim / Start (or resume from Pending) working on an issue with multi-select workers.
     */
    public function claim(Request $request, LeanIssue $issue)
    {
        $user = $this->authorizeDepartmentAction($issue);

        if ($issue->status === 'resolved') {
            return $this->actionErrorResponse($request, 'Isu yang sudah selesai tidak dapat diambil ulang.', 422);
        }

        $validator = Validator::make($request->all(), [
            'workers'         => 'nullable|array|min:1',
            'workers.*'       => 'string|max:100',
            'staff_name'      => 'nullable|string|max:255',
            'dept'            => 'nullable|string|max:50',
            'note'            => 'nullable|string|max:1000',
            'notify_reporter' => 'nullable',
        ], [
            'workers.min' => 'Pilih minimal 1 pekerja yang mengerjakan.',
        ]);
        if ($validator->fails()) {
            return $this->actionErrorResponse($request, $validator->errors()->first(), 422, $validator->errors()->toArray());
        }

        $actorName = $user->staff_name ?: $user->name;
        $rawDept = $user->isAdmin() && $request->filled('dept')
            ? $request->input('dept')
            : ($user->department ?: ($request->input('dept') ?: ($issue->target_departments[0] ?? 'Umum')));
        $dept = self::normalizeDepartment($rawDept) ?: ($issue->target_departments[0] ?? 'Umum');

        $rawWorkers = $request->input('workers');
        if (empty($rawWorkers) && $request->filled('staff_name')) {
            $rawWorkers = $request->input('staff_name');
        }
        $workersList = LeanIssue::normalizeWorkerList($rawWorkers);
        if (empty($workersList)) {
            $workersList = [$actorName];
        }
        $workersStr = implode(', ', $workersList);

        $wasPending = $issue->status === 'pending';
        $note = trim((string) $request->input('note', ''));
        $notifyReporter = $request->has('notify_reporter')
            ? filter_var($request->input('notify_reporter'), FILTER_VALIDATE_BOOLEAN)
            : true;

        // Record initial workers only on first claim so evaluation retains who took the issue initially
        if (empty($issue->initial_workers)) {
            $issue->initial_workers = $workersList;
        }
        $issue->active_workers = $workersList;
        $issue->progress_workers = LeanIssue::mergeUniqueNames($issue->progress_workers, $workersList);
        $issue->contributors = LeanIssue::mergeUniqueNames($issue->contributors, $workersList);

        // Automatically set ACC for this department
        $accs = $issue->department_accs ?? [];
        $matchedKey = null;
        foreach ($accs as $d => $val) {
            if (strcasecmp(self::normalizeDepartment((string) $d), $dept) === 0) {
                $matchedKey = $d;
                break;
            }
        }
        $accKey = $matchedKey ?: $dept;
        $accs[$accKey] = [
            'is_acc' => true,
            'acc_by' => $workersStr,
            'acc_at' => Carbon::now('Asia/Jakarta')->toIso8601String(),
        ];
        $issue->department_accs = $accs;

        $issue->status = 'in_progress';
        $issue->claimed_by_name = $workersStr;
        $issue->claimed_by_dept = $dept;
        if (!$issue->claimed_at) {
            $issue->claimed_at = Carbon::now('Asia/Jakarta');
        }
        $issue->pending_reason = null;
        $issue->pending_since = null;

        $logType = $wasPending ? 'progress' : 'claim';
        $logMsg = $note !== ''
            ? $note
            : ($wasPending ? 'Melanjutkan kembali ke tahap Progress.' : 'Mulai dikerjakan.');

        $issue->addProgressLog($logType, $actorName, $dept, $logMsg, [
            'workers'        => $workersList,
            'active_workers' => $workersList,
            'notified_wa'    => false,
        ]);

        $issue->save();

        $waSent = false;
        if (!$wasPending || $notifyReporter) {
            $waSent = $this->notifyReporterClaimed($issue, $workersStr, $dept, $wasPending, $note);
        }

        if ($wasPending && $waSent) {
            $logs = $issue->progress_logs ?? [];
            if (!empty($logs)) {
                $logs[count($logs) - 1]['notified_wa'] = true;
                $issue->progress_logs = $logs;
                $issue->save();
            }
        }

        $this->notifyGroupsClaimed($issue, $workersStr, $dept, $wasPending, $note);
        $this->syncIssueToSheets($issue, 'claim');

        $successText = $wasPending
            ? "Isu dilanjutkan ke tahap Progress oleh {$workersStr} ({$dept})."
            : "Isu mulai dikerjakan oleh {$workersStr} ({$dept}).";

        return $this->actionSuccessResponse($request, $issue, $successText);
    }

    /**
     * Add progress comment and/or add/remove active workers while In Progress.
     */
    public function updateProgress(Request $request, LeanIssue $issue)
    {
        $user = $this->authorizeDepartmentAction($issue);

        if ($issue->status !== 'in_progress') {
            return $this->actionErrorResponse($request, 'Komentar progress & perubahan tim hanya dapat dilakukan saat status In Progress.', 422);
        }

        $validator = Validator::make($request->all(), [
            'comment'         => 'nullable|string|max:2000',
            'workers'         => 'nullable|array',
            'workers.*'       => 'string|max:100',
            'notify_reporter' => 'nullable',
        ]);
        if ($validator->fails()) {
            return $this->actionErrorResponse($request, $validator->errors()->first(), 422, $validator->errors()->toArray());
        }

        $comment = trim((string) $request->input('comment', ''));
        $notifyReporter = $request->has('notify_reporter')
            ? filter_var($request->input('notify_reporter'), FILTER_VALIDATE_BOOLEAN)
            : true;

        $previousWorkers = !empty($issue->active_workers)
            ? $issue->active_workers
            : LeanIssue::normalizeWorkerList($issue->claimed_by_name);

        if ($request->has('workers')) {
            $newWorkers = LeanIssue::normalizeWorkerList($request->input('workers', []));
            if (empty($newWorkers)) {
                return $this->actionErrorResponse($request, 'Minimal harus ada 1 pekerja aktif saat status In Progress.', 422, [
                    'workers' => 'Minimal pilih 1 pekerja aktif.',
                ]);
            }
        } else {
            $newWorkers = $previousWorkers;
        }

        $prevLower = array_map('mb_strtolower', $previousWorkers);
        $newLower = array_map('mb_strtolower', $newWorkers);

        $addedWorkers = array_values(array_filter($newWorkers, fn ($w) => !in_array(mb_strtolower($w), $prevLower, true)));
        $removedWorkers = array_values(array_filter($previousWorkers, fn ($w) => !in_array(mb_strtolower($w), $newLower, true)));

        if ($comment === '' && empty($addedWorkers) && empty($removedWorkers)) {
            return $this->actionErrorResponse($request, 'Mohon isi komentar perkembangan atau ubah daftar pekerja aktif.', 422, [
                'comment' => 'Isi komentar atau ubah tim pekerja.',
            ]);
        }

        $actorName = $user->staff_name ?: $user->name;
        $actorDept = self::normalizeDepartment($user->department) ?: ($issue->target_departments[0] ?? 'Umum');

        $issue->active_workers = $newWorkers;
        if (!empty($newWorkers)) {
            $issue->claimed_by_name = implode(', ', $newWorkers);
        }
        // Accumulate into historical progress & contributor rosters (do not remove past workers)
        $issue->progress_workers = LeanIssue::mergeUniqueNames($issue->progress_workers, $newWorkers);
        $issue->contributors = LeanIssue::mergeUniqueNames($issue->contributors, $newWorkers);

        $diffParts = [];
        if (!empty($addedWorkers)) {
            $diffParts[] = 'Ditambah: ' . implode(', ', $addedWorkers);
        }
        if (!empty($removedWorkers)) {
            $diffParts[] = 'Dikurangi: ' . implode(', ', $removedWorkers);
        }
        $diffText = implode(' | ', $diffParts);
        $fullMessage = $comment !== ''
            ? ($diffText !== '' ? "{$comment} ({$diffText})" : $comment)
            : "Perubahan tim pelaksana ({$diffText})";

        $issue->addProgressLog('progress', $actorName, $actorDept, $fullMessage, [
            'workers'         => $newWorkers,
            'added_workers'   => $addedWorkers,
            'removed_workers' => $removedWorkers,
            'notified_wa'     => $notifyReporter,
        ]);

        $issue->save();

        if ($notifyReporter) {
            $this->notifyReporterProgress($issue, $actorName, $actorDept, $comment, $newWorkers, $addedWorkers, $removedWorkers);
        }
        $this->notifyGroupsProgress($issue, $actorName, $actorDept, $comment, $newWorkers, $addedWorkers, $removedWorkers);

        $this->syncIssueToSheets($issue, 'progress');

        return $this->actionSuccessResponse($request, $issue, 'Update progress dan tim pekerja berhasil disimpan!');
    }

    /**
     * Mark issue as Pending (from open, in_progress, or pending again) with a mandatory reason.
     */
    public function pending(Request $request, LeanIssue $issue)
    {
        $user = $this->authorizeDepartmentAction($issue);

        if ($issue->status === 'resolved') {
            return $this->actionErrorResponse($request, 'Isu yang sudah selesai tidak dapat diubah menjadi Pending.', 422);
        }

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:1000',
        ], [
            'reason.required' => 'Alasan pending wajib diisi.',
        ]);
        if ($validator->fails()) {
            return $this->actionErrorResponse($request, $validator->errors()->first(), 422, $validator->errors()->toArray());
        }
        $validated = $validator->validated();

        $reason = trim($validated['reason']);
        if ($reason === '') {
            return $this->actionErrorResponse($request, 'Alasan pending wajib diisi.', 422, [
                'reason' => 'Alasan pending wajib diisi.',
            ]);
        }

        $actorName = $user->staff_name ?: $user->name;
        $actorDept = self::normalizeDepartment($user->department) ?: ($issue->target_departments[0] ?? 'Umum');
        $isUpdatePending = $issue->status === 'pending';

        $issue->status = 'pending';
        $issue->pending_reason = $reason;
        $issue->resolution_note = "Pending: {$reason}";
        if (!$issue->pending_since) {
            $issue->pending_since = Carbon::now('Asia/Jakarta');
        }

        $issue->addProgressLog(
            'pending',
            $actorName,
            $actorDept,
            ($isUpdatePending ? 'Update alasan pending: ' : 'Ditunda (Pending): ') . $reason,
            ['pending_reason' => $reason]
        );

        $issue->save();

        $this->notifyReporterPending($issue, $actorName, $actorDept, $reason, $isUpdatePending);
        $this->notifyGroupsPending($issue, $actorName, $actorDept, $reason, $isUpdatePending);
        $this->syncIssueToSheets($issue, 'pending');

        return $this->actionSuccessResponse($request, $issue, $isUpdatePending ? 'Alasan pending berhasil diperbarui.' : 'Isu berhasil ditandai Pending.');
    }

    /**
     * Mark an issue as solved / resolved (required note, optional photo, cumulative contributors).
     */
    public function resolve(Request $request, LeanIssue $issue)
    {
        $user = $this->authorizeDepartmentAction($issue);

        if ($issue->status === 'resolved') {
            return $this->actionErrorResponse($request, 'Isu ini sudah ditandai selesai sebelumnya.', 422);
        }

        $validator = Validator::make($request->all(), [
            'note'            => 'required|string|max:2000',
            'proof_image'     => 'nullable|image|max:10240',
            'final_workers'   => 'nullable|array',
            'final_workers.*' => 'string|max:100',
            'staff_name'      => 'nullable|string|max:255',
            'dept'            => 'nullable|string|max:50',
        ], [
            'note.required' => 'Deskripsi penyelesaian wajib diisi.',
        ]);
        if ($validator->fails()) {
            return $this->actionErrorResponse($request, $validator->errors()->first(), 422, $validator->errors()->toArray());
        }
        $validated = $validator->validated();

        $note = trim($validated['note']);
        if ($note === '') {
            return $this->actionErrorResponse($request, 'Deskripsi penyelesaian wajib diisi.', 422, [
                'note' => 'Deskripsi penyelesaian wajib diisi.',
            ]);
        }

        $resolutionImageUrl = null;
        if ($request->hasFile('proof_image')) {
            $file = $request->file('proof_image');
            $filename = 'lean_solve_' . time() . '_' . Str::random(8) . '.' . $file->getClientOriginalExtension();
            $file->move(public_path('uploads'), $filename);
            $resolutionImageUrl = '/uploads/' . $filename;
        }

        $actorName = $user->staff_name ?: $user->name;
        $rawDept = $user->isAdmin() && $request->filled('dept')
            ? $request->input('dept')
            : ($user->department ?: ($request->input('dept') ?: ($issue->target_departments[0] ?? 'Umum')));
        $dept = self::normalizeDepartment($rawDept) ?: 'Umum';

        $finalWorkers = LeanIssue::normalizeWorkerList($request->input('final_workers'));
        if (empty($finalWorkers) && $request->filled('staff_name')) {
            $finalWorkers = LeanIssue::normalizeWorkerList($request->input('staff_name'));
        }
        if (empty($finalWorkers)) {
            $finalWorkers = !empty($issue->active_workers)
                ? $issue->active_workers
                : [$actorName];
        }
        $finalWorkersStr = implode(', ', $finalWorkers);

        $issue->status = 'resolved';
        $issue->resolved_by_name = $finalWorkersStr;
        $issue->resolved_by_dept = $dept;
        $issue->resolved_at = Carbon::now('Asia/Jakarta');
        $issue->resolution_note = $note;
        if ($resolutionImageUrl) {
            $issue->resolution_image_url = $resolutionImageUrl;
        }
        $issue->pending_reason = null;
        $issue->pending_since = null;
        $issue->active_workers = [];
        $issue->contributors = LeanIssue::mergeUniqueNames($issue->contributors, $finalWorkers);

        $issue->addProgressLog('resolved', $actorName, $dept, $note, [
            'workers'      => $finalWorkers,
            'contributors' => $issue->contributors,
            'has_photo'    => (bool) $resolutionImageUrl,
        ]);

        $issue->save();

        // Dispatch automated WhatsApp completion notifications (reporter DM + target groups)
        $this->notifyReporterResolved($issue, $finalWorkersStr, $dept, $note);
        $this->notifyGroupsResolved($issue, $finalWorkersStr, $dept, $note);
        $this->syncIssueToSheets($issue, 'resolve');

        return $this->actionSuccessResponse($request, $issue, 'Masalah berhasil ditandai selesai!');
    }

    /**
     * Transfer / redirect an issue to another department ("Alihkan ke Dept Lain") with mandatory reason.
     */
    public function transfer(Request $request, LeanIssue $issue)
    {
        $user = $this->authorizeDepartmentAction($issue);

        if ($issue->status === 'resolved') {
            return $this->actionErrorResponse($request, 'Isu yang sudah selesai tidak dapat dialihkan ke departemen lain.', 422);
        }

        $validator = Validator::make($request->all(), [
            'to_department' => 'required|string|max:100',
            'reason'        => 'required|string|max:1000',
        ], [
            'to_department.required' => 'Departemen tujuan baru wajib dipilih.',
            'reason.required'        => 'Alasan pengalihan departemen wajib diisi.',
        ]);
        if ($validator->fails()) {
            return $this->actionErrorResponse($request, $validator->errors()->first(), 422, $validator->errors()->toArray());
        }
        $validated = $validator->validated();

        $toDept = self::normalizeDepartment($validated['to_department']) ?: trim($validated['to_department']);
        $reason = trim($validated['reason']);
        $oldDepts = is_array($issue->target_departments) ? $issue->target_departments : [];
        $oldDept = $oldDepts[0] ?? 'Umum';

        if (count($oldDepts) === 1 && strcasecmp(self::normalizeDepartment((string) $oldDept), $toDept) === 0) {
            return $this->actionErrorResponse($request, "Isu ini sudah ditujukan ke departemen {$toDept}. Pilih departemen tujuan lain.", 422, [
                'to_department' => 'Pilih departemen lain yang berbeda dari departemen saat ini.',
            ]);
        }

        $actorName = $user->staff_name ?: $user->name;
        $actorDept = self::normalizeDepartment($user->department) ?: $oldDept;

        $history = $issue->transfer_history ?? [];
        $history[] = [
            'from_department'      => implode(', ', $oldDepts) ?: $oldDept,
            'to_department'        => $toDept,
            'reason'               => $reason,
            'transferred_by'       => $actorName,
            'transferred_by_dept'  => $actorDept,
            'transferred_by_phone' => $user->whatsapp_number ?? '',
            'transferred_at'       => Carbon::now('Asia/Jakarta')->toIso8601String(),
        ];

        $issue->target_departments = [$toDept];
        $issue->status = 'open';
        $issue->active_workers = [];
        $issue->claimed_by_name = null;
        $issue->claimed_by_dept = null;
        $issue->claimed_at = null;
        $issue->pending_reason = null;
        $issue->pending_since = null;
        $issue->department_accs = [
            $toDept => [
                'is_acc' => false,
                'acc_by' => null,
                'acc_at' => null,
            ],
        ];
        $issue->transfer_history = $history;

        $issue->addProgressLog(
            'transfer',
            $actorName,
            $actorDept,
            "Dialihkan dari {$oldDept} ke {$toDept}: {$reason}",
            [
                'from_department' => $oldDept,
                'to_department'   => $toDept,
                'reason'          => $reason,
            ]
        );

        $issue->save();

        $this->notifyReporterTransferred($issue, $oldDept, $toDept, $actorName, $reason);
        $this->notifyGroupsTransferred($issue, $oldDepts, $oldDept, $toDept, $actorName, $reason);
        $this->syncIssueToSheets($issue, 'transfer');

        return $this->actionSuccessResponse($request, $issue, "Isu berhasil dialihkan ke departemen {$toDept}.");
    }

    protected function syncIssueToSheets(LeanIssue $issue, string $context): void
    {
        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error("Sheets sync error on {$context}: " . $e->getMessage());
        }
    }

    protected function actionSuccessResponse(Request $request, LeanIssue $issue, string $message)
    {
        if (!$request->header('X-Inertia') && ($request->wantsJson() || $request->ajax())) {
            return response()->json([
                'success' => true,
                'message' => $message,
                'issue'   => $issue->fresh(),
            ]);
        }

        return redirect()->back()->with('success', $message);
    }

    protected function actionErrorResponse(Request $request, string $message, int $status = 422, array $errors = [])
    {
        if (!$request->header('X-Inertia') && ($request->wantsJson() || $request->ajax())) {
            return response()->json([
                'success' => false,
                'message' => $message,
                'errors'  => $errors ?: ['error' => [$message]],
            ], $status);
        }

        return redirect()->back()->with('error', $message)->withErrors($errors);
    }

    /**
     * Soft delete an issue (mark as inactive 0 in Google Sheets, hidden from dashboard).
     */
    public function destroy(Request $request, LeanIssue $issue, GoogleSheetsSyncService $sheetsService)
    {
        $deletedBy = auth()->check() ? auth()->user()->name : ($request->input('deleted_by') ?: 'Supervisor');
        
        $issue->deleted_by_name = $deletedBy;
        $issue->save();
        $issue->delete();

        try {
            $sheetsService->syncIssue($issue, true, $deletedBy);
            app(\App\Services\LeanSheetDirectService::class)->deleteSingleIssue($issue, $deletedBy);
        } catch (\Throwable $e) {
            Log::error('Google Sheets sync on destroy failed: ' . $e->getMessage());
        }

        if (!$request->header('X-Inertia') && ($request->wantsJson() || $request->ajax())) {
            return response()->json([
                'success' => true,
                'message' => 'Tiket berhasil dihapus dari dashboard.',
            ]);
        }

        return redirect()->back()->with('success', 'Tiket berhasil dihapus dari dashboard.');
    }

    /**
     * Trigger full sync of all issues and locations to Google Sheets.
     */
    public function syncGoogleSheets(Request $request, GoogleSheetsSyncService $sheetsService)
    {
        $result = $sheetsService->syncAll();

        try {
            app(\App\Services\LeanSheetDirectService::class)->syncAllIssues();
        } catch (\Throwable $e) {
            Log::error('LeanSheetDirectService syncAll failed: ' . $e->getMessage());
        }

        if (!$request->header('X-Inertia') && ($request->wantsJson() || $request->ajax())) {
            return response()->json($result);
        }

        return redirect()->back()->with(
            $result['success'] ? 'success' : 'error',
            $result['message']
        );
    }

    /**
     * Silent self-healing reconciliation endpoint for pending SQL-to-Sheets changes.
     */
    public function autoSyncSheets()
    {
        $result = app(\App\Services\LeanSheetDirectService::class)->reconcilePendingIssues();
        return response()->json($result);
    }

    /**
     * Reset / purge all sandbox testing data.
     */
    public function reset()
    {
        LeanIssue::truncate();
        \App\Services\LeanSheetDirectService::markPendingClear();

        try {
            app(\App\Services\LeanSheetDirectService::class)->clearAllMonthlyData();
        } catch (\Throwable $e) {
            Log::error('LeanSheetDirectService clearAllMonthlyData failed on reset: ' . $e->getMessage());
        }

        return redirect()->back()->with('success', 'Seluruh data simulasi pengujian berhasil direset dan lembar kerja Google Sheets telah dibersihkan.');
    }

    /**
     * Helper to format human-readable issue codes like ENG-221026-1
     */
    public static function formatIssueCode($issue)
    {
        $dept = is_array($issue->target_departments) ? ($issue->target_departments[0] ?? 'GEN') : ($issue->target_departments ?? 'GEN');
        $deptCode = strtoupper(substr($dept, 0, 3));
        $dateStr = $issue->created_at ? $issue->created_at->format('dmy') : date('dmy');
        return "{$deptCode}-{$dateStr}-{$issue->id}";
    }

    /**
     * Helper to find LeanIssue by numeric ID or formatted code
     */
    public static function findIssueByIdOrCode($idOrCode)
    {
        $clean = trim(str_replace('#', '', (string)$idOrCode));
        if (is_numeric($clean)) {
            return LeanIssue::find((int)$clean);
        }
        if (preg_match('/-(\d+)$/', $clean, $m)) {
            return LeanIssue::find((int)$m[1]);
        }
        return LeanIssue::where('id', $clean)->first();
    }

    /**
     * API: List all lean issues for bot testing
     */
    public function apiIndex()
    {
        $issues = LeanIssue::orderBy('created_at', 'desc')->get()->map(function ($item) {
            $code = self::formatIssueCode($item);
            $dept = is_array($item->target_departments) ? ($item->target_departments[0] ?? 'General') : ($item->target_departments ?? 'General');
            return [
                'id'                   => $code,
                'raw_id'               => $item->id,
                'location'             => $item->location,
                'title'                => $item->title,
                'description'          => $item->description,
                'department'           => $dept,
                'assignedDepartments'  => is_array($item->target_departments) ? $item->target_departments : [$dept],
                'reporter'             => $item->reporter_name,
                'reporter_dept'        => $item->reporter_dept,
                'image_url'            => $item->image_url,
                'imageUrl'             => $item->image_url,
                'status'               => $item->status,
                'taker'                => $item->claimed_by_name,
                'claimed_by_dept'      => $item->claimed_by_dept,
                'claimed_at'           => $item->claimed_at ? $item->claimed_at->toIso8601String() : null,
                'initial_workers'      => $item->initial_workers ?? [],
                'progress_workers'     => $item->progress_workers ?? [],
                'active_workers'       => $item->active_workers ?? [],
                'contributors'         => $item->contributors ?? [],
                'progress_logs'        => $item->progress_logs ?? [],
                'pending_reason'       => $item->pending_reason,
                'pending_since'        => $item->pending_since ? $item->pending_since->toIso8601String() : null,
                'solver'               => $item->resolved_by_name,
                'resolved_by_dept'     => $item->resolved_by_dept,
                'resolved_at'          => $item->resolved_at ? $item->resolved_at->format('d/m/Y H:i') . ' WIB' : null,
                'resolved_at_raw'      => $item->resolved_at ? $item->resolved_at->toIso8601String() : null,
                'fixDescription'       => $item->resolution_note,
                'proofImageUrl'        => $item->resolution_image_url,
                'transfer_history'     => $item->transfer_history ?? [],
                'created_at'           => $item->created_at ? $item->created_at->format('d/m/Y H:i') . ' WIB' : null,
                'created_at_raw'       => $item->created_at ? $item->created_at->toIso8601String() : null,
                'created_at_human'     => $item->created_at ? $item->created_at->locale('id')->diffForHumans() : '',
            ];
        });

        return response()->json([
            'success' => true,
            'data'    => $issues,
        ]);
    }

    /**
     * API: Store issue from WhatsApp Bot V2
     */
    public function apiStore(Request $request)
    {
        $validated = $request->validate([
            'title'          => 'required|string|max:255',
            'description'    => 'nullable|string|max:5000',
            'location'       => 'required|string|max:255',
            'department'     => 'required|string|max:100',
            'reporter'       => 'required|string|max:255',
            'reporter_dept'  => 'nullable|string|max:100',
            'reporter_phone' => 'nullable|string|max:30',
            'source'         => 'nullable|string|max:50',
            'image'          => 'nullable|image|max:10240',
        ]);

        $imageUrl = null;
        if ($request->hasFile('image')) {
            $file = $request->file('image');
            $filename = 'lean_' . time() . '_' . Str::random(8) . '.' . $file->getClientOriginalExtension();
            $file->move(public_path('uploads'), $filename);
            $imageUrl = '/uploads/' . $filename;
        }

        $targetDept = self::normalizeDepartment($validated['department']) ?: trim($validated['department']);
        $reporterDept = trim((string) ($validated['reporter_dept'] ?? $request->input('reporter_dept', 'Umum'))) ?: 'Umum';
        $resolvedReporterPhone = $this->resolveReporterPhoneFallback(
            $validated['reporter_phone'] ?? null,
            $validated['reporter'],
            $reporterDept
        );

        $issue = LeanIssue::create([
            'location'           => $validated['location'],
            'title'              => $validated['title'],
            'description'        => $validated['description'] ?? null,
            'target_departments' => [$targetDept],
            'reporter_name'      => $validated['reporter'],
            'reporter_dept'      => $reporterDept,
            'reporter_phone'     => $resolvedReporterPhone,
            'image_url'          => $imageUrl,
            'status'             => 'open',
            'department_accs'    => [
                $targetDept => [
                    'is_acc' => false,
                    'acc_by' => null,
                    'acc_at' => null,
                ]
            ],
        ]);

        // Skip DM confirmation when submitted directly from WhatsApp Bot V2 (bot replies immediately in DM chat)
        if (($validated['source'] ?? '') !== 'whatsapp_bot') {
            $this->notifyReporterCreated($issue, 'WhatsApp Bot', $targetDept);
        }

        // Failsafe Google Sheets sync for WhatsApp Bot V2
        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on apiStore: ' . $e->getMessage());
        }

        $code = self::formatIssueCode($issue);

        return response()->json([
            'success' => true,
            'message' => 'Laporan Lean berhasil dibuat!',
            'data'    => [
                'id'             => $code,
                'raw_id'         => $issue->id,
                'title'          => $issue->title,
                'location'       => $issue->location,
                'department'     => $targetDept,
                'reporter'       => $issue->reporter_name,
                'reporter_phone' => $issue->reporter_phone,
                'status'         => 'open',
                'imageUrl'       => $imageUrl,
            ],
        ]);
    }

    /**
     * API: Claim issue from WhatsApp Bot V2
     */
    public function apiClaim(Request $request, $idOrCode)
    {
        $issue = self::findIssueByIdOrCode($idOrCode);
        if (!$issue) {
            return response()->json(['success' => false, 'message' => 'Isu tidak ditemukan.'], 404);
        }

        $taker = $request->input('taker', 'Staf WhatsApp');
        $rawDept = $request->input('department', is_array($issue->target_departments) ? ($issue->target_departments[0] ?? '') : '');
        $dept = self::normalizeDepartment((string) $rawDept) ?: trim((string) $rawDept);
        $wasPending = $issue->status === 'pending';

        // Automatically set ACC / readiness response for this department
        $accs = $issue->department_accs ?? [];
        $found = false;
        foreach ($accs as $d => $val) {
            if (strcasecmp(self::normalizeDepartment((string) $d), $dept) === 0 || empty($dept)) {
                $accs[$d] = [
                    'is_acc' => true,
                    'acc_by' => $taker,
                    'acc_at' => Carbon::now('Asia/Jakarta')->toIso8601String(),
                ];
                $found = true;
            }
        }
        if (!$found && !empty($dept)) {
            $accs[$dept] = [
                'is_acc' => true,
                'acc_by' => $taker,
                'acc_at' => Carbon::now('Asia/Jakarta')->toIso8601String(),
            ];
        }

        $workersList = LeanIssue::normalizeWorkerList($taker) ?: [$taker];
        if (empty($issue->initial_workers)) {
            $issue->initial_workers = $workersList;
        }
        $issue->active_workers = $workersList;
        $issue->progress_workers = LeanIssue::mergeUniqueNames($issue->progress_workers, $workersList);
        $issue->contributors = LeanIssue::mergeUniqueNames($issue->contributors, $workersList);

        $issue->status = 'in_progress';
        $issue->claimed_by_name = $taker;
        $issue->claimed_by_dept = $dept;
        $issue->claimed_at = $issue->claimed_at ?: Carbon::now('Asia/Jakarta');
        $issue->pending_reason = null;
        $issue->pending_since = null;
        $issue->department_accs = $accs;
        $logType = $wasPending ? 'progress' : 'claim';
        $logMsg = $wasPending ? 'Melanjutkan kembali ke tahap Progress via WhatsApp.' : 'Mulai dikerjakan via WhatsApp.';
        $issue->addProgressLog($logType, $taker, $dept, $logMsg, ['workers' => $workersList]);
        $issue->save();

        // Notify reporting staff DM centrally (bot replies directly in originating group)
        $targetDeptDisplay = !empty($issue->target_departments) ? $issue->target_departments[0] : ($dept ?: 'Resort');
        $this->notifyReporterClaimed($issue, $taker, $targetDeptDisplay, $wasPending);

        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on apiClaim: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => "Tiket berhasil diambil oleh {$taker}.",
            'data'    => [
                'id'     => self::formatIssueCode($issue),
                'status' => 'in_progress',
                'taker'  => $taker,
            ]
        ]);
    }

    /**
     * API: Resolve issue from WhatsApp Bot V2
     */
    public function apiResolve(Request $request, $idOrCode)
    {
        $issue = self::findIssueByIdOrCode($idOrCode);
        if (!$issue) {
            return response()->json(['success' => false, 'message' => 'Isu tidak ditemukan.'], 404);
        }

        $solver = $request->input('solver', 'Staf WhatsApp');
        $fixDesc = $request->input('fixDescription', 'Diselesaikan via WhatsApp Bot V2');
        $targetDept = !empty($issue->target_departments) ? $issue->target_departments[0] : 'Resort';
        $finalWorkers = LeanIssue::normalizeWorkerList($solver) ?: [$solver];

        $issue->status = 'resolved';
        $issue->resolved_by_name = $solver;
        $issue->resolved_by_dept = $targetDept;
        $issue->resolved_at = Carbon::now('Asia/Jakarta');
        $issue->resolution_note = $fixDesc;
        $issue->pending_reason = null;
        $issue->pending_since = null;
        $issue->active_workers = [];
        $issue->contributors = LeanIssue::mergeUniqueNames($issue->contributors, $finalWorkers);
        $issue->addProgressLog('resolved', $solver, $targetDept, $fixDesc, ['workers' => $finalWorkers]);
        $issue->save();

        // Dispatch automated WhatsApp completion notification to the reporting staff
        $this->notifyReporterResolved($issue, $solver, $targetDept, $fixDesc);

        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on apiResolve: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => "Tiket berhasil diselesaikan oleh {$solver}.",
            'data'    => [
                'id'     => self::formatIssueCode($issue),
                'status' => 'resolved',
                'solver' => $solver,
            ]
        ]);
    }

    /**
     * API: Transfer issue to another department from WhatsApp Bot V2
     */
    public function apiTransfer(Request $request, $idOrCode)
    {
        $issue = self::findIssueByIdOrCode($idOrCode);
        if (!$issue) {
            return response()->json(['success' => false, 'message' => 'Isu tidak ditemukan.'], 404);
        }

        $request->validate([
            'to_department'  => 'required|string|max:100',
            'reason'         => 'required|string|max:1000',
            'transferred_by' => 'required|string|max:255',
        ]);

        $oldDepts = is_array($issue->target_departments) ? $issue->target_departments : [];
        $oldDept = $oldDepts[0] ?? 'General';
        $newDept = self::normalizeDepartment($request->input('to_department')) ?: trim((string) $request->input('to_department'));
        $reason = trim($request->input('reason'));
        $transferredBy = trim($request->input('transferred_by'));
        $transferredByPhone = trim($request->input('transferred_by_phone', ''));

        if (count($oldDepts) === 1 && strcasecmp(self::normalizeDepartment((string) $oldDept), $newDept) === 0) {
            return response()->json([
                'success' => false,
                'message' => "Isu ini sudah ditujukan ke departemen {$newDept}. Pilih departemen tujuan lain.",
            ], 422);
        }

        // Record transfer history (unlimited audit trail)
        $history = $issue->transfer_history ?? [];
        $history[] = [
            'from_department'      => implode(', ', $oldDepts) ?: $oldDept,
            'to_department'        => $newDept,
            'reason'               => $reason,
            'transferred_by'       => $transferredBy,
            'transferred_by_phone' => $transferredByPhone,
            'transferred_at'       => Carbon::now('Asia/Jakarta')->toIso8601String(),
        ];

        // Update LeanIssue & reset ACC readiness for new department
        $issue->target_departments = [$newDept];
        $issue->status = 'open';
        $issue->active_workers = [];
        $issue->claimed_by_name = null;
        $issue->claimed_by_dept = null;
        $issue->claimed_at = null;
        $issue->pending_reason = null;
        $issue->pending_since = null;
        $issue->department_accs = [
            $newDept => [
                'is_acc' => false,
                'acc_by' => null,
                'acc_at' => null,
            ],
        ];
        $issue->transfer_history = $history;
        $issue->addProgressLog('transfer', $transferredBy, $oldDept, "Dialihkan dari {$oldDept} ke {$newDept}: {$reason}");
        $issue->save();

        // Dispatch centralized reporter DM notification (bot handles group replies directly)
        $this->notifyReporterTransferred($issue, $oldDept, $newDept, $transferredBy, $reason);

        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on apiTransfer: ' . $e->getMessage());
        }

        $code = self::formatIssueCode($issue);

        return response()->json([
            'success' => true,
            'message' => "Tiket berhasil dialihkan dari {$oldDept} ke {$newDept}.",
            'data'    => [
                'id'               => $code,
                'title'            => $issue->title,
                'location'         => $issue->location,
                'description'      => $issue->description,
                'from_department'  => $oldDept,
                'to_department'    => $newDept,
                'transferred_by'   => $transferredBy,
                'reporter_phone'   => $issue->reporter_phone,
                'reason'           => $reason,
                'status'           => 'open',
                'transfer_history' => $history,
            ]
        ]);
    }

    /**
     * API: Mark issue as pending
     */
    public function apiPending(Request $request, $idOrCode)
    {
        $issue = self::findIssueByIdOrCode($idOrCode);
        if (!$issue) {
            return response()->json(['success' => false, 'message' => 'Isu tidak ditemukan.'], 404);
        }

        $reason = trim((string) $request->input('reason', 'Tertunda')) ?: 'Tertunda';
        $actor = trim((string) ($request->input('actor') ?: $request->input('pending_by', 'Staf WhatsApp'))) ?: 'Staf WhatsApp';
        $dept = !empty($issue->target_departments) ? $issue->target_departments[0] : 'Umum';
        $wasPending = $issue->status === 'pending';

        $issue->status = 'pending';
        $issue->pending_reason = $reason;
        $issue->pending_since = $issue->pending_since ?: Carbon::now('Asia/Jakarta');
        $issue->resolution_note = "Pending: {$reason}";
        $issue->addProgressLog('pending', $actor, $dept, "Ditunda (Pending): {$reason}", ['pending_reason' => $reason]);
        $issue->save();

        // Dispatch centralized reporter DM notification (bot handles group replies directly)
        $this->notifyReporterPending($issue, $actor, $dept, $reason, $wasPending);

        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on apiPending: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => "Tiket ditandai pending.",
            'data'    => [
                'id'     => self::formatIssueCode($issue),
                'status' => 'pending',
                'reason' => $reason,
            ]
        ]);
    }

    /**
     * Dispatch WhatsApp notification to the reporting staff upon issue registration.
     */
    protected function notifyReporterCreated(LeanIssue $issue, string $receiverName, string $receiverDept, ?string $assignedWorkers = null): void
    {
        $reporterPhone = $this->resolveIssueReporterPhone($issue);
        if (empty($reporterPhone)) {
            return;
        }

        $issueCode = self::formatIssueCode($issue);
        $statusText = $issue->status === 'in_progress'
            ? "⚡ *Sedang Langsung Dikerjakan*"
            : "🕒 *Masuk Antrean Penanganan*";

        $workerLine = !empty($assignedWorkers)
            ? "🔧 *Ditugaskan Kepada:* {$assignedWorkers}\n"
            : "";

        $message = "📋 *Laporan Diterima - Telunas Tracker*\n\n"
                 . "Halo *{$issue->reporter_name}*,\n"
                 . "Laporan perbaikan Anda telah resmi dicatat ke sistem:\n\n"
                 . "📌 *Masalah:* {$issue->title}\n"
                 . "📍 *Lokasi:* {$issue->location}\n"
                 . "🏷️ *Kode Tiket:* #{$issueCode}\n"
                 . "🏢 *Departemen Penangan:* {$receiverDept}\n"
                 . "👤 *Penerima Laporan:* {$receiverName}\n"
                 . $workerLine
                 . "📊 *Status Awal:* {$statusText}\n\n"
                 . "Kami akan terus mengabari perkembangan status laporan Anda (*dikerjakan, progress, pending, pengalihan,* hingga *selesai*) melalui WhatsApp ini. Terima kasih!";

        try {
            TicketNotificationService::sendWhatsApp($reporterPhone, $message);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp creation notice: " . $t->getMessage());
        }
    }

    /**
     * Dispatch WhatsApp notification to the reporting staff upon issue resolution.
     */
    protected function notifyReporterResolved(LeanIssue $issue, ?string $solverName, ?string $solverDept, ?string $note = null): void
    {
        $reporterPhone = $this->resolveIssueReporterPhone($issue);
        if (empty($reporterPhone)) {
            return;
        }

        $issueCode = self::formatIssueCode($issue);
        $solverDisplay = $solverName ?: 'Tim Departemen';
        $deptDisplay = $solverDept ?: 'Resort';
        $noteText = !empty($note) ? "\n📝 *Catatan:* {$note}" : "";

        $message = "✅ *Laporan Selesai Ditangani - Telunas Tracker*\n\n"
                 . "Halo *{$issue->reporter_name}*,\n"
                 . "Laporan perbaikan Anda telah *SELESAI* dikerjakan:\n\n"
                 . "📌 *Masalah:* {$issue->title}\n"
                 . "📍 *Lokasi:* {$issue->location}\n"
                 . "🏷️ *Kode Tiket:* #{$issueCode}\n"
                 . "🔧 *Diselesaikan Oleh:* {$solverDisplay} ({$deptDisplay}){$noteText}\n\n"
                 . "Terima kasih atas bantuan Anda dalam menjaga kenyamanan Telunas Resorts!";

        try {
            TicketNotificationService::sendWhatsApp($reporterPhone, $message);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp resolution notice: " . $t->getMessage());
        }
    }

    /**
     * Dispatch WhatsApp notification when an issue is claimed / started (or resumed to Progress from pending).
     */
    protected function notifyReporterClaimed(LeanIssue $issue, string $workersStr, string $dept, bool $wasPending = false, string $note = ''): bool
    {
        $reporterPhone = $this->resolveIssueReporterPhone($issue);
        if (empty($reporterPhone)) {
            return false;
        }

        $issueCode = self::formatIssueCode($issue);
        $titleHeader = $wasPending
            ? "🔄 *Laporan Dilanjutkan ke Tahap Progress - Telunas Tracker*"
            : "⚡ *Laporan Mulai Dikerjakan - Telunas Tracker*";
        $statusLine = $wasPending
            ? "Laporan Anda kini kembali dalam tahap *Progress*:"
            : "Isu Anda kini berstatus *In Progress*:";
        $noteLine = $note !== '' ? "\n📝 *Catatan:* {$note}" : '';

        $message = "{$titleHeader}\n\n"
                 . "Halo *{$issue->reporter_name}*,\n"
                 . "{$statusLine}\n\n"
                 . "📌 *Masalah:* {$issue->title}\n"
                 . "📍 *Lokasi:* {$issue->location}\n"
                 . "🏷️ *Kode Tiket:* #{$issueCode}\n"
                 . "🏢 *Departemen:* {$dept}\n"
                 . "👷 *Dikerjakan Oleh:* {$workersStr}{$noteLine}\n\n"
                 . "Kami akan terus mengabari perkembangan penanganannya melalui WhatsApp ini.";

        try {
            return TicketNotificationService::sendWhatsApp($reporterPhone, $message);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp claim notice: " . $t->getMessage());
            return false;
        }
    }

    /**
     * Dispatch WhatsApp progress comment / team update to the reporting staff.
     */
    protected function notifyReporterProgress(
        LeanIssue $issue,
        string $actorName,
        string $dept,
        string $comment,
        array $activeWorkers,
        array $addedWorkers = [],
        array $removedWorkers = []
    ): void {
        $reporterPhone = $this->resolveIssueReporterPhone($issue);
        if (empty($reporterPhone)) {
            return;
        }

        $issueCode = self::formatIssueCode($issue);
        $workersText = !empty($activeWorkers) ? implode(', ', $activeWorkers) : '-';
        $commentLine = $comment !== '' ? "\n💬 *Update Progress:* {$comment}" : '';
        $changeParts = [];
        if (!empty($addedWorkers)) {
            $changeParts[] = '+Ditambah: ' . implode(', ', $addedWorkers);
        }
        if (!empty($removedWorkers)) {
            $changeParts[] = '-Dikurangi: ' . implode(', ', $removedWorkers);
        }
        $teamChangeLine = !empty($changeParts) ? "\n🔄 *Perubahan Tim:* " . implode(' | ', $changeParts) : '';

        $message = "🔧 *Update Progress Laporan - Telunas Tracker*\n\n"
                 . "Halo *{$issue->reporter_name}*,\n"
                 . "Berikut informasi terbaru dari tim yang menangani laporan Anda:\n\n"
                 . "📌 *Masalah:* {$issue->title}\n"
                 . "📍 *Lokasi:* {$issue->location}\n"
                 . "🏷️ *Kode Tiket:* #{$issueCode}\n"
                 . "👷 *Tim Aktif ({$dept}):* {$workersText}"
                 . $commentLine
                 . $teamChangeLine . "\n"
                 . "👤 *Diperbarui Oleh:* {$actorName}";

        try {
            TicketNotificationService::sendWhatsApp($reporterPhone, $message);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp progress notice: " . $t->getMessage());
        }
    }

    /**
     * Dispatch WhatsApp notification when an issue is marked Pending.
     */
    protected function notifyReporterPending(LeanIssue $issue, string $actorName, string $dept, string $reason, bool $isUpdatePending = false): void
    {
        $reporterPhone = $this->resolveIssueReporterPhone($issue);
        if (empty($reporterPhone)) {
            return;
        }

        $issueCode = self::formatIssueCode($issue);
        $heading = $isUpdatePending
            ? "⏳ *Update Alasan Pending - Telunas Tracker*"
            : "⏳ *Laporan Ditunda Sementara (Pending) - Telunas Tracker*";

        $message = "{$heading}\n\n"
                 . "Halo *{$issue->reporter_name}*,\n"
                 . "Penanganan laporan Anda saat ini berstatus *Pending*:\n\n"
                 . "📌 *Masalah:* {$issue->title}\n"
                 . "📍 *Lokasi:* {$issue->location}\n"
                 . "🏷️ *Kode Tiket:* #{$issueCode}\n"
                 . "🏢 *Departemen:* {$dept}\n"
                 . "📝 *Alasan Pending:* {$reason}\n"
                 . "👤 *Dicatat Oleh:* {$actorName}\n\n"
                 . "Tim akan kembali melanjutkan pengerjaan begitu kendala di atas teratasi.";

        try {
            TicketNotificationService::sendWhatsApp($reporterPhone, $message);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp pending notice: " . $t->getMessage());
        }
    }

    /**
     * Dispatch WhatsApp notification when an issue is transferred to another department.
     */
    protected function notifyReporterTransferred(LeanIssue $issue, string $fromDept, string $toDept, string $actorName, string $reason): void
    {
        $reporterPhone = $this->resolveIssueReporterPhone($issue);
        if (empty($reporterPhone)) {
            return;
        }

        $issueCode = self::formatIssueCode($issue);

        $message = "🔀 *Pengalihan Departemen Penangan - Telunas Tracker*\n\n"
                 . "Halo *{$issue->reporter_name}*,\n"
                 . "Laporan Anda telah dialihkan ke departemen yang lebih sesuai untuk ditindaklanjuti:\n\n"
                 . "📌 *Masalah:* {$issue->title}\n"
                 . "📍 *Lokasi:* {$issue->location}\n"
                 . "🏷️ *Kode Tiket:* #{$issueCode}\n"
                 . "➡️ *Dialihkan:* {$fromDept} ➔ *{$toDept}*\n"
                 . "📝 *Alasan Pengalihan:* {$reason}\n"
                 . "👤 *Oleh:* {$actorName}\n\n"
                 . "Status tiket kembali *Open* untuk departemen *{$toDept}*.";

        try {
            TicketNotificationService::sendWhatsApp($reporterPhone, $message);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp transfer notice: " . $t->getMessage());
        }
    }

    // ─── Group Notifications (Triggered ONLY on Dashboard /lapangan actions) ─

    protected function notifyGroupsCreated(LeanIssue $issue, string $receiverName, string $receiverDept, ?string $assignedWorkers = null): void
    {
        $issueCode = self::formatIssueCode($issue);
        $targetDepts = is_array($issue->target_departments) ? $issue->target_departments : [$receiverDept];
        $deptDisplay = implode(', ', $targetDepts) ?: $receiverDept;
        $reporterDeptDisplay = $issue->reporter_dept ? " ({$issue->reporter_dept})" : '';
        $descText = trim((string) $issue->description) !== '' ? trim((string) $issue->description) : '-';
        $statusText = $issue->status === 'in_progress'
            ? "⚡ *Langsung Dikerjakan* oleh {$assignedWorkers}"
            : "🕒 *Open (Menunggu Penanganan)*";

        $message = "📢 *LAPORAN MASALAH BARU (DASHBOARD)* 📢\n\n"
                 . "• *ID Tiket:* #{$issueCode}\n"
                 . "• *Masalah:* {$issue->title}\n"
                 . "• *Lokasi:* {$issue->location}\n"
                 . "• *Departemen Tujuan:* {$deptDisplay}\n"
                 . "• *Pelapor:* {$issue->reporter_name}{$reporterDeptDisplay}\n"
                 . "• *Dicatat Oleh:* {$receiverName}\n"
                 . "• *Status Awal:* {$statusText}\n"
                 . "• *Deskripsi:* {$descText}";

        try {
            TicketNotificationService::sendWhatsAppGroup([
                'message'         => $message,
                'imageUrl'        => $issue->image_url,
                'departments'     => $targetDepts,
                'location'        => $issue->location,
                'includeLocation' => true,
                'includeGeneral'  => true,
                'departmentOnly'  => false,
            ]);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp group creation notice: " . $t->getMessage());
        }
    }

    protected function notifyGroupsClaimed(LeanIssue $issue, string $workersStr, string $dept, bool $wasPending = false, string $note = ''): void
    {
        $issueCode = self::formatIssueCode($issue);
        $targetDepts = is_array($issue->target_departments) && !empty($issue->target_departments)
            ? $issue->target_departments
            : [$dept];
        $heading = $wasPending
            ? "🔄 *TIKET DILANJUTKAN KE PROGRESS* 🔄"
            : "⚡ *TIKET MULAI DIKERJAKAN* ⚡";
        $statusLabel = $wasPending ? 'Progress' : 'In Progress';
        $noteLine = $note !== '' ? "\n• *Catatan:* {$note}" : '';

        $message = "{$heading}\n\n"
                 . "• *ID Tiket:* #{$issueCode}\n"
                 . "• *Masalah:* {$issue->title}\n"
                 . "• *Lokasi:* {$issue->location}\n"
                 . "• *Dikerjakan Oleh:* {$workersStr} ({$dept})\n"
                 . "• *Status:* 🟡 {$statusLabel}{$noteLine}";

        try {
            TicketNotificationService::sendWhatsAppGroup([
                'message'        => $message,
                'departments'    => $targetDepts,
                'departmentOnly' => true,
            ]);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp group claim notice: " . $t->getMessage());
        }
    }

    protected function notifyGroupsProgress(
        LeanIssue $issue,
        string $actorName,
        string $dept,
        string $comment,
        array $activeWorkers,
        array $addedWorkers = [],
        array $removedWorkers = []
    ): void {
        $issueCode = self::formatIssueCode($issue);
        $targetDepts = is_array($issue->target_departments) && !empty($issue->target_departments)
            ? $issue->target_departments
            : [$dept];
        $workersText = !empty($activeWorkers) ? implode(', ', $activeWorkers) : '-';
        $commentLine = $comment !== '' ? "\n• *Catatan Progress:* {$comment}" : '';
        $changeParts = [];
        if (!empty($addedWorkers)) {
            $changeParts[] = '+Ditambah: ' . implode(', ', $addedWorkers);
        }
        if (!empty($removedWorkers)) {
            $changeParts[] = '-Dikurangi: ' . implode(', ', $removedWorkers);
        }
        $teamChangeLine = !empty($changeParts) ? "\n• *Perubahan Tim:* " . implode(' | ', $changeParts) : '';

        $message = "🔧 *UPDATE PROGRESS PEKERJAAN* 🔧\n\n"
                 . "• *ID Tiket:* #{$issueCode}\n"
                 . "• *Masalah:* {$issue->title}\n"
                 . "• *Lokasi:* {$issue->location}\n"
                 . "• *Tim Aktif ({$dept}):* {$workersText}"
                 . $commentLine
                 . $teamChangeLine . "\n"
                 . "• *Diperbarui Oleh:* {$actorName}";

        try {
            TicketNotificationService::sendWhatsAppGroup([
                'message'        => $message,
                'departments'    => $targetDepts,
                'departmentOnly' => true,
            ]);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp group progress notice: " . $t->getMessage());
        }
    }

    protected function notifyGroupsPending(LeanIssue $issue, string $actorName, string $dept, string $reason, bool $isUpdatePending = false): void
    {
        $issueCode = self::formatIssueCode($issue);
        $targetDepts = is_array($issue->target_departments) && !empty($issue->target_departments)
            ? $issue->target_departments
            : [$dept];
        $heading = $isUpdatePending
            ? "⏸️ *UPDATE ALASAN PENDING TIKET* ⏸️"
            : "⏸️ *TIKET DITANDAI PENDING / TERTUNDA* ⏸️";

        $message = "{$heading}\n\n"
                 . "• *ID Tiket:* #{$issueCode}\n"
                 . "• *Masalah:* {$issue->title}\n"
                 . "• *Lokasi:* {$issue->location}\n"
                 . "• *Departemen:* {$dept}\n"
                 . "• *Alasan Pending:* {$reason}\n"
                 . "• *Dicatat Oleh:* {$actorName}";

        try {
            TicketNotificationService::sendWhatsAppGroup([
                'message'        => $message,
                'departments'    => $targetDepts,
                'departmentOnly' => true,
            ]);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp group pending notice: " . $t->getMessage());
        }
    }

    protected function notifyGroupsResolved(LeanIssue $issue, ?string $solverName, ?string $solverDept, ?string $note = null): void
    {
        $issueCode = self::formatIssueCode($issue);
        $targetDepts = is_array($issue->target_departments) && !empty($issue->target_departments)
            ? $issue->target_departments
            : [$solverDept ?: 'Resort'];
        $solverDisplay = $solverName ?: 'Tim Departemen';
        $deptDisplay = $solverDept ?: 'Resort';
        $contributorsList = is_array($issue->contributors) && !empty($issue->contributors)
            ? implode(', ', $issue->contributors)
            : $solverDisplay;
        $noteLine = trim((string) $note) !== '' ? "\n• *Deskripsi Penyelesaian:* " . trim((string) $note) : '';

        $message = "✅ *TIKET TELAH SELESAI DITANGANI* ✅\n\n"
                 . "• *ID Tiket:* #{$issueCode}\n"
                 . "• *Masalah:* {$issue->title}\n"
                 . "• *Lokasi:* {$issue->location}\n"
                 . "• *Departemen:* {$deptDisplay}\n"
                 . "• *Diselesaikan Oleh:* {$solverDisplay}\n"
                 . "• *Seluruh Kontributor:* {$contributorsList}{$noteLine}\n"
                 . "• *Status:* 🟢 Selesai (Resolved)";

        try {
            TicketNotificationService::sendWhatsAppGroup([
                'message'         => $message,
                'imageUrl'        => $issue->resolution_image_url,
                'departments'     => $targetDepts,
                'location'        => $issue->location,
                'includeLocation' => true,
                'includeGeneral'  => true,
                'departmentOnly'  => false,
            ]);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp group resolution notice: " . $t->getMessage());
        }
    }

    protected function notifyGroupsTransferred(
        LeanIssue $issue,
        array $oldDepts,
        string $oldDept,
        string $newDept,
        string $actorName,
        string $reason
    ): void {
        $issueCode = self::formatIssueCode($issue);

        $filteredOldDepts = array_values(array_filter($oldDepts, function ($d) use ($newDept) {
            return strcasecmp(self::normalizeDepartment((string) $d), $newDept) !== 0;
        }));
        if (empty($filteredOldDepts) && strcasecmp(self::normalizeDepartment($oldDept), $newDept) !== 0) {
            $filteredOldDepts = [$oldDept];
        }

        // 1. Notify old department group(s): ticket released
        if (!empty($filteredOldDepts)) {
            $oldDeptMsg = "🔄 *TIKET DIALIHKAN KE DEPARTEMEN LAIN* 🔄\n\n"
                        . "• *ID Tiket:* #{$issueCode}\n"
                        . "• *Masalah:* {$issue->title}\n"
                        . "• *Lokasi:* {$issue->location}\n"
                        . "• *Dialihkan:* {$oldDept} ➔ *{$newDept}*\n"
                        . "• *Oleh:* {$actorName}\n"
                        . "• *Alasan:* {$reason}\n\n"
                        . "_Tiket telah dilepaskan dari antrean {$oldDept} dan diteruskan ke grup {$newDept}._";

            try {
                TicketNotificationService::sendWhatsAppGroup([
                    'message'        => $oldDeptMsg,
                    'departments'    => $filteredOldDepts,
                    'departmentOnly' => true,
                ]);
            } catch (\Throwable $t) {
                Log::warning("Failed to send WhatsApp group transfer notice (old dept): " . $t->getMessage());
            }
        }

        // 2. Notify new target department group: incoming ticket
        $descText = trim((string) $issue->description) !== '' ? trim((string) $issue->description) : '-';
        $newDeptMsg = "📥 *TIKET MASUK (DIALIHKAN DARI {$oldDept})* 📥\n\n"
                    . "• *ID Tiket:* #{$issueCode}\n"
                    . "• *Masalah:* {$issue->title}\n"
                    . "• *Lokasi:* {$issue->location}\n"
                    . "• *Dialihkan Dari:* {$oldDept}\n"
                    . "• *Dialihkan Oleh:* {$actorName}\n"
                    . "• *Alasan Pengalihan:* {$reason}\n"
                    . "• *Deskripsi Asal:* {$descText}";

        try {
            TicketNotificationService::sendWhatsAppGroup([
                'message'        => $newDeptMsg,
                'departments'    => [$newDept],
                'departmentOnly' => true,
            ]);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp group transfer notice (new dept): " . $t->getMessage());
        }
    }
}

