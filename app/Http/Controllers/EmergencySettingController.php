<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class EmergencySettingController extends Controller
{
    private static function getSettingsFilePath(): string
    {
        return storage_path('app/emergency_settings.json');
    }

    public static function loadSettings(): array
    {
        $defaults = [
            'sla_minutes' => 15,
            'reminder_mode' => 'standard', // 'standard' | 'interval'
            'interval_minutes' => 5,
            'allow_reporter_custom_sla' => true,
            'updated_at' => null,
            'updated_by' => null,
        ];

        try {
            $path = self::getSettingsFilePath();
            if (File::exists($path)) {
                $content = File::get($path);
                $decoded = json_decode($content, true);
                if (is_array($decoded)) {
                    return array_merge($defaults, $decoded);
                }
            }
        } catch (\Throwable $e) {
            Log::warning("Failed to load emergency settings: " . $e->getMessage());
        }

        return $defaults;
    }

    /**
     * Get the current global emergency SLA and calculation interval settings.
     */
    public function getSettings(Request $request): JsonResponse
    {
        $settings = self::loadSettings();
        $isAdmin = (bool)($request->user() && $request->user()->isAdmin());

        return response()->json([
            'success'  => true,
            'settings' => $settings,
            'isAdmin'  => $isAdmin,
        ]);
    }

    /**
     * Update global emergency settings (Admin Only).
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->isAdmin()) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Pengaturan ini hanya dapat diubah oleh Administrator.',
            ], 403);
        }

        $validated = $request->validate([
            'sla_minutes'               => 'required|integer|min:0|max:1440',
            'reminder_mode'             => 'required|string|in:standard,interval',
            'interval_minutes'          => 'required|integer|min:1|max:360',
            'allow_reporter_custom_sla' => 'nullable|boolean',
        ]);

        $settings = [
            'sla_minutes'               => (int)$validated['sla_minutes'],
            'reminder_mode'             => $validated['reminder_mode'],
            'interval_minutes'          => (int)$validated['interval_minutes'],
            'allow_reporter_custom_sla' => $request->boolean('allow_reporter_custom_sla', true),
            'updated_at'                => now()->toIso8601String(),
            'updated_by'                => $user->staff_name ?: $user->name,
        ];

        try {
            $path = self::getSettingsFilePath();
            $dir = dirname($path);
            if (!File::isDirectory($dir)) {
                File::makeDirectory($dir, 0755, true);
            }
            File::put($path, json_encode($settings, JSON_PRETTY_PRINT));
        } catch (\Throwable $e) {
            Log::error("Failed to save emergency settings: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Gagal menyimpan pengaturan: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'success'  => true,
            'message'  => 'Pengaturan penanganan darurat berhasil diperbarui!',
            'settings' => $settings,
        ]);
    }
}
