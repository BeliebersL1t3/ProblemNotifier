<?php

namespace App\Http\Controllers;

use App\Mail\ExportReportMail;
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
            'pdf_file' => 'required|file|max:25600', // max 25MB
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
        $senderName = $sender ? $sender->name : 'Telunas Staff';
        $senderDept = $sender ? ($sender->department ?: 'General') : 'Telunas Resorts';
        $senderEmail = $sender ? $sender->email : null;

        $subject = trim($request->input('subject'));
        $customMessage = $request->input('message');

        $uploadedFile = $request->file('pdf_file');
        $originalFilename = $uploadedFile->getClientOriginalName() ?: ('Telunas_Report_' . date('Y-m-d') . '.pdf');

        // Check if user has connected their personal Google/Gmail account
        if ($sender && $sender->hasGoogleMailConnected()) {
            try {
                $htmlBody = view('emails.export_report', [
                    'emailSubject'     => $subject,
                    'customMessage'    => $customMessage,
                    'senderName'       => $senderName,
                    'senderDepartment' => $senderDept,
                    'reportMeta'       => $reportMeta,
                    'pdfFilename'      => $originalFilename,
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
            $mailable = new ExportReportMail(
                emailSubject: $subject,
                customMessage: $customMessage,
                senderName: $senderName,
                senderDepartment: $senderDept,
                reportMeta: $reportMeta,
                pdfFile: $uploadedFile,
                pdfFilename: $originalFilename,
                senderEmail: $senderEmail
            );

            Mail::to($validRecipients)->send($mailable);

            return response()->json([
                'success'          => true,
                'message'          => 'Laporan PDF berhasil dikirimkan via email ke ' . count($validRecipients) . ' penerima.',
                'sent_via'         => 'smtp',
                'sender_email'     => config('mail.from.address'),
                'recipients_count' => count($validRecipients),
                'recipients'       => $validRecipients,
            ]);
        } catch (TransportExceptionInterface $e) {
            Log::error('SMTP Transport Error during PDF export email: ' . $e->getMessage());

            $mailer = config('mail.default');
            $host = config("mail.mailers.{$mailer}.host");

            return response()->json([
                'success' => false,
                'message' => 'Gagal menghubungkan ke server SMTP (' . ($host ?: 'Host belum disetel') . '). Pastikan MAIL_HOST, MAIL_USERNAME, dan MAIL_PASSWORD pada file .env sudah dikonfigurasi dengan benar.',
                'detail'  => $e->getMessage(),
            ], 500);
        } catch (\Throwable $e) {
            Log::error('General Error during PDF export email: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Terjadi kesalahan saat mengirimkan email: ' . $e->getMessage(),
            ], 500);
        }
    }
}
