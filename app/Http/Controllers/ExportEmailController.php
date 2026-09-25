<?php

namespace App\Http\Controllers;

use App\Jobs\SendExportPdfReportJob;
use App\Mail\ExportReportMail;
use App\Models\ExportReportLog;
use App\Models\User;
use App\Services\GmailApiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

class ExportEmailController extends Controller
{
    public function __construct(
        protected GmailApiService $gmailApiService
    ) {}
    /**
     * Fetch active staff directory with valid email addresses for recipient selection.
     */
    public function getRecipients(): JsonResponse
    {
        $user = auth()->user();
        if ($user && !$user->isAdmin() && !$user->hasPermission('can_export_reports')) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Anda tidak memiliki izin untuk melihat daftar penerima laporan.',
            ], 403);
        }

        $users = User::query()
            ->where('is_active', true)
            ->whereNotNull('email')
            ->where('email', '!=', '')
            ->select('id', 'name', 'email', 'department', 'is_hod', 'role')
            ->orderBy('name')
            ->get();

        $byDepartment = [];
        $hods = [];

        foreach ($users as $user) {
            $dept = $user->department ?: 'General';
            if (!isset($byDepartment[$dept])) {
                $byDepartment[$dept] = [];
            }
            $byDepartment[$dept][] = [
                'id'         => $user->id,
                'name'       => $user->name,
                'email'      => $user->email,
                'is_hod'     => (bool) $user->is_hod,
                'department' => $user->department,
            ];

            if ($user->is_hod) {
                $hods[] = [
                    'id'         => $user->id,
                    'name'       => $user->name,
                    'email'      => $user->email,
                    'department' => $user->department,
                ];
            }
        }

        return response()->json([
            'success'       => true,
            'users'         => $users,
            'by_department' => $byDepartment,
            'hods'          => $hods,
        ]);
    }

    /**
     * Send client-generated PDF report via email attachment.
     */
    public function sendPdfReport(Request $request): JsonResponse
    {
        $request->validate([
            'pdf_file' => 'required|file|mimes:pdf|max:25600', // max 25MB, strictly PDF
            'subject'  => 'required|string|max:255',
            'message'  => 'nullable|string|max:5000',
        ]);

        // Parse recipients (support JSON string or array)
        $rawRecipients = $request->input('recipients');
        if (is_string($rawRecipients)) {
            $decoded = json_decode($rawRecipients, true);
            $rawRecipients = is_array($decoded) ? $decoded : explode(',', $rawRecipients);
        }

        if (!is_array($rawRecipients) || empty($rawRecipients)) {
            return response()->json([
                'success' => false,
                'message' => 'Silakan pilih atau masukkan minimal 1 alamat email penerima.',
            ], 422);
        }

        $validRecipients = [];
        foreach ($rawRecipients as $item) {
            $email = is_array($item) ? ($item['email'] ?? null) : trim((string) $item);
            if ($email && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $validRecipients[] = strtolower($email);
            }
        }

        $validRecipients = array_unique($validRecipients);

        if (empty($validRecipients)) {
            return response()->json([
                'success' => false,
                'message' => 'Format alamat email penerima tidak valid.',
            ], 422);
        }

        // Meta data
        $rawMeta = $request->input('meta');
        if (is_string($rawMeta)) {
            $reportMeta = json_decode($rawMeta, true) ?: [];
        } else {
            $reportMeta = is_array($rawMeta) ? $rawMeta : [];
        }

        $sender = auth()->user();
        if ($sender && !$sender->isAdmin() && !$sender->hasPermission('can_export_reports')) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Anda tidak memiliki izin untuk mengekspor atau mengirim laporan email.',
            ], 403);
        }

        $senderName = $sender ? $sender->name : 'Telunas Staff';
        $senderDept = $sender ? ($sender->department ?: 'General') : 'Telunas Resorts';
        $senderEmail = $sender ? $sender->email : null;

        $subject = trim($request->input('subject'));
        $customMessage = $request->input('message');

        $uploadedFile = $request->file('pdf_file');
        $rawFilename = $uploadedFile->getClientOriginalName() ?: ('Telunas_Report_' . date('Y-m-d') . '.pdf');
        $safeFilename = preg_replace('/[^a-zA-Z0-9_\-\. ]/', '_', basename($rawFilename));
        if (!str_ends_with(strtolower($safeFilename), '.pdf')) {
            $safeFilename .= '.pdf';
        }
        $originalFilename = $safeFilename;

        $forceSystemMailer = $request->input('mailer') === 'system' || ($reportMeta['type'] ?? '') === 'calendar';
        $hasGoogleConnected = false;
        if (!$forceSystemMailer && $sender) {
            try {
                $hasGoogleConnected = $sender->hasGoogleMailConnected();
            } catch (\Throwable $e) {
                Log::warning('Error checking Google mail connection: ' . $e->getMessage());
                $hasGoogleConnected = false;
            }
        }

        // Check if user has connected their personal Google/Gmail account and not forcing system mailer
        if ($hasGoogleConnected) {
            try {
                $htmlBody = view('emails.export_report', [
                    'emailSubject'     => $subject,
                    'customMessage'    => $customMessage,
                    'senderName'       => $senderName,
                    'senderDepartment' => $senderDept,
                    'reportMeta'       => $reportMeta,
                    'pdfFilename'      => $originalFilename,
                    'excelFilename'    => null,
                ])->render();

                $this->gmailApiService->sendEmail(
                    user: $sender,
                    recipients: $validRecipients,
                    subject: $subject,
                    htmlBody: $htmlBody,
                    pdfFile: $uploadedFile,
                    pdfFilename: $originalFilename
                );

                $accountEmail = $sender->google_email ?: $sender->email;

                // Log audit trail for personal Gmail dispatch
                ExportReportLog::create([
                    'user_id'           => $sender?->id,
                    'sender_name'       => $senderName,
                    'sender_email'      => $accountEmail,
                    'sender_department' => $senderDept,
                    'report_type'       => $reportMeta['type'] ?? 'issues',
                    'recipients'        => $validRecipients,
                    'subject'           => $subject,
                    'pdf_filename'      => $originalFilename,
                    'sent_via'          => 'gmail_api',
                    'status'            => 'sent',
                    'ip_address'        => $request->ip(),
                    'meta'              => $reportMeta,
                ]);

                return response()->json([
                    'success'          => true,
                    'message'          => "Laporan PDF berhasil dikirimkan langsung dari akun Gmail Anda ({$accountEmail}) ke " . count($validRecipients) . " penerima.",
                    'sent_via'         => 'gmail_api',
                    'sender_email'     => $accountEmail,
                    'recipients_count' => count($validRecipients),
                    'recipients'       => $validRecipients,
                ]);
            } catch (\Throwable $e) {
                Log::warning('Gmail API send failed, falling back to system mailer: ' . $e->getMessage());
                // Fall back to system mailer below if Gmail API encountered an issue
            }
        }

        try {
            // 1. Create audit log entry (status: queued)
            $log = ExportReportLog::create([
                'user_id'           => $sender?->id,
                'sender_name'       => $senderName,
                'sender_email'      => $senderEmail ?: ($sender?->email ?? config('mail.from.address')),
                'sender_department' => $senderDept,
                'report_type'       => $reportMeta['type'] ?? 'calendar',
                'recipients'        => $validRecipients,
                'subject'           => $subject,
                'pdf_filename'      => $originalFilename,
                'sent_via'          => 'smtp',
                'status'            => 'queued',
                'ip_address'        => $request->ip(),
                'meta'              => $reportMeta,
            ]);

            // 2. Safely store uploaded file in temp storage for async worker/afterResponse dispatch
            $tempDir = storage_path('app/temp_exports');
            if (!is_dir($tempDir)) {
                mkdir($tempDir, 0755, true);
            }
            $tempFileName = 'export_' . uniqid('', true) . '.pdf';
            $uploadedFile->move($tempDir, $tempFileName);
            $tempFilePath = $tempDir . DIRECTORY_SEPARATOR . $tempFileName;

            // 3. Dispatch asynchronous Job after response
            SendExportPdfReportJob::dispatchAfterResponse(
                tempFilePath: $tempFilePath,
                pdfFilename: $originalFilename,
                recipients: $validRecipients,
                subject: $subject,
                customMessage: $customMessage,
                senderName: $senderName,
                senderDept: $senderDept,
                senderEmail: $senderEmail,
                reportMeta: $reportMeta,
                logId: $log->id
            );

            return response()->json([
                'success'          => true,
                'message'          => 'Laporan PDF berhasil dijadwalkan dan sedang dikirimkan via email ke ' . count($validRecipients) . ' penerima.',
                'sent_via'         => 'smtp',
                'sender_email'     => config('mail.from.address'),
                'recipients_count' => count($validRecipients),
                'recipients'       => $validRecipients,
                'log_id'           => $log->id,
            ]);
        } catch (\Throwable $e) {
            Log::error('General Error during PDF export email: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Terjadi kesalahan saat memproses pengiriman email: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Retrieve recent export report delivery audit logs.
     */
    public function getExportLogs(Request $request): JsonResponse
    {
        $user = auth()->user();
        if ($user && !$user->isAdmin() && !$user->hasPermission('can_export_reports')) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized.',
            ], 403);
        }

        $query = ExportReportLog::query()->latest();

        if (!$user?->isAdmin()) {
            $query->where('user_id', $user->id);
        }

        $logs = $query->limit(20)->get();

        return response()->json([
            'success' => true,
            'logs'    => $logs,
        ]);
    }
}
