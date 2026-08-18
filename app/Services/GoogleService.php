<?php

namespace App\Services;

use Google\Client;
use Google\Service\Drive;
use Google\Service\Drive\DriveFile;
use Google\Service\Drive\Permission;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Google\Service\Sheets\BatchUpdateValuesRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;

class GoogleService
{
    private Client $client;
    private Drive $drive;
    private Sheets $sheets;
    private string $spreadsheetId;
    private string $folderId;
    private string $sheetName = 'Sheet1';

    public function __construct()
    {
        $this->client = new Client();
        $this->client->setAuthConfig(storage_path(config('services.google.credentials_path')));
        $this->client->addScope([Drive::DRIVE, Sheets::SPREADSHEETS]);

        $this->drive         = new Drive($this->client);
        $this->sheets        = new Sheets($this->client);
        $this->spreadsheetId = config('services.google.spreadsheet_id');
        $this->folderId      = config('services.google.drive_folder_id');
    }

    /** Clear local cache for sheets list or rows. */
    public function clearCache(?string $sheetName = null): void
    {
        Cache::forget('google_sheets_list');
        $targetSheet = $sheetName ?? $this->sheetName;
        Cache::forget("google_sheet_rows_{$targetSheet}");
    }

    /** Set the active sheet name for subsequent operations. */
    public function setSheet(string $name): void
    {
        $this->sheetName = $name;
    }

    /** Return the active sheet name. */
    public function getSheetName(): string
    {
        return $this->sheetName;
    }

    /**
     * List all sheet tab names in the spreadsheet, ordered by position.
     * Returns an array like ['Sheet1', '2026', '2027']
     */
    public function listSheets(bool $forceRefresh = false): array
    {
        if ($forceRefresh) {
            Cache::forget('google_sheets_list');
        }

        try {
            return Cache::remember('google_sheets_list', 60, function () {
                $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
                $names = [];
                foreach ($spreadsheet->getSheets() as $sheet) {
                    $names[] = $sheet->getProperties()->getTitle();
                }
                return $names;
            });
        } catch (\Throwable $e) {
            if (Cache::has('google_sheets_list')) {
                return Cache::get('google_sheets_list');
            }
            throw $e;
        }
    }

    /**
     * Create a new sheet tab named $name (e.g. "2027") and add a header row.
     * Returns true on success.
     */
    public function createYearSheet(string $name): bool
    {
        // 1. Add the sheet tab
        $addSheetRequest = new \Google\Service\Sheets\Request([
            'addSheet' => [
                'properties' => ['title' => $name]
            ]
        ]);

        $batchReq = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest([
            'requests' => [$addSheetRequest]
        ]);

        $this->sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batchReq);

        // 2. Write the header row to the new sheet
        $headers = [[
            'ID', 'Title', 'Description', 'Location', 'Category',
            'Status', 'Reporter', 'Submitted At', 'Image URL',
            'Taker', 'Taken At', 'Solver', 'Solved At',
            'Fix Description', 'Proof Image URL', 'Duration',
            'Priority', 'Deadline', 'Pending Reason', 'Pending By',
            'Pending Image URL', 'Tagged Departments', 'Origin Department'
        ]];

        $body = new ValueRange(['values' => $headers]);
        $this->sheets->spreadsheets_values->update(
            $this->spreadsheetId,
            "{$name}!A1:W1",
            $body,
            ['valueInputOption' => 'RAW']
        );

