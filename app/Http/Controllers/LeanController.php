<?php

namespace App\Http\Controllers;

use App\Models\LeanIssue;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
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
            return [
                'id'                   => $item->id,
                'location'             => $item->location,
                'title'                => $item->title,
                'description'          => $item->description,
                'target_departments'   => $item->target_departments ?? [],
                'reporter_name'        => $item->reporter_name,
                'reporter_dept'        => $item->reporter_dept,
                'image_url'            => $item->image_url,
                'status'               => $item->status,
                'department_accs'      => $item->department_accs ?? [],
                'claimed_by_name'      => $item->claimed_by_name,
                'claimed_by_dept'      => $item->claimed_by_dept,
                'claimed_at'           => $item->claimed_at ? $item->claimed_at->toIso8601String() : null,
                'resolved_by_name'     => $item->resolved_by_name,
                'resolved_by_dept'     => $item->resolved_by_dept,
                'resolved_at'          => $item->resolved_at ? $item->resolved_at->toIso8601String() : null,
                'resolution_note'      => $item->resolution_note,
                'resolution_image_url' => $item->resolution_image_url,
                'created_at'           => $item->created_at->toIso8601String(),
                'created_at_human'     => $item->created_at->locale('id')->diffForHumans(),
            ];
        });

        $currentUser = auth()->check() ? [
            'name'       => auth()->user()->name,
            'department' => auth()->user()->department,
            'is_admin'   => auth()->user()->role === 'admin',
        ] : null;

        return Inertia::render('Lean/Index', [
            'issues'      => $issues,
            'departments' => self::DEPARTMENTS,
            'locations'   => self::MAIN_LOCATIONS,
            'currentUser' => $currentUser,
        ]);
    }

    /**
     * Store a newly created lean issue in the sandbox.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'location'           => 'required|string|max:100',
            'title'              => 'required|string|max:255',
            'description'        => 'nullable|string|max:5000',
            'target_departments' => 'required|array|min:1',
            'target_departments.*' => 'string|max:50',
            'reporter_name'      => 'required|string|max:100',
            'reporter_dept'      => 'nullable|string|max:100',
            'image'              => 'nullable|image|max:10240',
        ]);

        $imageUrl = null;
        if ($request->hasFile('image')) {
            $file = $request->file('image');
            $filename = 'lean_' . time() . '_' . Str::random(8) . '.' . $file->getClientOriginalExtension();
            $file->move(public_path('uploads'), $filename);
            $imageUrl = asset('uploads/' . $filename);
        }

        $accs = [];
        foreach ($validated['target_departments'] as $dept) {
            $accs[$dept] = [
                'is_acc' => false,
                'acc_by' => null,
                'acc_at' => null,
            ];
        }

        LeanIssue::create([
            'location'           => $validated['location'],
            'title'              => $validated['title'],
            'description'        => $validated['description'] ?? null,
            'target_departments' => $validated['target_departments'],
            'reporter_name'      => $validated['reporter_name'],
            'reporter_dept'      => $validated['reporter_dept'] ?? 'Umum',
            'image_url'          => $imageUrl,
            'status'             => 'open',
            'department_accs'    => $accs,
        ]);

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
            $resolutionImageUrl = asset('uploads/' . $filename);
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

        return redirect()->back()->with('success', 'Masalah berhasil ditandai selesai!');
    }

    /**
     * Reset / purge all sandbox testing data.
     */
    public function reset()
    {
        LeanIssue::truncate();
        return redirect()->back()->with('success', 'Seluruh data simulasi pengujian berhasil direset.');
    }
}
