<?php

namespace App\Services;

use App\Models\LeanIssue;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GoogleSheetsSyncService
{
    /**
     * Get webhook URL for Issues Log sheet.
     */
    protected function getIssuesWebhookUrl(): ?string
    {
        $url = config('telunas.google_sheets.issues_webhook_url');
        return !empty($url) ? trim($url) : null;
    }

    /**
     * Get webhook URL for Locations sheet.
     */
    protected function getLocationsWebhookUrl(): ?string
    {
        $url = config('telunas.google_sheets.locations_webhook_url');
        return !empty($url) ? trim($url) : null;
    }

    /**
     * Format issue code consistently.
     */
    public static function formatIssueCode(LeanIssue $issue): string
    {
        $dt = $issue->created_at ?? now();
        return sprintf('CFX-%s-%03d', $dt->format('ym'), $issue->id);
    }

    /**
     * Format an issue into 25-column Google Spreadsheet payload.
     */
    public function formatIssuePayload(LeanIssue $issue, bool $isDeleted = false, ?string $deletedByName = null): array
    {
        $code = self::formatIssueCode($issue);
        $isActive = ($isDeleted || $issue->trashed()) ? 0 : 1;
        $deletedBy = ($isActive === 0) ? ($deletedByName ?: ($issue->deleted_by_name ?: 'Supervisor')) : '';
        $deletedAt = ($isActive === 0) ? ($issue->deleted_at ? $issue->deleted_at->format('Y-m-d H:i') : now()->format('Y-m-d H:i')) : '';

        // Format target departments
        $targetDepts = $issue->target_departments;
        if (is_array($targetDepts)) {
            $targetDeptsStr = implode(', ', $targetDepts);
        } elseif (is_string($targetDepts)) {
            $decoded = json_decode($targetDepts, true);
            $targetDeptsStr = is_array($decoded) ? implode(', ', $decoded) : $targetDepts;
        } else {
            $targetDeptsStr = 'Umum';
        }

        // Status label
        $statusLabels = [
            'open' => 'Open',
            'in_progress' => 'In Progress',
            'resolved' => 'Resolved',
        ];
        $statusStr = $statusLabels[$issue->status] ?? ucfirst($issue->status ?: 'Open');

        // AI details
        $aiAnalysis = is_array($issue->ai_analysis) ? $issue->ai_analysis : [];
        $needSparepart = isset($aiAnalysis['perlu_sparepart'])
            ? ($aiAnalysis['perlu_sparepart'] ? 'YA' : 'TIDAK')
            : ($issue->ai_analysis && str_contains(json_encode($issue->ai_analysis), 'true') ? 'YA' : 'TIDAK');

        $rootCause = $aiAnalysis['dugaan_akar_masalah'] ?? '';
        $mitigation = $aiAnalysis['tindakan_mitigasi_pencegahan'] ?? '';

        return [
            // Standard English Keys (Matches Apps Script Code.gs)
            'issue_code'           => $code,
            'reported_at'          => $issue->created_at ? $issue->created_at->format('Y-m-d H:i') : '',
            'reporter_name'        => $issue->reporter_name ?: '-',
            'reporter_dept'        => $issue->reporter_dept ?: '-',
            'location'             => $issue->location ?: '-',
            'title'                => $issue->title ?: '-',
            'description'          => $issue->description ?: '-',
            'target_departments'   => $targetDeptsStr,
            'status'               => $statusStr,
            'is_active'            => $isActive,
            'deleted_by'           => $deletedBy,
            'deleted_at'           => $deletedAt,
            'image_url'            => '', // Foto ditiadakan di spreadsheet sesuai permintaan
            'claimed_by'           => $issue->claimed_by_name ?: '',
            'claimed_at'           => $issue->claimed_at ? $issue->claimed_at->format('Y-m-d H:i') : '',
            'resolved_by'          => $issue->resolved_by_name ?: '',
            'resolved_at'          => $issue->resolved_at ? $issue->resolved_at->format('Y-m-d H:i') : '',
            'resolution_note'      => $issue->resolution_note ?: '',
            'proof_image_url'      => '', // Foto ditiadakan di spreadsheet sesuai permintaan
            'ai_category'          => $issue->ai_category ?: '',
            'ai_sub_category'      => $issue->ai_sub_category ?: '',
            'ai_urgency'           => $issue->ai_urgency ?: 'Sedang',
            'ai_sparepart_needed'  => $needSparepart,
            'ai_root_cause'        => $rootCause,
            'ai_mitigation'        => $mitigation,

            // Indonesian Aliases for Backwards Compatibility
            'kode_tiket'           => $code,
            'waktu_lapor'          => $issue->created_at ? $issue->created_at->format('Y-m-d H:i') : '',
            'pelapor'              => $issue->reporter_name ?: '-',
            'dept_pelapor'         => $issue->reporter_dept ?: '-',
            'lokasi'               => $issue->location ?: '-',
            'judul_masalah'        => $issue->title ?: '-',
            'deskripsi_awal'       => $issue->description ?: '-',
            'departemen_dituju'    => $targetDeptsStr,
            'status_tiket'         => $statusStr,
            'aktif_di_dashboard'   => $isActive,
            'dihapus_oleh'         => $deletedBy,
            'waktu_dihapus'        => $deletedAt,
            'foto_masalah_url'     => '',
            'diambil_oleh'         => $issue->claimed_by_name ?: '',
            'waktu_ambil'          => $issue->claimed_at ? $issue->claimed_at->format('Y-m-d H:i') : '',
            'diselesaikan_oleh'    => $issue->resolved_by_name ?: '',
            'waktu_selesai'        => $issue->resolved_at ? $issue->resolved_at->format('Y-m-d H:i') : '',
            'catatan_penyelesaian' => $issue->resolution_note ?: '',
            'foto_selesai_url'     => '',
            'ai_kategori'          => $issue->ai_category ?: '',
            'ai_sub_kategori'      => $issue->ai_sub_category ?: '',
            'ai_urgensi'           => $issue->ai_urgency ?: 'Sedang',
            'ai_butuh_sparepart'   => $needSparepart,
            'ai_akar_masalah'      => $rootCause,
            'ai_mitigasi'          => $mitigation,
        ];
    }

    /**
     * Send a single issue to Google Spreadsheet Webhook.
     */
    public function syncIssue(LeanIssue $issue, bool $isDeleted = false, ?string $deletedByName = null): bool
    {
        $webhookUrl = $this->getIssuesWebhookUrl();
        if (!$webhookUrl) {
            Log::info('Google Sheets sync skipped: GOOGLE_SHEET_ISSUES_WEBHOOK_URL not configured.');
            return false;
        }

        $payload = $this->formatIssuePayload($issue, $isDeleted, $deletedByName);

        try {
            $response = Http::asJson()
                ->withoutVerifying()
                ->withOptions(['allow_redirects' => true])
                ->timeout(15)
                ->post($webhookUrl, [
                    'action' => 'upsert_issue',
                    'issues' => [$payload],
                    'items'  => [$payload],
                    'data'   => $payload,
                ]);

            if ($response->successful()) {
                Log::info('Google Sheets sync success for issue: ' . ($payload['issue_code'] ?? $payload['kode_tiket']));
                // Also trigger location summary sync
                $this->syncLocationsSummary();
                return true;
            } else {
                Log::warning('Google Sheets sync responded with error: ' . $response->status() . ' ' . $response->body());
                return false;
            }
        } catch (\Throwable $e) {
            Log::error('Google Sheets sync exception: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Aggregate and sync resort locations summary to Google Sheet 2.
     */
    public function syncLocationsSummary(): bool
    {
        $webhookUrl = $this->getLocationsWebhookUrl();
        if (!$webhookUrl) {
            return false;
        }

        // Fetch all active issues grouped by location
        $issues = LeanIssue::whereNull('deleted_at')->get();

        $locMap = [];
        $urgencyRank = ['Darurat' => 4, 'Tinggi' => 3, 'Sedang' => 2, 'Rendah' => 1];

        foreach ($issues as $issue) {
            $loc = trim($issue->location ?: 'Lainnya');
            if (!isset($locMap[$loc])) {
                $aiAnalysis = is_array($issue->ai_analysis) ? $issue->ai_analysis : [];
                $resort = $aiAnalysis['resort'] ?? (stripos($loc, 'tbr') !== false ? 'TBR' : (stripos($loc, 'tpi') !== false ? 'TPI' : 'TPI'));
                $zona = $aiAnalysis['zona_spasial'] ?? 'Umum';

                $locMap[$loc] = [
                    'nama_lokasi'             => $loc,
                    'resort'                  => $resort,
                    'zona_spasial'            => $zona,
                    'total_insiden'           => 0,
                    'insiden_aktif'           => 0,
                    'insiden_selesai'         => 0,
                    'darurat'                 => 0,
                    'tinggi'                  => 0,
                    'sedang'                  => 0,
                    'rendah'                  => 0,
                    'urgensi_tertinggi'       => 'Rendah',
                    'departemen_set'          => [],
                    'laporan_terakhir_judul'  => $issue->title ?: '',
                    'laporan_terakhir_waktu'  => $issue->created_at ? $issue->created_at->format('Y-m-d') : '',
                ];
            }

            $locMap[$loc]['total_insiden'] += 1;
            if ($issue->status === 'resolved') {
                $locMap[$loc]['insiden_selesai'] += 1;
            } else {
                $locMap[$loc]['insiden_aktif'] += 1;
            }

            $urg = $issue->ai_urgency ?: 'Sedang';
            if (isset($locMap[$loc][strtolower($urg)])) {
                $locMap[$loc][strtolower($urg)] += 1;
            } else {
                $locMap[$loc]['sedang'] += 1;
            }

            if (($urgencyRank[$urg] ?? 0) > ($urgencyRank[$locMap[$loc]['urgensi_tertinggi']] ?? 0)) {
                $locMap[$loc]['urgensi_tertinggi'] = $urg;
            }

            if (is_array($issue->target_departments)) {
                foreach ($issue->target_departments as $d) {
                    if ($d && !in_array($d, $locMap[$loc]['departemen_set'])) {
                        $locMap[$loc]['departemen_set'][] = $d;
                    }
                }
            }
        }

        $locationsPayload = [];
        foreach ($locMap as $item) {
            $rincian = sprintf(
                '%d Darurat, %d Tinggi, %d Sedang, %d Rendah',
                $item['darurat'],
                $item['tinggi'],
                $item['sedang'],
                $item['rendah']
            );

            // Determine status risiko
            if ($item['darurat'] > 0 || $item['tinggi'] > 1) {
                $statusRisiko = '🔴 Kritis';
            } elseif ($item['tinggi'] > 0 || $item['sedang'] > 2) {
                $statusRisiko = '🟡 Waspada';
            } else {
                $statusRisiko = '🟢 Normal';
            }

            $locationsPayload[] = [
                // English Keys (Matches Apps Script Code.gs)
                'location_name'            => $item['nama_lokasi'],
                'resort'                   => $item['resort'],
                'spatial_zone'             => $item['zona_spasial'],
                'total_issues'             => $item['total_insiden'],
                'active_issues'            => $item['insiden_aktif'],
                'resolved_issues'          => $item['insiden_selesai'],
                'highest_urgency'          => $item['urgensi_tertinggi'],
                'case_breakdown'           => $rincian,
                'related_departments'      => implode(', ', $item['departemen_set']),
                'latest_report_at'         => $item['laporan_terakhir_judul'] ? ($item['laporan_terakhir_judul'] . ' (' . $item['laporan_terakhir_waktu'] . ')') : '-',
                'risk_status'              => $statusRisiko,

                // Indonesian Aliases
                'nama_lokasi'              => $item['nama_lokasi'],
                'zona_spasial'             => $item['zona_spasial'],
                'total_insiden'            => $item['total_insiden'],
                'insiden_aktif'            => $item['insiden_aktif'],
                'insiden_selesai'          => $item['insiden_selesai'],
                'tingkat_urgensi_tertinggi'=> $item['urgensi_tertinggi'],
                'rincian_kasus'            => $rincian,
                'departemen_terkait'       => implode(', ', $item['departemen_set']),
                'laporan_terakhir'         => $item['laporan_terakhir_judul'] ? ($item['laporan_terakhir_judul'] . ' (' . $item['laporan_terakhir_waktu'] . ')') : '-',
                'status_risiko'            => $statusRisiko,
            ];
        }

        try {
            $response = Http::asJson()
                ->withoutVerifying()
                ->withOptions(['allow_redirects' => true])
                ->timeout(20)
                ->post($webhookUrl, [
                    'action'    => 'sync_locations',
                    'locations' => $locationsPayload,
                ]);

            return $response->successful();
        } catch (\Throwable $e) {
            Log::error('Google Sheets locations sync exception: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Bulk sync all issues (including soft deleted) to Google Sheets.
     */
    public function syncAll(): array
    {
        $issuesWebhookUrl = $this->getIssuesWebhookUrl();
        $locationsWebhookUrl = $this->getLocationsWebhookUrl();

        if (!$issuesWebhookUrl) {
            return [
                'success' => false,
                'message' => 'URL Webhook Google Sheets belum diatur di konfigurasi (.env).',
            ];
        }

        $allIssues = LeanIssue::withTrashed()->orderBy('id', 'asc')->get();
        $items = [];

        foreach ($allIssues as $issue) {
            $items[] = $this->formatIssuePayload($issue, $issue->trashed());
        }

        $issuesSuccess = false;
        try {
            $response = Http::asJson()
                ->withoutVerifying()
                ->withOptions(['allow_redirects' => true])
                ->timeout(30)
                ->post($issuesWebhookUrl, [
                    'action' => 'batch_upsert_issues',
                    'issues' => $items,
                    'items'  => $items,
                ]);
            $issuesSuccess = $response->successful();
        } catch (\Throwable $e) {
            Log::error('Bulk Google Sheets sync exception: ' . $e->getMessage());
        }

        $locationsSuccess = $this->syncLocationsSummary();

        return [
            'success' => $issuesSuccess,
            'total_issues' => count($items),
            'issues_synced' => $issuesSuccess,
            'locations_synced' => $locationsSuccess,
            'message' => $issuesSuccess
                ? "Berhasil menyinkronkan " . count($items) . " tiket ke Google Sheets."
                : "Gagal mengirim data ke Google Sheets Webhook. Pastikan URL Webhook aktif.",
        ];
    }
}
