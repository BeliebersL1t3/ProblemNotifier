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
     * Display the mobile-first lean dashboard.
     */
    public function index(Request $request)
    {
        $issues = LeanIssue::orderBy('created_at', 'desc')->get()->map(function ($item) {
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
                'resolved_by_name'     => $item->resolved_by_name,
                'resolved_by_dept'     => $item->resolved_by_dept,
                'resolved_at'          => $item->resolved_at ? $item->resolved_at->toIso8601String() : null,
                'resolution_note'      => $item->resolution_note,
                'resolution_image_url' => $resImageUrl,
                'created_at'           => $item->created_at ? $item->created_at->toIso8601String() : null,
                'created_at_human'     => $item->created_at ? $item->created_at->locale('id')->diffForHumans() : '',
                'transfer_history'     => $item->transfer_history ?? [],
            ];
        });

        $currentUser = auth()->check() ? [
            'name'       => auth()->user()->name,
            'department' => auth()->user()->department,
            'is_admin'   => auth()->user()->role === 'admin',
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

        return Inertia::render('Lean/Index', [
            'issues'         => $issues,
            'departments'    => self::DEPARTMENTS,
            'locations'      => self::MAIN_LOCATIONS,
            'currentUser'    => $currentUser,
            'staffDirectory' => $staffDirectory,
            'spreadsheetUrl' => $spreadsheetUrl,
            'monthGids'      => $monthGids,
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
        $workerNames = null;
        if ($startInProgress) {
            if (is_array($rawWorkers)) {
                $workerNames = implode(', ', array_filter(array_map('trim', $rawWorkers)));
            } elseif (is_string($rawWorkers) && trim($rawWorkers) !== '') {
                $workerNames = trim($rawWorkers);
            }
            if (empty($workerNames)) {
                $workerNames = $receiverName;
            }
        }

        $accs = [];
        foreach ($targetDepts as $dept) {
            $isReceiverDept = strcasecmp($dept, $receiverDept) === 0;
            $accs[$dept] = [
                'is_acc' => $isReceiverDept,
                'acc_by' => $isReceiverDept ? $receiverName : null,
                'acc_at' => $isReceiverDept ? Carbon::now('Asia/Jakarta')->toIso8601String() : null,
            ];
        }

        $issue = new LeanIssue([
            'location'           => $validated['location'],
            'title'              => $validated['title'],
            'description'        => $validated['description'] ?? null,
            'target_departments' => $targetDepts,
            'reporter_name'      => $validated['reporter_name'],
            'reporter_dept'      => !empty($validated['reporter_dept']) ? $validated['reporter_dept'] : null,
            'reporter_phone'     => $validated['reporter_phone'] ?? null,
            'image_url'          => $imageUrl,
            'status'             => $startInProgress ? 'in_progress' : 'open',
            'department_accs'    => $accs,
            'claimed_by_name'    => $workerNames,
            'claimed_by_dept'    => $startInProgress ? $receiverDept : null,
            'claimed_at'         => $startInProgress ? Carbon::now('Asia/Jakarta') : null,
        ]);

        if (!empty($validated['reported_at'])) {
            try {
                $issue->created_at = \Carbon\Carbon::parse($validated['reported_at']);
            } catch (\Throwable $t) {
                Log::warning('Failed parsing reported_at for LeanIssue: ' . $t->getMessage());
            }
        }

        $issue->save();

        // Dispatch automated WhatsApp confirmation to the reporting staff
        $this->notifyReporterCreated($issue, $receiverName, $receiverDept, $workerNames);

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
        $request->validate([
            'dept'       => 'required|string|max:50',
            'staff_name' => 'required|string|max:100',
        ]);

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

        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on acc: ' . $e->getMessage());
        }

        return redirect()->back()->with('success', "Departemen {$dept} berhasil ACC / Siap!");
    }

    /**
     * Claim / Start working on an issue (Non-blocking: any ready dept can claim).
     */
    public function claim(Request $request, LeanIssue $issue)
    {
        $request->validate([
            'dept'       => 'required|string|max:50',
            'staff_name' => 'required|string|max:100',
        ]);

        $dept = $request->input('dept');
        $staffName = $request->input('staff_name');

        // Rule Check: Pelapor tidak boleh mengerjakan tugasnya sendiri
        if (
            strcasecmp($issue->reporter_name, $staffName) === 0 ||
            strcasecmp($issue->reporter_dept ?? '', $dept) === 0
        ) {
            return redirect()->back()->with('error', 'Pelapor tidak dapat mengambil atau mengerjakan tugasnya sendiri.');
        }

        // Rule Check: Hanya departemen tujuan yang berhak mengambil tugas
        $targetDepts = array_map('strtolower', $issue->target_departments ?? []);
        if (!empty($targetDepts) && !in_array(strtolower($dept), $targetDepts)) {
            return redirect()->back()->with('error', 'Hanya staf dari departemen tujuan yang dapat mengambil tugas ini.');
        }

        // Automatically set ACC for this department if it was a target
        $accs = $issue->department_accs ?? [];
        if (isset($accs[$dept])) {
            $accs[$dept] = [
                'is_acc' => true,
                'acc_by' => $staffName,
                'acc_at' => Carbon::now('Asia/Jakarta')->toIso8601String(),
            ];
            $issue->department_accs = $accs;
        }

        $issue->status = 'in_progress';
        $issue->claimed_by_name = $staffName;
        $issue->claimed_by_dept = $dept;
        $issue->claimed_at = Carbon::now('Asia/Jakarta');
        $issue->save();

        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on claim: ' . $e->getMessage());
        }

        return redirect()->back()->with('success', "Tugas berhasil diambil oleh {$staffName} ({$dept}).");
    }

    /**
     * Mark an issue as solved / resolved.
     */
    public function resolve(Request $request, LeanIssue $issue)
    {
        $request->validate([
            'dept'            => 'required|string|max:50',
            'staff_name'      => 'required|string|max:100',
            'note'            => 'nullable|string|max:2000',
            'proof_image'     => 'nullable|image|max:10240',
        ]);

        $resolutionImageUrl = null;
        if ($request->hasFile('proof_image')) {
            $file = $request->file('proof_image');
            $filename = 'lean_solve_' . time() . '_' . Str::random(8) . '.' . $file->getClientOriginalExtension();
            $file->move(public_path('uploads'), $filename);
            $resolutionImageUrl = '/uploads/' . $filename;
        }

        $issue->status = 'resolved';
        $issue->resolved_by_name = $request->input('staff_name');
        $issue->resolved_by_dept = $request->input('dept');
        $issue->resolved_at = Carbon::now('Asia/Jakarta');
        $issue->resolution_note = $request->input('note');
        if ($resolutionImageUrl) {
            $issue->resolution_image_url = $resolutionImageUrl;
        }
        $issue->save();

        // Dispatch automated WhatsApp completion notification to the reporting staff
        $this->notifyReporterResolved($issue, $issue->resolved_by_name, $issue->resolved_by_dept, $issue->resolution_note);

        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on resolve: ' . $e->getMessage());
        }

        return redirect()->back()->with('success', 'Masalah berhasil ditandai selesai!');
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
     * Reset / purge all sandbox testing data.
     */
    public function reset()
    {
        LeanIssue::truncate();
        return redirect()->back()->with('success', 'Seluruh data simulasi pengujian berhasil direset.');
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
            'reporter_phone' => 'nullable|string|max:30',
            'image'          => 'nullable|image|max:10240',
        ]);

        $imageUrl = null;
        if ($request->hasFile('image')) {
            $file = $request->file('image');
            $filename = 'lean_' . time() . '_' . Str::random(8) . '.' . $file->getClientOriginalExtension();
            $file->move(public_path('uploads'), $filename);
            $imageUrl = '/uploads/' . $filename;
        }

        $issue = LeanIssue::create([
            'location'           => $validated['location'],
            'title'              => $validated['title'],
            'description'        => $validated['description'] ?? null,
            'target_departments' => [$validated['department']],
            'reporter_name'      => $validated['reporter'],
            'reporter_dept'      => $request->input('reporter_dept', 'Umum'),
            'reporter_phone'     => $validated['reporter_phone'] ?? null,
            'image_url'          => $imageUrl,
            'status'             => 'open',
            'department_accs'    => [
                $validated['department'] => [
                    'is_acc' => false,
                    'acc_by' => null,
                    'acc_at' => null,
                ]
            ],
        ]);

        // Dispatch automated WhatsApp confirmation to the reporting staff
        $this->notifyReporterCreated($issue, 'WhatsApp Bot', $validated['department']);

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
                'id'          => $code,
                'raw_id'      => $issue->id,
                'title'       => $issue->title,
                'location'    => $issue->location,
                'department'  => $validated['department'],
                'reporter'    => $issue->reporter_name,
                'status'      => 'open',
                'imageUrl'    => $imageUrl,
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
        $dept = $request->input('department', is_array($issue->target_departments) ? ($issue->target_departments[0] ?? '') : '');

        // Automatically set ACC / readiness response for this department
        $accs = $issue->department_accs ?? [];
        $found = false;
        foreach ($accs as $d => $val) {
            if (strcasecmp($d, $dept) === 0 || empty($dept)) {
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

        $issue->status = 'in_progress';
        $issue->claimed_by_name = $taker;
        $issue->claimed_by_dept = $dept;
        $issue->claimed_at = Carbon::now('Asia/Jakarta');
        $issue->department_accs = $accs;
        $issue->save();

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

        $issue->status = 'resolved';
        $issue->resolved_by_name = $solver;
        $issue->resolved_at = Carbon::now('Asia/Jakarta');
        $issue->resolution_note = $fixDesc;
        $issue->save();

        // Dispatch automated WhatsApp completion notification to the reporting staff
        $targetDept = !empty($issue->target_departments) ? $issue->target_departments[0] : 'Resort';
        $this->notifyReporterResolved($issue, $solver, $targetDept, $fixDesc);

        try {
            app(GoogleSheetsSyncService::class)->syncIssue($issue);
            app(\App\Services\LeanSheetDirectService::class)->syncSingleIssue($issue);
        } catch (\Throwable $e) {
            Log::error('Sheets sync error on apiClaim: ' . $e->getMessage());
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

        $oldDept = is_array($issue->target_departments) ? ($issue->target_departments[0] ?? 'General') : ($issue->target_departments ?? 'General');
        $newDept = trim($request->input('to_department'));
        $reason = trim($request->input('reason'));
        $transferredBy = trim($request->input('transferred_by'));
        $transferredByPhone = trim($request->input('transferred_by_phone', ''));

        // Record transfer history (unlimited audit trail)
        $history = $issue->transfer_history ?? [];
        $history[] = [
            'from_department'      => $oldDept,
            'to_department'        => $newDept,
            'reason'               => $reason,
            'transferred_by'       => $transferredBy,
            'transferred_by_phone' => $transferredByPhone,
            'transferred_at'       => Carbon::now('Asia/Jakarta')->toIso8601String(),
        ];

        // Update LeanIssue
        $issue->target_departments = [$newDept];
        $issue->status = 'open';
        $issue->claimed_by_name = null;
        $issue->claimed_by_dept = null;
        $issue->claimed_at = null;
        $issue->transfer_history = $history;
        $issue->save();

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

        $reason = $request->input('reason', 'Tertunda');
        $issue->status = 'pending';
        $issue->resolution_note = "Pending: {$reason}";
        $issue->save();

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
        if (empty($issue->reporter_phone)) {
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
                 . "Kami akan mengabari Anda kembali melalui WhatsApp ini begitu perbaikan selesai. Terima kasih!";

        try {
            TicketNotificationService::sendWhatsApp($issue->reporter_phone, $message);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp creation notice: " . $t->getMessage());
        }
    }

    /**
     * Dispatch WhatsApp notification to the reporting staff upon issue resolution.
     */
    protected function notifyReporterResolved(LeanIssue $issue, ?string $solverName, ?string $solverDept, ?string $note = null): void
    {
        if (empty($issue->reporter_phone)) {
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
            TicketNotificationService::sendWhatsApp($issue->reporter_phone, $message);
        } catch (\Throwable $t) {
            Log::warning("Failed to send WhatsApp resolution notice: " . $t->getMessage());
        }
    }
}
