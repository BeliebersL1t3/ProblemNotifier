<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ExportReportMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $emailSubject;
    public ?string $customMessage;
    public string $senderName;
    public string $senderDepartment;
    public ?string $senderEmail;
    public array $reportMeta;
    public bool $isNoReply;
    public ?string $pdfFilename;
    public ?string $excelFilename;
    protected $pdfFile;
    protected $excelFile;

    /**
     * Create a new message instance.
     */
    public function __construct(
        string $emailSubject,
        ?string $customMessage,
        string $senderName,
        string $senderDepartment,
        array $reportMeta,
        $pdfFile = null,
        ?string $pdfFilename = 'Telunas_Report.pdf',
        ?string $senderEmail = null,
        bool $isNoReply = false,
        $excelFile = null,
        ?string $excelFilename = 'Telunas_Report.xlsx'
    ) {
        $this->emailSubject = $emailSubject;
        $this->customMessage = $customMessage;
        $this->senderName = $senderName;
        $this->senderDepartment = $senderDepartment;
        $this->senderEmail = $senderEmail;
        $this->reportMeta = $reportMeta;
        $this->pdfFile = $pdfFile;
        $this->pdfFilename = $pdfFilename;
        $this->isNoReply = $isNoReply;
        $this->excelFile = $excelFile;
        $this->excelFilename = $excelFilename;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        $systemFromAddress = config('mail.from.address', 'no-reply@telunasresorts.com');

        if ($this->isNoReply) {
            $fromDisplayName = "Telunas CampusFix (No-Reply)";
            $replyToList = [new Address('no-reply@telunasresorts.com', 'Telunas No-Reply')];
        } else {
            $fromDisplayName = "{$this->senderName} ({$this->senderDepartment}) via Telunas Tracker";
            $replyToList = [];
            if (!empty($this->senderEmail) && filter_var($this->senderEmail, FILTER_VALIDATE_EMAIL)) {
                $replyToList[] = new Address($this->senderEmail, "{$this->senderName} ({$this->senderDepartment})");
            }
        }

        return new Envelope(
            from: new Address($systemFromAddress, $fromDisplayName),
            replyTo: $replyToList,
            subject: $this->emailSubject,
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.export_report',
            with: [
                'emailSubject'     => $this->emailSubject,
                'customMessage'    => $this->customMessage,
                'senderName'       => $this->senderName,
                'senderDepartment' => $this->senderDepartment,
                'reportMeta'       => $this->reportMeta,
                'pdfFilename'      => $this->pdfFile ? $this->pdfFilename : null,
                'excelFilename'    => $this->excelFile ? $this->excelFilename : null,
                'isNoReply'        => $this->isNoReply,
            ],
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, \Illuminate\Mail\Mailables\Attachment>
     */
    public function attachments(): array
    {
        $attachments = [];

        // 1. PDF Attachment
        if ($this->pdfFile) {
            if (is_string($this->pdfFile) && file_exists($this->pdfFile)) {
                $attachments[] = Attachment::fromPath($this->pdfFile)
                    ->as($this->pdfFilename ?: 'Telunas_Report.pdf')
                    ->withMime('application/pdf');
            } elseif (is_object($this->pdfFile) && method_exists($this->pdfFile, 'getRealPath')) {
                $attachments[] = Attachment::fromPath($this->pdfFile->getRealPath())
                    ->as($this->pdfFilename ?: 'Telunas_Report.pdf')
                    ->withMime('application/pdf');
            } elseif (is_string($this->pdfFile)) {
                $attachments[] = Attachment::fromData(fn () => $this->pdfFile, $this->pdfFilename ?: 'Telunas_Report.pdf')
                    ->withMime('application/pdf');
            }
        }

        // 2. Excel Attachment
        if ($this->excelFile) {
            $xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            if (is_string($this->excelFile) && file_exists($this->excelFile)) {
                $attachments[] = Attachment::fromPath($this->excelFile)
                    ->as($this->excelFilename ?: 'Telunas_Report.xlsx')
                    ->withMime($xlsxMime);
            } elseif (is_object($this->excelFile) && method_exists($this->excelFile, 'getRealPath')) {
                $attachments[] = Attachment::fromPath($this->excelFile->getRealPath())
                    ->as($this->excelFilename ?: 'Telunas_Report.xlsx')
                    ->withMime($xlsxMime);
            } elseif (is_string($this->excelFile)) {
                $attachments[] = Attachment::fromData(fn () => $this->excelFile, $this->excelFilename ?: 'Telunas_Report.xlsx')
                    ->withMime($xlsxMime);
            }
        }

        return $attachments;
    }
}
