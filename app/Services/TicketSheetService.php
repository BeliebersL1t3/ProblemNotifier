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
     * Get color palette for a given ticket status
     */
    public static function getStatusTheme(string $status): array
    {
        if (str_contains($status, 'hod') && !str_contains($status, 'rejected')) {
            return [
                'rowBg'     => ['red' => 254 / 255, 'green' => 249 / 255, 'blue' => 195 / 255], // Pastel Amber (#FEF9C3)
                'badgeBg'   => ['red' => 253 / 255, 'green' => 224 / 255, 'blue' => 71 / 255],  // Rich Amber (#FDE047)
                'badgeText' => ['red' => 146 / 255, 'green' => 64 / 255,  'blue' => 14 / 255],  // Dark Amber (#92400E)
            ];
        } elseif (str_contains($status, 'admin') && !str_contains($status, 'rejected')) {
            return [
                'rowBg'     => ['red' => 224 / 255, 'green' => 242 / 255, 'blue' => 254 / 255], // Pastel Sky (#E0F2FE)
                'badgeBg'   => ['red' => 186 / 255, 'green' => 230 / 255, 'blue' => 253 / 255], // Rich Sky (#BAE6FD)
                'badgeText' => ['red' => 3 / 255,   'green' => 105 / 255, 'blue' => 161 / 255], // Dark Sky (#0369A1)
            ];
        } elseif ($status === 'approved') {
            return [
                'rowBg'     => ['red' => 220 / 255, 'green' => 252 / 255, 'blue' => 231 / 255], // Pastel Green (#DCFCE7)
                'badgeBg'   => ['red' => 187 / 255, 'green' => 247 / 255, 'blue' => 208 / 255], // Rich Green (#BBF7D0)
                'badgeText' => ['red' => 21 / 255,  'green' => 128 / 255, 'blue' => 61 / 255],  // Dark Green (#15803D)
            ];
        } else { // rejected
            return [
                'rowBg'     => ['red' => 255 / 255, 'green' => 228 / 255, 'blue' => 230 / 255], // Pastel Rose (#FFE4E6)
                'badgeBg'   => ['red' => 254 / 255, 'green' => 205 / 255, 'blue' => 211 / 255], // Rich Rose (#FECDD3)
                'badgeText' => ['red' => 190 / 255, 'green' => 18 / 255,  'blue' => 60 / 255],  // Dark Rose (#BE123C)
            ];
        }
    }

    /**
     * Apply header styling, direct row status colors, and conditional formatting rules.
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

            // 2. Direct Row Colors for existing tickets
            $tickets = ApprovalTicket::orderBy('id')->get();
            foreach ($tickets as $idx => $t) {
                $rowIndex = $idx + 1; // 0-based: row 1 is 2nd row in spreadsheet
                $theme = self::getStatusTheme($t->status);

                // Row background (Columns 0 to 18)
                $requests[] = new Request([
                    'repeatCell' => [
                        'range' => [
                            'sheetId'          => $sheetId,
                            'startRowIndex'    => $rowIndex,
                            'endRowIndex'      => $rowIndex + 1,
                            'startColumnIndex' => 0,
                            'endColumnIndex'   => 19,
                        ],
                        'cell' => [
                            'userEnteredFormat' => [
                                'backgroundColor'   => $theme['rowBg'],
                                'wrapStrategy'      => 'WRAP',
                                'verticalAlignment' => 'MIDDLE',
                            ]
                        ],
                        'fields' => 'userEnteredFormat(backgroundColor,wrapStrategy,verticalAlignment)',
                    ]
                ]);

                // Status badge cell (Column 10 / Column K)
                $requests[] = new Request([
                    'repeatCell' => [
                        'range' => [
                            'sheetId'          => $sheetId,
                            'startRowIndex'    => $rowIndex,
                            'endRowIndex'      => $rowIndex + 1,
                            'startColumnIndex' => 10,
                            'endColumnIndex'   => 11,
                        ],
                        'cell' => [
                            'userEnteredFormat' => [
                                'backgroundColor'   => $theme['badgeBg'],
                                'textFormat'        => [
                                    'bold'            => true,
                                    'foregroundColor' => $theme['badgeText'],
                                ],
                                'wrapStrategy'      => 'WRAP',
                                'verticalAlignment' => 'MIDDLE',
                            ]
                        ],
                        'fields' => 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)',
                    ]
                ]);
            }

            // 3. Conditional Formatting Rules using SEARCH for automatic ongoing updates
            $cfRules = [
                // Column K Badges
                ['formula' => '=ISNUMBER(SEARCH("HOD", $K2))', 'range' => [10, 11], 'bg' => ['red' => 253/255, 'green' => 224/255, 'blue' => 71/255], 'text' => ['red' => 146/255, 'green' => 64/255, 'blue' => 14/255]],
                ['formula' => '=ISNUMBER(SEARCH("Admin", $K2))', 'range' => [10, 11], 'bg' => ['red' => 186/255, 'green' => 230/255, 'blue' => 253/255], 'text' => ['red' => 3/255, 'green' => 105/255, 'blue' => 161/255]],
                ['formula' => '=ISNUMBER(SEARCH("Setuju", $K2))', 'range' => [10, 11], 'bg' => ['red' => 187/255, 'green' => 247/255, 'blue' => 208/255], 'text' => ['red' => 21/255, 'green' => 128/255, 'blue' => 61/255]],
                ['formula' => '=ISNUMBER(SEARCH("Tolak", $K2))', 'range' => [10, 11], 'bg' => ['red' => 254/255, 'green' => 205/255, 'blue' => 211/255], 'text' => ['red' => 190/255, 'green' => 18/255, 'blue' => 60/255]],

                // Rows A:S Tint
                ['formula' => '=ISNUMBER(SEARCH("HOD", $K2))', 'range' => [0, 19], 'bg' => ['red' => 254/255, 'green' => 249/255, 'blue' => 195/255], 'text' => null],
                ['formula' => '=ISNUMBER(SEARCH("Admin", $K2))', 'range' => [0, 19], 'bg' => ['red' => 224/255, 'green' => 242/255, 'blue' => 254/255], 'text' => null],
                ['formula' => '=ISNUMBER(SEARCH("Setuju", $K2))', 'range' => [0, 19], 'bg' => ['red' => 220/255, 'green' => 252/255, 'blue' => 231/255], 'text' => null],
                ['formula' => '=ISNUMBER(SEARCH("Tolak", $K2))', 'range' => [0, 19], 'bg' => ['red' => 255/255, 'green' => 228/255, 'blue' => 230/255], 'text' => null],
            ];

            foreach ($cfRules as $idx => $r) {
                $format = ['backgroundColor' => $r['bg']];
                if (!empty($r['text'])) {
                    $format['textFormat'] = ['bold' => true, 'foregroundColor' => $r['text']];
                }
                $requests[] = new Request([
                    'addConditionalFormatRule' => [
                        'rule' => [
                            'ranges' => [[
                                'sheetId'          => $sheetId,
                                'startRowIndex'    => 1,
                                'endRowIndex'      => 1000,
                                'startColumnIndex' => $r['range'][0],
                                'endColumnIndex'   => $r['range'][1],
                            ]],
                            'booleanRule' => [
                                'condition' => [
                                    'type'   => 'CUSTOM_FORMULA',
                                    'values' => [['userEnteredValue' => $r['formula']]],
                                ],
                                'format' => $format,
                            ],
                        ],
                        'index' => $idx,
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
                $finalRow = $targetRow;
            } else {
                // Append new row
                $body = new ValueRange(['values' => [$rowValues]]);
                $appendRes = $sheets->spreadsheets_values->append(
                    $this->spreadsheetId,
                    "{$this->sheetName}!A:S",
                    $body,
                    ['valueInputOption' => 'USER_ENTERED']
                );
                $updatedRange = $appendRes->getUpdates()?->getUpdatedRange();
                $finalRow = null;
                if ($updatedRange && preg_match('/!A(\d+):/', $updatedRange, $m)) {
                    $finalRow = (int)$m[1];
                }
            }

            // Paint status color on the synced row directly
            if ($finalRow !== null) {
                $spreadsheet = $sheets->spreadsheets->get($this->spreadsheetId);
                $sheetId = 0;
                foreach ($spreadsheet->getSheets() as $sheet) {
                    if ($sheet->getProperties()->getTitle() === $this->sheetName) {
                        $sheetId = $sheet->getProperties()->getSheetId();
                        break;
                    }
                }

                $theme = self::getStatusTheme($ticket->status);
                $rowIndex = $finalRow - 1; // 0-based
                $paintRequests = [
                    new Request([
                        'repeatCell' => [
                            'range' => [
                                'sheetId'          => $sheetId,
                                'startRowIndex'    => $rowIndex,
                                'endRowIndex'      => $rowIndex + 1,
                                'startColumnIndex' => 0,
                                'endColumnIndex'   => 19,
                            ],
                            'cell' => [
                                'userEnteredFormat' => [
                                    'backgroundColor'   => $theme['rowBg'],
                                    'wrapStrategy'      => 'WRAP',
                                    'verticalAlignment' => 'MIDDLE',
                                ]
                            ],
                            'fields' => 'userEnteredFormat(backgroundColor,wrapStrategy,verticalAlignment)',
                        ]
                    ]),
                    new Request([
                        'repeatCell' => [
                            'range' => [
                                'sheetId'          => $sheetId,
                                'startRowIndex'    => $rowIndex,
                                'endRowIndex'      => $rowIndex + 1,
                                'startColumnIndex' => 10,
                                'endColumnIndex'   => 11,
                            ],
                            'cell' => [
                                'userEnteredFormat' => [
                                    'backgroundColor'   => $theme['badgeBg'],
                                    'textFormat'        => [
                                        'bold'            => true,
                                        'foregroundColor' => $theme['badgeText'],
                                    ],
                                    'wrapStrategy'      => 'WRAP',
                                    'verticalAlignment' => 'MIDDLE',
                                ]
                            ],
                            'fields' => 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)',
                        ]
                    ])
                ];
                $sheets->spreadsheets->batchUpdate($this->spreadsheetId, new BatchUpdateSpreadsheetRequest(['requests' => $paintRequests]));
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
