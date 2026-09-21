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
    protected $pdfFile;
    protected string $pdfFilename;

    /**
     * Create a new message instance.
     */
    public function __construct(
        string $emailSubject,
        ?string $customMessage,
        string $senderName,
        string $senderDepartment,
        array $reportMeta,
        $pdfFile,
        string $pdfFilename = 'Telunas_Report.pdf',
        ?string $senderEmail = null
    ) {
        $this->emailSubject = $emailSubject;
        $this->customMessage = $customMessage;
        $this->senderName = $senderName;
        $this->senderDepartment = $senderDepartment;
        $this->senderEmail = $senderEmail;
        $this->reportMeta = $reportMeta;
        $this->pdfFile = $pdfFile;
        $this->pdfFilename = $pdfFilename;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        $systemFromAddress = config('mail.from.address', 'no-reply@telunasresorts.com');
        $fromDisplayName = "{$this->senderName} ({$this->senderDepartment}) via Telunas Tracker";

        $replyToList = [];
        if (!empty($this->senderEmail) && filter_var($this->senderEmail, FILTER_VALIDATE_EMAIL)) {
            $replyToList[] = new Address($this->senderEmail, "{$this->senderName} ({$this->senderDepartment})");
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
                'pdfFilename'      => $this->pdfFilename,
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
        if (is_string($this->pdfFile) && file_exists($this->pdfFile)) {
            return [
                Attachment::fromPath($this->pdfFile)
                    ->as($this->pdfFilename)
                    ->withMime('application/pdf'),
            ];
        }

        if (is_object($this->pdfFile) && method_exists($this->pdfFile, 'getRealPath')) {
            return [
                Attachment::fromPath($this->pdfFile->getRealPath())
                    ->as($this->pdfFilename)
                    ->withMime('application/pdf'),
            ];
        }

        if (is_string($this->pdfFile)) {
            return [
                Attachment::fromData(fn () => $this->pdfFile, $this->pdfFilename)
                    ->withMime('application/pdf'),
            ];
        }

        return [];
    }
}
