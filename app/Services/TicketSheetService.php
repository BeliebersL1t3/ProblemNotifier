<?php

namespace App\Services;

use App\Models\ApprovalTicket;
use Carbon\Carbon;
use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\BatchUpdateSpreadsheetRequest;
use Google\Service\Sheets\Request;
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

    public static function formatPhone(?string $phone): string
    {
        if (!$phone || trim($phone) === '' || $phone === '-') {
            return '-';
        }

        $digits = preg_replace('/\D/', '', $phone);
        if (empty($digits)) {
            return '-';
        }

        // Strip leading 00 or 0
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        } elseif (str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }

        // Prepend Indonesian country code 62 if missing
        if (str_starts_with($digits, '8')) {
            $digits = '62' . $digits;
        }

        // Single quote prefix forces Google Sheets to treat +62... as a string, left-aligned, without dropping the +
        return "'+{$digits}";
    }

    public static function formatValues(ApprovalTicket $ticket): array
    {
        $current = $ticket->current_value;
        $requested = $ticket->requested_value;

        switch ($ticket->type) {
            case 'whatsapp_change':
                return [
                    self::formatPhone($current),
                    self::formatPhone($requested),
                ];

            case 'whatsapp_unlink':
                return [
                    self::formatPhone($current),
                    'Lepas Tautan (Unlink)',
                ];

            case 'account_registration':
                return [
                    '-',
                    self::formatPhone($requested),
                ];

            case 'password_reset':
                return [
                    '-',
                    'Reset Kata Sandi Diminta',
                ];

            case 'department_transfer':
                $curr = $current ?: ($ticket->department ?: '-');
                $req = $requested ? str_replace('::', ' — ', $requested) : '-';
                return [$curr, $req];

            default:
                if ($requested && str_starts_with($requested, '$2y$')) {
                    $requested = 'Reset Kata Sandi Diminta';
                }
                return [$current ?: '-', $requested ?: '-'];
        }
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

        [$formattedCurrent, $formattedRequested] = self::formatValues($ticket);

        return [
            $ticket->ticket_number,
            $createdAt,
            self::formatTypeLabel($ticket->type),
            $ticket->staff_name ?: ($ticket->user?->staff_name ?: $ticket->user?->name ?: ''),
            $ticket->email ?: ($ticket->user?->email ?: ''),
            $ticket->department ?: '',
            $ticket->subdivision ?: '',
            $formattedCurrent,
            $formattedRequested,
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
     * Ensure header row exists in the spreadsheet and formatting is applied
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

            $this->setupSheetFormatting();
        } catch (\Throwable $e) {
            Log::error("Failed to ensure headers in Ticket Spreadsheet: " . $e->getMessage());
        }
    }

    /**
     * Apply header styling, cell wrapping, and status-based conditional formatting rules.
     */
    public function setupSheetFormatting(): void
    {
        if (empty($this->spreadsheetId)) {
            return;
        }

        try {
            $sheets = $this->getSheetsService();
            $spreadsheet = $sheets->spreadsheets->get($this->spreadsheetId);
            $sheetId = 0;
            foreach ($spreadsheet->getSheets() as $sheet) {
                if ($sheet->getProperties()->getTitle() === $this->sheetName) {
                    $sheetId = $sheet->getProperties()->getSheetId();
                    $existingRules = $sheet->getConditionalFormats() ?: [];
                    // Clear existing rules to avoid duplicate rules
                    if (!empty($existingRules)) {
                        $deleteRequests = [];
                        for ($i = count($existingRules) - 1; $i >= 0; $i--) {
                            $deleteRequests[] = new Request([
                                'deleteConditionalFormatRule' => [
                                    'sheetId' => $sheetId,
                                    'index'   => $i,
                                ]
                            ]);
                        }
                        $batchReq = new BatchUpdateSpreadsheetRequest(['requests' => $deleteRequests]);
                        $sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batchReq);
                    }
                    break;
                }
            }

            $requests = [];

            // 1. Bold Header Row with Telunas Sand Gold Theme (Row 1, A1:S1)
            $requests[] = new Request([
                'repeatCell' => [
                    'range' => [
                        'sheetId'          => $sheetId,
                        'startRowIndex'    => 0,
                        'endRowIndex'      => 1,
                        'startColumnIndex' => 0,
                        'endColumnIndex'   => 19,
                    ],
                    'cell' => [
                        'userEnteredFormat' => [
                            'backgroundColor' => [
                                'red'   => 227 / 255,
                                'green' => 209 / 255,
                                'blue'  => 170 / 255,
                            ],
                            'textFormat' => [
                                'bold'            => true,
                                'foregroundColor' => [
                                    'red'   => 28 / 255,
                                    'green' => 27 / 255,
                                    'blue'  => 14 / 255,
                                ],
                            ],
                            'verticalAlignment' => 'MIDDLE',
                        ]
                    ],
                    'fields' => 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
                ]
            ]);

            // 2. Wrap text & center vertical alignment for data rows (Rows 2-1000)
            $requests[] = new Request([
                'repeatCell' => [
                    'range' => [
                        'sheetId'          => $sheetId,
                        'startRowIndex'    => 1,
                        'endRowIndex'      => 1000,
                        'startColumnIndex' => 0,
                        'endColumnIndex'   => 19,
                    ],
                    'cell' => [
                        'userEnteredFormat' => [
                            'wrapStrategy'      => 'WRAP',
                            'verticalAlignment' => 'MIDDLE',
                        ]
                    ],
                    'fields' => 'userEnteredFormat(wrapStrategy,verticalAlignment)',
                ]
            ]);

            // 3. Conditional Formatting Rules
            // A. Status Column Badge (Column K, index 10 to 11): Vibrant background with bold colored text
            $statusBadgeRules = [
                [
                    'formula' => '=$K2="Menunggu ACC HOD"',
                    'bg'      => ['red' => 254 / 255, 'green' => 240 / 255, 'blue' => 138 / 255], // Amber/Yellow
                    'text'    => ['red' => 146 / 255, 'green' => 64 / 255,  'blue' => 14 / 255],
                ],
                [
                    'formula' => '=$K2="Menunggu ACC Admin"',
                    'bg'      => ['red' => 186 / 255, 'green' => 230 / 255, 'blue' => 253 / 255], // Blue
                    'text'    => ['red' => 3 / 255,   'green' => 105 / 255, 'blue' => 161 / 255],
                ],
                [
                    'formula' => '=$K2="Disetujui (ACC Final)"',
                    'bg'      => ['red' => 187 / 255, 'green' => 247 / 255, 'blue' => 208 / 255], // Green
                    'text'    => ['red' => 21 / 255,  'green' => 128 / 255, 'blue' => 61 / 255],
                ],
                [
                    'formula' => '=$K2="Ditolak"',
                    'bg'      => ['red' => 254 / 255, 'green' => 205 / 255, 'blue' => 211 / 255], // Red
                    'text'    => ['red' => 190 / 255, 'green' => 18 / 255,  'blue' => 60 / 255],
                ],
            ];

            foreach ($statusBadgeRules as $r) {
                $requests[] = new Request([
                    'addConditionalFormatRule' => [
                        'rule' => [
                            'ranges' => [[
                                'sheetId'          => $sheetId,
                                'startRowIndex'    => 1,
                                'endRowIndex'      => 1000,
                                'startColumnIndex' => 10,
                                'endColumnIndex'   => 11,
                            ]],
                            'booleanRule' => [
                                'condition' => [
                                    'type'   => 'CUSTOM_FORMULA',
                                    'values' => [['userEnteredValue' => $r['formula']]],
                                ],
                                'format' => [
                                    'backgroundColor' => $r['bg'],
                                    'textFormat'      => ['bold' => true, 'foregroundColor' => $r['text']],
                                ],
                            ],
                        ],
                        'index' => count($requests),
                    ]
                ]);
            }

            // B. Whole Row Soft Pastel Tint (Columns A to S, index 0 to 19):
            // Allows instant visual status recognition when looking at Ticket Number, Staff, Email, etc.
            $rowTintRules = [
                [
                    'formula' => '=$K2="Menunggu ACC HOD"',
                    'bg'      => ['red' => 254 / 255, 'green' => 249 / 255, 'blue' => 195 / 255], // Soft Amber
                ],
                [
                    'formula' => '=$K2="Menunggu ACC Admin"',
                    'bg'      => ['red' => 224 / 255, 'green' => 242 / 255, 'blue' => 254 / 255], // Soft Blue
                ],
                [
                    'formula' => '=$K2="Disetujui (ACC Final)"',
                    'bg'      => ['red' => 220 / 255, 'green' => 252 / 255, 'blue' => 231 / 255], // Soft Green
                ],
                [
                    'formula' => '=$K2="Ditolak"',
                    'bg'      => ['red' => 255 / 255, 'green' => 228 / 255, 'blue' => 230 / 255], // Soft Rose
                ],
            ];

            foreach ($rowTintRules as $r) {
                $requests[] = new Request([
                    'addConditionalFormatRule' => [
                        'rule' => [
                            'ranges' => [[
                                'sheetId'          => $sheetId,
                                'startRowIndex'    => 1,
                                'endRowIndex'      => 1000,
                                'startColumnIndex' => 0,
                                'endColumnIndex'   => 19,
                            ]],
                            'booleanRule' => [
                                'condition' => [
                                    'type'   => 'CUSTOM_FORMULA',
                                    'values' => [['userEnteredValue' => $r['formula']]],
                                ],
                                'format' => [
                                    'backgroundColor' => $r['bg'],
                                ],
                            ],
                        ],
                        'index' => count($requests),
                    ]
                ]);
            }

            $batch = new BatchUpdateSpreadsheetRequest(['requests' => $requests]);
            $sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batch);
        } catch (\Throwable $e) {
            Log::error("Failed to setup conditional formatting for tickets sheet: " . $e->getMessage());
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

        $this->setupSheetFormatting();

        return count($allRows);
    }
}
