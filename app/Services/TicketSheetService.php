<?php

namespace App\Services;

use App\Models\ApprovalTicket;
use Carbon\Carbon;
use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Illuminate\Support\Facades\Log;

class TicketSheetService
{
    private ?Sheets $sheets = null;
    private string $spreadsheetId;
    private string $sheetName = 'Sheet1';

    public function __construct()
    {
        $this->spreadsheetId = (string) (config('services.google.tickets_spreadsheet_id') 
            ?: env('GOOGLE_TICKETS_SPREADSHEET_ID', '1uMJNUgTPw-WuA_colsbIzSeVegO9QivjOZ_nAPZ1HWo'));
    }

    private function getSheetsService(): Sheets
    {
        if ($this->sheets === null) {
            $client = new Client();
            $credentialsPath = storage_path(config('services.google.credentials_path', 'app/google-credentials.json'));
            $client->setAuthConfig($credentialsPath);
            $client->addScope([Sheets::SPREADSHEETS]);
            $this->sheets = new Sheets($client);
        }

        return $this->sheets;
    }

    public static function getHeaders(): array
    {
        return [
            'No. Tiket',
            'Tanggal Pengajuan',
            'Tipe Permintaan',
            'Nama Staf',
            'Email',
            'Departemen',
            'Subdivisi',
            'Nilai Saat Ini',
            'Nilai Baru Diminta',
            'Alasan Pengajuan',
            'Status',
            'HOD Peninjau',
            'Catatan HOD',
            'Tanggal Tinjauan HOD',
            'Admin Penyetuju',
            'Catatan Admin',
            'Tanggal ACC Admin',
            'Alasan Penolakan',
            'Terakhir Diperbarui'
        ];
    }

    public static function formatTypeLabel(?string $type): string
    {
        return match ($type) {
            'account_registration' => 'Registrasi Akun Baru',
            'whatsapp_change'      => 'Ubah Nomor WhatsApp',
            'whatsapp_unlink'      => 'Unlink Nomor WhatsApp',
            'password_reset'       => 'Reset Password Akun',
            'department_transfer'  => 'Mutasi Departemen',
            default                => (string)$type,
        };
    }

    public static function formatStatusLabel(?string $status): string
    {
        return match ($status) {
            'pending_hod'    => 'Menunggu Persetujuan HOD',
            'pending_admin'  => 'Menunggu ACC Admin',
            'approved'       => 'Disetujui (Approved)',
            'rejected_hod'   => 'Ditolak HOD',
            'rejected_admin' => 'Ditolak Admin',
            'rejected'       => 'Ditolak (Rejected)',
            default          => strtoupper((string)$status),
        };
    }

    public function formatTicketRow(ApprovalTicket $ticket): array
    {
        $ticket->loadMissing(['user', 'hod', 'admin']);

        $createdAt = $ticket->created_at 
            ? Carbon::parse($ticket->created_at)->timezone('Asia/Jakarta')->format('Y-m-d H:i:s') 
            : '';

        $hodReviewedAt = $ticket->hod_reviewed_at 
            ? Carbon::parse($ticket->hod_reviewed_at)->timezone('Asia/Jakarta')->format('Y-m-d H:i:s') 
            : '';

        $adminReviewedAt = $ticket->admin_reviewed_at 
            ? Carbon::parse($ticket->admin_reviewed_at)->timezone('Asia/Jakarta')->format('Y-m-d H:i:s') 
            : '';

        $updatedAt = $ticket->updated_at 
            ? Carbon::parse($ticket->updated_at)->timezone('Asia/Jakarta')->format('Y-m-d H:i:s') 
            : Carbon::now('Asia/Jakarta')->format('Y-m-d H:i:s');

        $hodName = $ticket->hod ? ($ticket->hod->staff_name ?: $ticket->hod->name) : '';
        $adminName = $ticket->admin ? ($ticket->admin->staff_name ?: $ticket->admin->name) : '';

        return [
            $ticket->ticket_number,
            $createdAt,
            self::formatTypeLabel($ticket->type),
            $ticket->staff_name ?: ($ticket->user?->staff_name ?: $ticket->user?->name ?: ''),
            $ticket->email ?: ($ticket->user?->email ?: ''),
            $ticket->department ?: '',
            $ticket->subdivision ?: '',
            $ticket->current_value ?: '-',
            $ticket->requested_value ?: '-',
            $ticket->reason ?: '-',
            self::formatStatusLabel($ticket->status),
            $hodName ?: '-',
            $ticket->hod_notes ?: '-',
            $hodReviewedAt ?: '-',
            $adminName ?: '-',
            $ticket->admin_notes ?: '-',
            $adminReviewedAt ?: '-',
            $ticket->rejection_reason ?: '-',
            $updatedAt,
        ];
    }

