<?php

namespace App\Services;

use App\Models\LeanIssue;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeminiIssueService
{
    protected ?string $apiKey;
    protected string $model = 'gemini-3.5-flash';
    protected string $fallbackModel = 'gemini-3.5-flash-lite';

    public function __construct()
    {
        $this->apiKey = config('services.gemini.key') ?? env('GEMINI_API_KEY');
    }

    /**
     * Analyze a single lean issue using Gemini Flash.
     * Failsafe: Never throws an uncaught exception; sets status to 'pending' if network/API fails.
     */
    public function analyzeIssue(LeanIssue $issue): bool
    {
        if (empty($this->apiKey)) {
            Log::warning("GeminiIssueService: GEMINI_API_KEY not configured. Leaving issue #{$issue->id} as pending.");
            $issue->update(['ai_status' => 'pending']);
            return false;
        }

        $title = trim($issue->title ?? '');
        $description = trim($issue->description ?? '');
        $location = trim($issue->location ?? '');
        $targetDepts = is_array($issue->target_departments) ? implode(', ', $issue->target_departments) : '';

        $inputText = "Lokasi: {$location}\nJudul Masalah: {$title}\nDeskripsi: {$description}";
        if ($targetDepts) {
            $inputText .= "\nDepartemen Dituju: {$targetDepts}";
        }

        $systemInstruction = <<<PROMPT
Anda adalah AI Auditor & Analis Pemeliharaan Fasilitas Resort Telunas.
Tugas Anda adalah memperkaya (enrich) data laporan masalah lapangan menjadi format data terstruktur untuk kebutuhan audit, penugasan teknisi yang tepat, dan pencegahan kerusakan berulang (Preventive Action / RCA).

Pedoman Khusus:
1. Jika laporan sangat singkat atau minim (misal hanya 1-2 kata seperti "AC", "kran bocor", "mati lampu"), JANGAN bingung dan JANGAN mengarang detail fiktif. Cukup petakan ke kategori yang paling logis, set "data_minimum": true, urgensi: "Sedang", dan berikan saran ringkas apa yang harus diperiksa teknisi.
2. Jika laporan panjang/kompleks, analisis dugaan akar masalah teknisnya dan berikan tindakan mitigasi pencegahan agar tidak terulang lagi.
3. Penentuan Lokasi Akurat:
   - Pelapor seringkali hanya memilih resort umum seperti "TBR" atau "TPI" karena terburu-buru, namun menuliskan detail posisi atau unit di Judul atau Deskripsi (misalnya: "lantainya kayunya rusak ini, deket pintu keluar villa 02" atau "lampu gantung meja 4 dan 6").
   - Anda WAJIB menganalisis Judul dan Deskripsi secara teliti untuk menemukan nomor unit/kamar/villa/chalet, nama ruangan, meja, dermaga, atau patokan posisi spesifik.
   - Hasilkan nilai "lokasi_akurat" dengan format rapi dan standar:
     * Jika ditemukan nomor unit/titik spesifik: "[RESORT] - [Unit/Area Spesifik]" atau "[RESORT] - [Unit/Area Spesifik] ([Patokan Posisi])". Contoh: "TBR - Villa 02 (Dekat Pintu Keluar)", "TPI - Dining Room (Meja 4 & 6)", "TPI - Overwater Villa 15", "TBR - Dermaga Boat TBR".
     * Jika pelapor sudah menuliskan lokasi yang cukup lengkap (contoh: "TPI - Overwater Villa 8"), rapikan formatnya tanpa mengubah maknanya.
     * Jika di judul dan deskripsi sama sekali TIDAK ada detail unit/titik spesifik, gabungkan nama resort dengan zona spasial yang paling sesuai (contoh: "TBR - Area Umum", "TBR - Vila Terapung").
4. Hasil WAJIB HANYA berupa JSON valid murni (tanpa format markdown atau pembuka ```json).

Struktur JSON yang WAJIB dihasilkan:
{
  "kategori_utama": "Kelistrikan | Plumbing & Air | HVAC & Pendingin | Struktur & Bangunan | Jaringan & IT | Housekeeping & Linen | Fasilitas Umum | Lain-lain",
  "sub_kategori": "string singkat (contoh: 'Pompa Air', 'Kebocoran Pipa', 'Kompresor AC', 'Pintu / Engsel', dll)",
  "urgensi": "Rendah | Sedang | Tinggi | Darurat",
  "jenis_perbaikan": "Pembersihan / Servis Rutin | Penyetelan Lapangan | Penggantian Komponen | Overhaul / Perombakan | Perlu Inspeksi Awal",
  "perlu_sparepart": true / false,
  "data_minimum": true / false,
  "resort": "TPI | TBR | Kantor",
  "zona_spasial": "Vila Terapung | Dermaga Jetty | Clubhouse & Lobby | Dining Room | Kitchen & Dapur | Spa Pavillion | Genset & Utilitas | Mes Staf | Kantor / Lain-lain",
  "lokasi_akurat": "string representasi lokasi spesifik yang akurat dan rapi sesuai pedoman di atas",
  "dugaan_akar_masalah": "string penjelasan teknis wajar akar penyebab masalah",
  "tindakan_mitigasi_pencegahan": "string rekomendasi konkret audit pencegahan untuk supervisor"
}
PROMPT;

        try {
            $payload = [
                'contents' => [
                    [
                        'role' => 'user',
                        'parts' => [
                            ['text' => "{$systemInstruction}\n\nLaporan Masalah Lapangan:\n{$inputText}"]
                        ]
                    ]
                ],
                'generationConfig' => [
                    'temperature' => 0.1,
                    'responseMimeType' => 'application/json',
                ]
            ];

            $url = "https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent?key={$this->apiKey}";
            
            $client = Http::withOptions([
                'curl' => [
                    CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
                ]
            ])->timeout(8);

            $response = $client->post($url, $payload);

            // Fallback to gemini-3.5-flash-lite if primary model returns 5xx
            if (!$response->successful() && $response->status() >= 500) {
                Log::info("GeminiIssueService: Primary model {$this->model} returned {$response->status()}. Retrying with fallback model {$this->fallbackModel}...");
                $fallbackUrl = "https://generativelanguage.googleapis.com/v1beta/models/{$this->fallbackModel}:generateContent?key={$this->apiKey}";
                $response = $client->post($fallbackUrl, $payload);
            }

            if (!$response->successful()) {
                Log::warning("GeminiIssueService: API returned status {$response->status()} for issue #{$issue->id}. Response: " . $response->body());
                $issue->update(['ai_status' => 'pending']);
                return false;
            }

            $body = $response->json();
            $rawText = $body['candidates'][0]['content']['parts'][0]['text'] ?? null;

            if (!$rawText) {
                Log::warning("GeminiIssueService: Empty text from Gemini for issue #{$issue->id}");
                $issue->update(['ai_status' => 'pending']);
                return false;
            }

            // Clean any accidental markdown fence if present
            $cleanJson = trim(preg_replace('/^```(?:json)?\s*|\s*```$/i', '', trim($rawText)));
            $parsed = json_decode($cleanJson, true);

            if (!is_array($parsed) || empty($parsed['kategori_utama'])) {
                Log::warning("GeminiIssueService: Failed to parse valid JSON for issue #{$issue->id}: " . $rawText);
                $issue->update(['ai_status' => 'pending']);
                return false;
            }

            $allowedUrgencies = ['Darurat', 'Tinggi', 'Sedang', 'Rendah'];
            $urgency = $parsed['urgensi'] ?? 'Sedang';
            if (!in_array($urgency, $allowedUrgencies, true)) {
                $urgency = 'Sedang';
            }

            // Location enrichment logic
            $rawEnrichedLocation = trim($parsed['lokasi_akurat'] ?? '');
            $originalLocation = $issue->location;
            $shouldUpdateLocation = false;

            if (!empty($rawEnrichedLocation)) {
                $trimmedLoc = trim((string)$issue->location);
                $upperLoc = strtoupper($trimmedLoc);

                // Generic indicators: just the resort or empty
                $isGeneric = empty($trimmedLoc) || in_array($upperLoc, ['TBR', 'TPI', 'KANTOR', 'RESORT', 'UMUM'], true);

                if ($isGeneric) {
                    $shouldUpdateLocation = true;
                } else {
                    // Check if AI found specific clues (villa, kamar, chalet, meja, pintu, dll) not in current location
                    $regex = '/(villa|chalet|kamar|meja|pintu|lantai|dermaga|jetty|genset|kitchen|dapur|spa|lodge|clubhouse|room|unit)\b/i';
                    $aiHasSpecifics = (bool)preg_match($regex, $rawEnrichedLocation);
                    $currentHasSpecifics = (bool)preg_match($regex, $trimmedLoc);

                    if ($aiHasSpecifics && !$currentHasSpecifics) {
                        $shouldUpdateLocation = true;
                    } elseif ($rawEnrichedLocation !== $trimmedLoc && stripos($rawEnrichedLocation, $trimmedLoc) !== false && strlen($rawEnrichedLocation) > strlen($trimmedLoc)) {
                        $shouldUpdateLocation = true;
                    }
                }
            }

            $updateData = [
                'ai_status'       => 'completed',
                'ai_category'     => $parsed['kategori_utama'] ?? 'Lain-lain',
                'ai_sub_category' => $parsed['sub_kategori'] ?? null,
                'ai_urgency'      => $urgency,
                'ai_is_minimal'   => (bool)($parsed['data_minimum'] ?? false),
                'ai_analysis'     => array_merge($parsed, [
                    'original_location' => $originalLocation,
                ]),
                'ai_processed_at' => now(),
            ];

            if ($shouldUpdateLocation && !empty($rawEnrichedLocation)) {
                $updateData['location'] = $rawEnrichedLocation;
                Log::info("GeminiIssueService: Location enriched from '{$originalLocation}' to '{$rawEnrichedLocation}' for issue #{$issue->id}");
            }

            // Successfully enriched!
            $issue->update($updateData);

            Log::info("GeminiIssueService: Successfully analyzed issue #{$issue->id} -> {$issue->ai_category} ({$issue->ai_sub_category}), Location: {$issue->location}");

            try {
                app(\App\Services\GoogleSheetsSyncService::class)->syncIssue($issue->fresh());
            } catch (\Throwable $e) {}

            return true;

        } catch (\Throwable $e) {
            // Failsafe: Log exception and leave issue as pending for offline queue retry
            Log::error("GeminiIssueService Failsafe: Failed to analyze issue #{$issue->id}: " . $e->getMessage());
            $issue->update(['ai_status' => 'pending']);
            return false;
        }
    }

    /**
     * Process pending offline queue (catchup when internet/API returns).
     */
    public function processPendingQueue(int $limit = 20): int
    {
        $pendingIssues = LeanIssue::where('ai_status', 'pending')
            ->orderBy('created_at', 'asc')
            ->limit($limit)
            ->get();

        $processedCount = 0;

        foreach ($pendingIssues as $issue) {
            $success = $this->analyzeIssue($issue);
            if ($success) {
                $processedCount++;
            }
            // Gentle sleep between requests to respect RPM limits
            usleep(300000); // 300ms
        }

        return $processedCount;
    }

    /**
     * Total number of issues waiting for AI analysis.
     */
    public function getPendingCount(): int
    {
        return LeanIssue::where('ai_status', 'pending')->count();
    }
}
