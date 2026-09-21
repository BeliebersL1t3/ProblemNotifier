<?php

namespace App\Http\Controllers;

use App\Models\ReportSchedule;
use App\Services\MonthlyReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ReportScheduleController extends Controller
{
    /**
     * Get the current monthly report schedule settings.
     */
    public function getSettings(): JsonResponse
    {
        $user = auth()->user();
        if (!$user || (!$user->is_hod && $user->role !== 'admin')) {
            return response()->json(['error' => 'Unauthorized. Admin or HOD access required.'], 403);
        }

        $config = ReportSchedule::getOrCreateConfig();
        $config->load('updatedByUser:id,name,department');

        return response()->json([
            'success' => true,
            'config'  => $config,
        ]);
    }

    /**
     * Update the monthly report schedule settings.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $user = auth()->user();
        if (!$user || (!$user->is_hod && $user->role !== 'admin')) {
            return response()->json(['error' => 'Unauthorized. Admin or HOD access required.'], 403);
        }

        $validated = $request->validate([
            'is_enabled'             => 'required|boolean',
            'day_of_month'           => 'required|integer|min:1|max:28',
            'dispatch_time'          => 'required|string|max:10',
            'send_to_all_hods'       => 'required|boolean',
            'send_to_admins'         => 'required|boolean',
            'additional_recipients'  => 'nullable|array',
            'additional_recipients.*'=> 'email',
            'include_delay_timeline' => 'required|boolean',
        ]);

        $config = ReportSchedule::getOrCreateConfig();
        $validated['updated_by'] = $user->id;

        $config->update($validated);
        $config->load('updatedByUser:id,name,department');

        return response()->json([
            'success' => true,
            'message' => 'Pengaturan laporan bulanan otomatis berhasil disimpan.',
            'config'  => $config,
        ]);
    }

    /**
     * Trigger an immediate test dispatch to the current user's email.
     */
    public function testDispatch(MonthlyReportService $monthlyReportService): JsonResponse
    {
        $user = auth()->user();
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