    /**
     * Ensure header row exists in the spreadsheet
     */
    public function ensureHeaders(): void
    {
        try {
            $sheets = $this->getSheetsService();
            $res = $sheets->spreadsheets_values->get($this->spreadsheetId, "{$this->sheetName}!A1:S1");
            $rows = $res->getValues();

            if (empty($rows) || empty($rows[0])) {
                $body = new ValueRange(['values' => [self::getHeaders()]]);
                $sheets->spreadsheets_values->update(
                    $this->spreadsheetId,
                    "{$this->sheetName}!A1:S1",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            }
        } catch (\Throwable $e) {
            Log::error("Failed to ensure headers in Ticket Spreadsheet: " . $e->getMessage());
        }
    }

    /**
     * Sync single ticket to Google Sheets (Insert or Update)
     */
    public function syncTicket(ApprovalTicket $ticket): bool
    {
        if (empty($this->spreadsheetId)) {
            return false;
        }

        try {
            $this->ensureHeaders();
            $sheets = $this->getSheetsService();
            $rowValues = $this->formatTicketRow($ticket);

            // Fetch column A (ticket numbers) to check if row already exists
            $res = $sheets->spreadsheets_values->get($this->spreadsheetId, "{$this->sheetName}!A2:A");
            $existingNumbers = $res->getValues() ?? [];

            $targetRow = null;
            foreach ($existingNumbers as $idx => $row) {
                if (isset($row[0]) && trim($row[0]) === trim($ticket->ticket_number)) {
                    $targetRow = $idx + 2; // 1-indexed, starts at row 2
                    break;
                }
            }

            if ($targetRow !== null) {
                // Update existing row
                $body = new ValueRange(['values' => [$rowValues]]);
                $sheets->spreadsheets_values->update(
                    $this->spreadsheetId,
                    "{$this->sheetName}!A{$targetRow}:S{$targetRow}",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            } else {
                // Append new row
                $body = new ValueRange(['values' => [$rowValues]]);
                $sheets->spreadsheets_values->append(
                    $this->spreadsheetId,
                    "{$this->sheetName}!A:S",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
            }

            return true;
        } catch (\Throwable $e) {
            Log::error("Error syncing ticket {$ticket->ticket_number} to Google Sheet: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Backfill/sync all tickets from database into Google Sheet
     */
    public function syncAllTickets(): int
    {
        if (empty($this->spreadsheetId)) {
            throw new \Exception("Ticket Spreadsheet ID is not configured.");
        }

        $this->ensureHeaders();
        $sheets = $this->getSheetsService();

        $tickets = ApprovalTicket::with(['user', 'hod', 'admin'])->orderBy('id')->get();
        if ($tickets->isEmpty()) {
            return 0;
        }

        $allRows = [];
        foreach ($tickets as $t) {
            $allRows[] = $this->formatTicketRow($t);
        }

        // Overwrite rows from A2 downwards
        $endRow = count($allRows) + 1;
        $body = new ValueRange(['values' => $allRows]);
        $sheets->spreadsheets_values->update(
            $this->spreadsheetId,
            "{$this->sheetName}!A2:S{$endRow}",
            $body,
            ['valueInputOption' => 'USER_ENTERED']
        );

        return count($allRows);
    }
}
