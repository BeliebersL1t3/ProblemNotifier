<?php

namespace App\Http\Controllers;

use App\Models\ReportSchedule;
use App\Models\User;
use App\Services\MonthlyReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ReportScheduleController extends Controller
{
    /**
     * Get the personal monthly report schedule settings for the authenticated user.
     */
    public function getSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || (!$user->is_hod && $user->role !== 'admin')) {
            return response()->json(['error' => 'Unauthorized. Admin or HOD access required.'], 403);
        }

        $config = ReportSchedule::getOrCreateForUser($user);

        // Fetch distinct departments from actual users
        $allDepartments = User::whereNotNull('department')
            ->where('department', '!=', '')
            ->pluck('department')
            ->unique()
            ->sort()
            ->values()
            ->all();

        return response()->json([
            'success' => true,
            'config'  => $config,
            'user'    => [
                'id'         => $user->id,
                'name'       => $user->name,
                'email'      => $user->email,
                'role'       => $user->role,
                'is_hod'     => (bool)$user->is_hod,
                'department' => $user->department,
                'isAdmin'    => ($user->role === 'admin'),
            ],
            'availableDepartments' => $allDepartments,
        ]);
    }

    /**
     * Update the personal monthly report schedule settings.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || (!$user->is_hod && $user->role !== 'admin')) {
            return response()->json(['error' => 'Unauthorized. Admin or HOD access required.'], 403);
        }

        $isAdmin = ($user->role === 'admin');

        $validated = $request->validate([
            'is_enabled'             => 'required|boolean',
            'include_delay_timeline' => 'required|boolean',
            'departments'            => 'nullable|array',
            'departments.*'          => 'string',
        ]);

        $config = ReportSchedule::getOrCreateForUser($user);

        $updateData = [
            'is_enabled'             => (bool)$validated['is_enabled'],
            'include_delay_timeline' => (bool)$validated['include_delay_timeline'],
            'updated_by'             => $user->id,
        ];

        if ($isAdmin) {
            $selectedDepts = $request->input('departments', ['ALL']);
            if (empty($selectedDepts) || in_array('ALL', $selectedDepts)) {
                $updateData['departments'] = ['ALL'];
            } else {
                $updateData['departments'] = array_values(array_unique(array_filter($selectedDepts)));
            }
        } else {
            // HOD department is strictly locked to their account's department
            $updateData['departments'] = array_values(array_filter([$user->department ?: 'General']));
        }

        $config->update($updateData);

        return response()->json([
            'success' => true,
            'message' => 'Pengaturan laporan bulanan pribadi berhasil disimpan.',
            'config'  => $config,
        ]);
    }

    /**
     * Trigger an immediate personal test dispatch to the current user's email.
     */
    public function testDispatch(Request $request, MonthlyReportService $monthlyReportService): JsonResponse
    {
        $user = $request->user();
        if (!$user || (!$user->is_hod && $user->role !== 'admin')) {
            return response()->json(['error' => 'Unauthorized. Admin or HOD access required.'], 403);
        }

        if (empty($user->email)) {
            return response()->json([
                'success' => false,
                'message' => 'Akun Anda belum memiliki alamat email yang terdaftar.',
            ], 422);
        }

        try {
            $results = $monthlyReportService->runMonthlyDispatch(force: true, testUser: $user);

            if ($results['dispatched_count'] > 0) {
                return response()->json([
                    'success' => true,
                    'message' => "Laporan bulanan percobaan berhasil dikirimkan ke {$user->email}.",
                    'details' => $results,
                ]);
            }

            return response()->json([
                'success' => false,
                'message' => 'Gagal mengirimkan laporan percobaan: ' . implode(', ', $results['errors'] ?? ['Terjadi kesalahan']),
            ], 500);
        } catch (\Throwable $e) {
            Log::error('Test dispatch error: ' . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'success' => false,
                'message' => 'Terjadi kesalahan sistem saat membuat atau mengirimkan laporan: ' . $e->getMessage(),
            ], 500);
        }
    }
}