        // 3. Apply automatic formatting & conditional rules to the new sheet
        $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
        $newSheetId  = null;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() === $name) {
                $newSheetId = $sheet->getProperties()->getSheetId();
                break;
            }
        }

        if ($newSheetId !== null) {
            $this->setupSheetFormatting($newSheetId);
        }

        $this->clearCache();

        return true;
    }

    /**
     * Automatically setup formatting rules for a sheet (Bold headers, Text Wrap, Top Alignment, and Status Conditional Colors ONLY for Column F).
     */
    public function setupSheetFormatting(int $sheetId): void
    {
        $requests = [];

        // 0. Clear existing conditional format rules on this sheet to remove whole-row rules
        try {
            $spreadsheetObj = $this->sheets->spreadsheets->get($this->spreadsheetId);
            foreach ($spreadsheetObj->getSheets() as $sh) {
                if ($sh->getProperties()->getSheetId() === $sheetId) {
                    $existingRules = $sh->getConditionalFormats() ?: [];
                    for ($i = count($existingRules) - 1; $i >= 0; $i--) {
                        $requests[] = new \Google\Service\Sheets\Request([
                            'deleteConditionalFormatRule' => [
                                'sheetId' => $sheetId,
                                'index'   => $i,
                            ]
                        ]);
                    }
                    break;
                }
            }
        } catch (\Throwable $e) {}

        // 1. Set Text Wrap and Top Vertical Alignment for all cells
        $requests[] = new \Google\Service\Sheets\Request([
            'repeatCell' => [
                'range' => [
                    'sheetId'          => $sheetId,
                    'startRowIndex'    => 0,
                    'endRowIndex'      => 1000,
                    'startColumnIndex' => 0,
                    'endColumnIndex'   => 23,
                ],
                'cell' => [
                    'userEnteredFormat' => [
                        'wrapStrategy'      => 'WRAP',
                        'verticalAlignment' => 'TOP',
                    ]
                ],
                'fields' => 'userEnteredFormat(wrapStrategy,verticalAlignment)',
            ]
        ]);

        // 2. Bold header row
        $requests[] = new \Google\Service\Sheets\Request([
            'repeatCell' => [
                'range' => [
                    'sheetId'          => $sheetId,
                    'startRowIndex'    => 0,
                    'endRowIndex'      => 1,
                    'startColumnIndex' => 0,
                    'endColumnIndex'   => 23,
                ],
                'cell'   => ['userEnteredFormat' => ['textFormat' => ['bold' => true]]],
                'fields' => 'userEnteredFormat.textFormat.bold',
            ]
        ]);

        // 3. Add Conditional Formatting Rules ONLY for Status (Column F - Index 5 to 6)
        $rules = [
            [
                'formula' => '=$F1="open"',
                'bg'      => ['red' => 0.95, 'green' => 0.15, 'blue' => 0.15],
                'text'    => ['red' => 1.0, 'green' => 1.0, 'blue' => 1.0],
            ],
            [
                'formula' => '=$F1="progress"',
                'bg'      => ['red' => 1.0, 'green' => 0.92, 'blue' => 0.01],
                'text'    => ['red' => 0.0, 'green' => 0.0, 'blue' => 0.0],
            ],
            [
                'formula' => '=$F1="solved"',
                'bg'      => ['red' => 0.15, 'green' => 0.68, 'blue' => 0.38],
                'text'    => ['red' => 1.0, 'green' => 1.0, 'blue' => 1.0],
            ],
            [
                'formula' => '=$F1="pending"',
                'bg'      => ['red' => 0.95, 'green' => 0.45, 'blue' => 0.07],
                'text'    => ['red' => 1.0, 'green' => 1.0, 'blue' => 1.0],
            ],
        ];

        foreach ($rules as $idx => $r) {
            $requests[] = new \Google\Service\Sheets\Request([
                'addConditionalFormatRule' => [
                    'rule' => [
                        'ranges' => [[
                            'sheetId'          => $sheetId,
                            'startRowIndex'    => 0,
                            'endRowIndex'      => 1000,
                            'startColumnIndex' => 5, // COLUMN F ONLY (0-based: A=0, B=1, C=2, D=3, E=4, F=5)
                            'endColumnIndex'   => 6,
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
                    'index' => $idx,
                ]
            ]);
        }

        $batch = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest(['requests' => $requests]);
        $this->sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batch);
    }

    /** Helper to run setupSheetFormatting on the active sheet. */
    public function setupActiveSheetFormatting(?string $sheetName = null): void
    {
        $targetSheet = $sheetName ?? $this->sheetName;
        $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
        $targetSheetId = null;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() === $targetSheet) {
                $targetSheetId = $sheet->getProperties()->getSheetId();
                break;
            }
        }
        if ($targetSheetId !== null) {
            $this->setupSheetFormatting($targetSheetId);
        }
    }

    /**
     * Delete a sheet tab named $name (e.g. "2026").
     * Returns true on success.
     */
    public function deleteSheet(string $name): bool
    {
        $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
        $sheetIdToDelete = null;
        $allSheets = $spreadsheet->getSheets();

        if (count($allSheets) <= 1) {
            throw new \Exception("Cannot delete the only sheet in the spreadsheet.");
        }

        foreach ($allSheets as $sheet) {
            if ($sheet->getProperties()->getTitle() === $name) {
                $sheetIdToDelete = $sheet->getProperties()->getSheetId();
                break;
            }
        }

        if ($sheetIdToDelete === null) {
            throw new \Exception("Sheet '{$name}' not found.");
        }

        $deleteSheetRequest = new \Google\Service\Sheets\Request([
            'deleteSheet' => [
                'sheetId' => $sheetIdToDelete
            ]
        ]);

        $batchReq = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest([
            'requests' => [$deleteSheetRequest]
        ]);

        $this->sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batchReq);

        $this->clearCache($name);

        return true;
    }

    /**
     * Search all sheets for a row matching the given issue ID.
     * Returns ['sheet' => sheetName, 'rowIndex' => int] or null if not found.
     */
    public function findIssueAcrossSheets(string $issueId): ?array
    {
        $allSheets = $this->listSheets();
        foreach ($allSheets as $sheetName) {
            $response = $this->sheets->spreadsheets_values->get(
                $this->spreadsheetId,
                "{$sheetName}!A2:A"
            );
            $values = $response->getValues() ?? [];
            foreach ($values as $idx => $row) {
                if (($row[0] ?? '') === $issueId) {
                    return ['sheet' => $sheetName, 'rowIndex' => $idx + 2]; // 1-based, skip header
                }
            }
        }
        return null;
    }

    /** Return all issue rows (skips header row 1), each padded to 23 columns. */
    public function getRows(bool $forceRefresh = false): array
    {
        $cacheKey = "google_sheet_rows_{$this->sheetName}";
        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        try {
            return Cache::remember($cacheKey, 20, function () {
                $response = $this->sheets->spreadsheets_values->get(
                    $this->spreadsheetId,
                    "{$this->sheetName}!A2:W"
                );

                $values = $response->getValues() ?? [];

                // Pad every row to 23 columns so missing trailing cells don't cause errors
                return array_map(fn($row) => array_pad($row, 23, ''), $values);
            });
        } catch (\Throwable $e) {
            if (Cache::has($cacheKey)) {
                return Cache::get($cacheKey);
            }
            throw $e;
        }
    }

    /** Append a new row. Returns the row index. */
    public function appendRow(array $values): ?int
    {
        $this->clearCache();
        $body = new ValueRange(['values' => [array_pad($values, 23, '')]]);
        $response = $this->sheets->spreadsheets_values->append(
            $this->spreadsheetId,
            "{$this->sheetName}!A:W",
            $body,
            ['valueInputOption' => 'RAW', 'insertDataOption' => 'INSERT_ROWS']
        );
        
        $updates = $response->getUpdates();
        if ($updates) {
            $range = $updates->getUpdatedRange();
            if (preg_match('/(\d+)$/', $range, $matches)) {
                return (int)$matches[1];
            }
        }
        return null;
    }

    /** Colors a specific row with a consistent pastel color based on the category string */
    public function colorRowByCategory(int $rowIndex, string $category): void
    {
        // Get Sheet ID
        $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
        $sheetId = 0;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() === $this->sheetName) {
                $sheetId = $sheet->getProperties()->getSheetId();
                break;
            }
        }

        $categoryColors = [
            'broken'         => ['red' => 0.99, 'green' => 0.88, 'blue' => 0.88], // Pastel Red
            'plumbing'       => ['red' => 0.86, 'green' => 0.92, 'blue' => 0.99], // Pastel Blue
            'electrical'     => ['red' => 0.99, 'green' => 0.95, 'blue' => 0.78], // Pastel Yellow
            'structural'     => ['red' => 1.00, 'green' => 0.93, 'blue' => 0.83], // Pastel Orange
            'pest-hygiene'   => ['red' => 0.82, 'green' => 0.98, 'blue' => 0.90], // Pastel Emerald
            'it-technology'  => ['red' => 0.93, 'green' => 0.91, 'blue' => 0.99], // Pastel Violet
            'marine-outdoor' => ['red' => 0.81, 'green' => 0.98, 'blue' => 0.99], // Pastel Cyan
            'safety-hazard'  => ['red' => 0.99, 'green' => 0.85, 'blue' => 0.85], // Soft Red
            'guest-issues'   => ['red' => 0.99, 'green' => 0.90, 'blue' => 0.95], // Pastel Pink
            'other'          => ['red' => 0.95, 'green' => 0.96, 'blue' => 0.97], // Pastel Gray
        ];

        $catKey = strtolower(trim($category));
        $bgColor = $categoryColors[$catKey] ?? null;

        if (!$bgColor) {
            $hash = md5($catKey);
            $r = (hexdec(substr($hash, 0, 2)) / 255.0 + 1.0) / 2.0;
            $g = (hexdec(substr($hash, 2, 2)) / 255.0 + 1.0) / 2.0;
            $b = (hexdec(substr($hash, 4, 2)) / 255.0 + 1.0) / 2.0;
            $bgColor = ['red' => $r, 'green' => $g, 'blue' => $b];
        }

        $requests = [
            new \Google\Service\Sheets\Request([
                'repeatCell' => [
                    'range' => [
                        'sheetId' => $sheetId,
                        'startRowIndex' => $rowIndex - 1, // 0-based
                        'endRowIndex' => $rowIndex,
                        'startColumnIndex' => 0,
                        'endColumnIndex' => 23 // A to W
                    ],
                    'cell' => [
                        'userEnteredFormat' => [
                            'backgroundColor'   => $bgColor,
                            'wrapStrategy'      => 'WRAP',
                            'verticalAlignment' => 'TOP',
                        ]
                    ],
                    'fields' => 'userEnteredFormat(backgroundColor,wrapStrategy,verticalAlignment)'
                ]
            ])
        ];

        $batchUpdateRequest = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest(['requests' => $requests]);
        $this->sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batchUpdateRequest);
    }

    /** Format all rows in the active sheet to enable multiline paragraph text wrapping and top vertical alignment. */
    public function formatSheetWrap(?string $sheetName = null): void
    {
        $targetSheet = $sheetName ?? $this->sheetName;
        $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
        $sheetId = 0;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() === $targetSheet) {
                $sheetId = $sheet->getProperties()->getSheetId();
                break;
            }
        }

        $requests = [
            new \Google\Service\Sheets\Request([
                'repeatCell' => [
                    'range' => [
                        'sheetId'          => $sheetId,
                        'startRowIndex'    => 0,
                        'endRowIndex'      => 1000,
                        'startColumnIndex' => 0,
                        'endColumnIndex'   => 23,
                    ],
                    'cell' => [
                        'userEnteredFormat' => [
                            'wrapStrategy'      => 'WRAP',
                            'verticalAlignment' => 'TOP',
                        ]
                    ],
                    'fields' => 'userEnteredFormat(wrapStrategy,verticalAlignment)',
                ]
            ])
        ];

        $batchUpdateRequest = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest(['requests' => $requests]);
        $this->sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batchUpdateRequest);
    }

    /**
     * Update specific columns in a given 1-based row number.
     * $colValues: ['F' => 'progress', 'J' => 'Budi', ...]
     */
    public function updateRow(int $rowNumber, array $colValues): void
    {
        $this->clearCache();
        $data = [];
        foreach ($colValues as $col => $value) {
            $data[] = new ValueRange([
                'range'  => "{$this->sheetName}!{$col}{$rowNumber}",
                'values' => [[$value]],
            ]);
        }

        $body = new BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data'             => $data,
        ]);

        $this->sheets->spreadsheets_values->batchUpdate($this->spreadsheetId, $body);
    }

    /** Save image locally named after the Issue ID and return filename for Google Sheets. */
    public function uploadImage(UploadedFile $file, string $customName = ''): string
    {
        $uploadsDir = public_path('uploads');
        if (!file_exists($uploadsDir)) {
            mkdir($uploadsDir, 0755, true);
        }

        $extension = strtolower($file->getClientOriginalExtension() ?: 'png');
        $baseName  = $customName ?: ('img_' . md5(microtime() . \Illuminate\Support\Str::random(6)));
        $filename  = "{$baseName}.{$extension}";

        $file->move($uploadsDir, $filename);

        // Return clean filename matching the Issue ID for Google Sheets
        return $filename;
    }
}
