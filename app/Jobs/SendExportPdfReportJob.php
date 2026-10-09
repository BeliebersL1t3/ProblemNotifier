<?php

namespace App\Jobs;

use App\Mail\ExportReportMail;
use App\Models\ExportReportLog;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendExportPdfReportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;
    public int $timeout = 60;

    /**
     * Create a new job instance.
     *
     * @param string|null $tempFilePath Path to temporary stored PDF file
     * @param string|null $pdfFilename User-facing name of the PDF attachment
     * @param array $recipients Array of verified recipient email addresses
     * @param string $subject Subject line of email
     * @param string|null $customMessage Optional custom body text
     * @param string $senderName Sender full name
     * @param string $senderDept Sender department
     * @param string|null $senderEmail Sender email address
     * @param array $reportMeta Report metadata
     * @param int|null $logId ID of ExportReportLog record
     * @param string|null $tempExcelFilePath Path to temporary stored Excel file
     * @param string|null $excelFilename User-facing name of the Excel attachment
     */
    public function __construct(
        public ?string $tempFilePath,
        public ?string $pdfFilename,
        public array $recipients,
        public string $subject,
        public ?string $customMessage,
        public string $senderName,
        public string $senderDept,
        public ?string $senderEmail = null,
        public array $reportMeta = [],
        public ?int $logId = null,
        public ?string $tempExcelFilePath = null,
        public ?string $excelFilename = null
    ) {}

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        try {
            $mailable = new ExportReportMail(
                emailSubject: $this->subject,
                customMessage: $this->customMessage,
                senderName: $this->senderName,
                senderDepartment: $this->senderDept,
                reportMeta: $this->reportMeta,
                pdfFile: $this->tempFilePath,
                pdfFilename: $this->pdfFilename,
                senderEmail: $this->senderEmail,
                isNoReply: false,
                excelFile: $this->tempExcelFilePath,
                excelFilename: $this->excelFilename
            );

            Mail::to($this->recipients)->send($mailable);

            if ($this->logId) {
                ExportReportLog::where('id', $this->logId)->update([
                    'status'   => 'sent',
                    'sent_via' => 'smtp',
                ]);
            }

            $attachmentInfo = array_filter([$this->pdfFilename, $this->excelFilename]);
            $attachmentNames = implode(' & ', $attachmentInfo) ?: 'Report';
            Log::info("SendExportPdfReportJob: Report '{$attachmentNames}' successfully emailed to " . count($this->recipients) . " recipients.");
        } catch (\Throwable $e) {
            $attachmentInfo = array_filter([$this->pdfFilename, $this->excelFilename]);
            $attachmentNames = implode(' & ', $attachmentInfo) ?: 'Report';
            Log::error("SendExportPdfReportJob: Failed to send report '{$attachmentNames}': " . $e->getMessage());

            if ($this->logId) {
                ExportReportLog::where('id', $this->logId)->update([
                    'status'        => 'failed',
                    'error_message' => $e->getMessage(),
                ]);
            }

            throw $e;
        } finally {
            // Secure cleanup of temporary files strictly within storage directory
            $storageBase = realpath(storage_path('app'));
            foreach ([$this->tempFilePath, $this->tempExcelFilePath] as $filePath) {
                if (!empty($filePath) && file_exists($filePath)) {
                    $realPath = realpath($filePath);
                    if ($realPath && $storageBase && str_starts_with($realPath, $storageBase)) {
                        @unlink($realPath);
                    }
                }
            }
        }
    }
}
