<?php

namespace App\Services;

use Google\Client;
use Google\Service\Calendar as GoogleCalendar;
use Google\Service\Calendar\Event as GoogleCalendarEvent;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Google\Service\Sheets\BatchUpdateValuesRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class GoogleService
{
    private Client $client;
    private Sheets $sheets;
    private ?GoogleCalendar $calendar = null;
    private string $spreadsheetId;
    private string $opsSpreadsheetId;
    private string $calendarId;
    private string $sheetName = 'Sheet1';

    public function __construct()
    {
        $this->client = new Client();
        $this->client->setAuthConfig(storage_path(config('services.google.credentials_path')));
        $this->client->addScope([Sheets::SPREADSHEETS, GoogleCalendar::CALENDAR]);

        $this->sheets           = new Sheets($this->client);
        $this->calendar         = new GoogleCalendar($this->client);
        $this->spreadsheetId    = (string) (config('services.google.spreadsheet_id') ?: env('GOOGLE_SPREADSHEET_ID', ''));
        $this->opsSpreadsheetId = (string) (config('services.google.ops_spreadsheet_id') ?: (env('GOOGLE_OPS_SPREADSHEET_ID') ?: $this->spreadsheetId));
        $this->calendarId       = (string) (config('services.google.calendar_id') ?: env('GOOGLE_CALENDAR_ID', ''));
    }

    /** Clear local cache for sheets list or rows. */
    public function clearCache(?string $sheetName = null): void
    {
        Cache::forget('google_sheets_list');
        Cache::forget('google_ops_sheets_list');
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
     * List all main issue sheet tab names (e.g. 'Sheet1', '2026', '2027').
     * Strictly filters out any 'Ops_' department tabs.
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
                    $title = $sheet->getProperties()->getTitle();
                    if (str_starts_with($title, 'Ops_')) {
                        continue;
                    }
                    $names[] = $title;
                }
                Cache::put('google_sheets_list_backup', $names, 86400 * 7);
                return $names;
            });
        } catch (\Throwable $e) {
            if (Cache::has('google_sheets_list')) {
                return Cache::get('google_sheets_list');
            }
            if (Cache::has('google_sheets_list_backup')) {
                Log::warning('Google Sheets API unavailable for listSheets. Using 7-day backup: ' . $e->getMessage());
                return Cache::get('google_sheets_list_backup');
            }
            throw $e;
        }
    }

    /**
     * List sheet tabs in the Operations spreadsheet.
     */
    public function listOpsSheets(bool $forceRefresh = false): array
    {
        if ($forceRefresh) {
            Cache::forget('google_ops_sheets_list');
        }

        try {
            return Cache::remember('google_ops_sheets_list', 60, function () {
                $spreadsheet = $this->sheets->spreadsheets->get($this->opsSpreadsheetId);
                $names = [];
                foreach ($spreadsheet->getSheets() as $sheet) {
                    $names[] = $sheet->getProperties()->getTitle();
                }
                return $names;
            });
        } catch (\Throwable $e) {
            if (Cache::has('google_ops_sheets_list')) {
                return Cache::get('google_ops_sheets_list');
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

        // 2. Write the header row to the new sheet (26 columns: A to Z)
        $headers = [[
            'ID', 'Title', 'Description', 'Location', 'Category',
            'Status', 'Reporter', 'Submitted At', 'Image URL',
            'Taker', 'Taken At', 'Solver', 'Solved At',
            'Fix Description', 'Proof Image URL', 'Duration',
            'Priority', 'Deadline', 'Pending Reason', 'Pending By',
            'Pending Image URL', 'Tagged Departments', 'Origin Department', 'Assigned Department', 'Edit History', 'Display Status'
        ]];

        $body = new ValueRange(['values' => $headers]);
        $this->sheets->spreadsheets_values->update(
            $this->spreadsheetId,
            "{$name}!A1:Z1",
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
     * Ensure Column X1 header is 'Assigned Department' across all sheets in the spreadsheet.
     */
    public function ensureAssignedDepartmentHeader(): void
    {
        $allSheets = $this->listSheets(true);
        foreach ($allSheets as $sheetName) {
            $res = $this->sheets->spreadsheets_values->get(
                $this->spreadsheetId,
                "{$sheetName}!X1"
            );
            $val = $res->getValues();
            if (empty($val) || empty($val[0][0]) || $val[0][0] !== 'Assigned Department') {
                $body = new ValueRange(['values' => [['Assigned Department']]]);
                $this->sheets->spreadsheets_values->update(
                    $this->spreadsheetId,
                    "{$sheetName}!X1",
                    $body,
                    ['valueInputOption' => 'RAW']
                );
            }
        }
        $this->clearCache();
    }

    /**
     * Ensure Column Y1 ('Edit History') and Z1 ('Display Status') headers across all sheets.
     */
    public function ensureEditAndDisplayHeaders(): void
    {
        $allSheets = $this->listSheets(true);
        foreach ($allSheets as $sheetName) {
            try {
                $res = $this->sheets->spreadsheets_values->get(
                    $this->spreadsheetId,
                    "{$sheetName}!Y1:Z1"
                );
                $vals = $res->getValues();
                $yVal = $vals[0][0] ?? '';
                $zVal = $vals[0][1] ?? '';
                if ($yVal !== 'Edit History' || $zVal !== 'Display Status') {
                    $body = new ValueRange(['values' => [['Edit History', 'Display Status']]]);
                    $this->sheets->spreadsheets_values->update(
                        $this->spreadsheetId,
                        "{$sheetName}!Y1:Z1",
                        $body,
                        ['valueInputOption' => 'RAW']
                    );
                }
            } catch (\Throwable $e) {}
        }
        $this->clearCache();
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

        // 1. Set Text Wrap and Top Vertical Alignment for all cells (26 columns: A to Z)
        $requests[] = new \Google\Service\Sheets\Request([
            'repeatCell' => [
                'range' => [
                    'sheetId'          => $sheetId,
                    'startRowIndex'    => 0,
                    'endRowIndex'      => 1000,
                    'startColumnIndex' => 0,
                    'endColumnIndex'   => 26,
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

        // 2. Bold header row (26 columns: A to Z)
        $requests[] = new \Google\Service\Sheets\Request([
            'repeatCell' => [
                'range' => [
                    'sheetId'          => $sheetId,
                    'startRowIndex'    => 0,
                    'endRowIndex'      => 1,
                    'startColumnIndex' => 0,
                    'endColumnIndex'   => 26,
                ],
                'cell'   => ['userEnteredFormat' => ['textFormat' => ['bold' => true]]],
                'fields' => 'userEnteredFormat.textFormat.bold',
            ]
        ]);

        // 3. Add Conditional Formatting Rules ONLY for Status (Column F - Index 5 to 6)
        $rules = [
            [
                'formula' => '=$F2="open"',
                'bg'      => ['red' => 0.99, 'green' => 0.89, 'blue' => 0.89], // Soft Rose / Light Red
                'text'    => ['red' => 0.60, 'green' => 0.11, 'blue' => 0.11], // Dark Red
            ],
            [
                'formula' => '=$F2="progress"',
                'bg'      => ['red' => 0.88, 'green' => 0.95, 'blue' => 0.99], // Soft Sky Blue
                'text'    => ['red' => 0.01, 'green' => 0.41, 'blue' => 0.63], // Dark Blue
            ],
            [
                'formula' => '=$F2="solved"',
                'bg'      => ['red' => 0.82, 'green' => 0.98, 'blue' => 0.90], // Soft Mint / Green
                'text'    => ['red' => 0.02, 'green' => 0.37, 'blue' => 0.27], // Dark Green
            ],
            [
                'formula' => '=$F2="pending"',
                'bg'      => ['red' => 0.99, 'green' => 0.95, 'blue' => 0.78], // Soft Amber / Yellow
                'text'    => ['red' => 0.57, 'green' => 0.25, 'blue' => 0.05], // Dark Amber
            ],
        ];

        foreach ($rules as $idx => $r) {
            $requests[] = new \Google\Service\Sheets\Request([
                'addConditionalFormatRule' => [
                    'rule' => [
                        'ranges' => [[
                            'sheetId'          => $sheetId,
                            'startRowIndex'    => 1, // Skip header row 1
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
            $lastMatch = null;
            foreach ($values as $idx => $row) {
                if (($row[0] ?? '') === $issueId) {
                    $lastMatch = ['sheet' => $sheetName, 'rowIndex' => $idx + 2]; // 1-based, skip header
                }
            }
            if ($lastMatch !== null) {
                return $lastMatch;
            }
        }
        return null;
    }

    /** Return all issue rows (skips header row 1), each padded to 26 columns (A to Z). */
    public function getRows(bool $forceRefresh = false): array
    {
        $cacheKey = "google_sheet_rows_{$this->sheetName}";
        $backupCacheKey = "google_sheet_rows_backup_{$this->sheetName}";
        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        try {
            return Cache::remember($cacheKey, 20, function () use ($backupCacheKey) {
                $response = $this->sheets->spreadsheets_values->get(
                    $this->spreadsheetId,
                    "{$this->sheetName}!A2:Z"
                );

                $values = $response->getValues() ?? [];

                // Pad every row to 26 columns so missing trailing cells don't cause errors
                $padded = array_map(fn($row) => array_pad($row, 26, ''), $values);
                Cache::put($backupCacheKey, $padded, 86400 * 7);
                return $padded;
            });
        } catch (\Throwable $e) {
            if ($cacheKey && Cache::has($cacheKey)) {
                return Cache::get($cacheKey);
            }
            if ($backupCacheKey && Cache::has($backupCacheKey)) {
                Log::warning("Google Sheets API failed for {$this->sheetName}. Using 7-day backup cache: " . $e->getMessage());
                return Cache::get($backupCacheKey);
            }
            throw $e;
        }
    }

    /** Append a new row (26 columns: A to Z). Returns the row index. */
    public function appendRow(array $values): ?int
    {
        $this->clearCache();
        $body = new ValueRange(['values' => [array_pad($values, 26, '')]]);
        $response = $this->sheets->spreadsheets_values->append(
            $this->spreadsheetId,
            "{$this->sheetName}!A:Z",
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

    /** Append multiple rows in a single API call. Returns starting row index. */
    public function appendRows(array $rowsOfValues): ?int
    {
        if (empty($rowsOfValues)) {
            return null;
        }
        $this->clearCache();
        $padded = array_map(fn($row) => array_pad($row, 24, ''), $rowsOfValues);
        $body = new ValueRange(['values' => $padded]);
        $response = $this->sheets->spreadsheets_values->append(
            $this->spreadsheetId,
            "{$this->sheetName}!A:X",
            $body,
            ['valueInputOption' => 'RAW', 'insertDataOption' => 'INSERT_ROWS']
        );
        
        $updates = $response->getUpdates();
        if ($updates) {
            $range = $updates->getUpdatedRange();
            if (preg_match('/A(\d+):/', $range, $matches)) {
                return (int)$matches[1];
            } elseif (preg_match('/(\d+)$/', $range, $matches)) {
                return (int)$matches[1] - count($rowsOfValues) + 1;
            }
        }
        return null;
    }

    /** Colors multiple rows in a single batch request */
    public function batchColorRows(array $rowColors): void
    {
        if (empty($rowColors)) return;

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

        $requests = [];
        foreach ($rowColors as $rowIndex => $category) {
            $catKey = strtolower(trim($category));
            $bgColor = $categoryColors[$catKey] ?? null;

            if (!$bgColor) {
                $hash = md5($catKey);
                $r = (hexdec(substr($hash, 0, 2)) / 255.0 + 1.0) / 2.0;
                $g = (hexdec(substr($hash, 2, 2)) / 255.0 + 1.0) / 2.0;
                $b = (hexdec(substr($hash, 4, 2)) / 255.0 + 1.0) / 2.0;
                $bgColor = ['red' => $r, 'green' => $g, 'blue' => $b];
            }

            $requests[] = new \Google\Service\Sheets\Request([
                'repeatCell' => [
                    'range' => [
                        'sheetId'          => $sheetId,
                        'startRowIndex'    => $rowIndex - 1, // 0-based
                        'endRowIndex'      => $rowIndex,
                        'startColumnIndex' => 0,
                        'endColumnIndex'   => 24
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
            ]);
        }

        if (!empty($requests)) {
            $batchUpdateRequest = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest(['requests' => $requests]);
            $this->sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batchUpdateRequest);
        }
    }

    /**
     * Insert a new row directly after a specific row index (1-based), shifting subsequent rows down.
     * Keeps versioned edits adjacent to each other.
     */
    public function insertRowAfter(int $afterRowIndex, array $values, ?string $sheetName = null): ?int
    {
        $targetSheet = $sheetName ?: $this->sheetName;
        $this->clearCache();

        $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
        $sheetId = 0;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() === $targetSheet) {
                $sheetId = $sheet->getProperties()->getSheetId();
                break;
            }
        }

        $insertRowIndex = $afterRowIndex + 1; // 1-based index of the new row

        // 1. Insert blank row at 0-based index $afterRowIndex (which pushes row $insertRowIndex and below down)
        $requests = [
            new \Google\Service\Sheets\Request([
                'insertDimension' => [
                    'range' => [
                        'sheetId'   => $sheetId,
                        'dimension' => 'ROWS',
                        'startIndex'=> $afterRowIndex, // 0-based index
                        'endIndex'  => $afterRowIndex + 1,
                    ],
                    'inheritFromBefore' => true,
                ]
            ])
        ];
        $batchUpdateRequest = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest(['requests' => $requests]);
        $this->sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batchUpdateRequest);

        // 2. Populate the inserted row with values
        $body = new ValueRange(['values' => [array_pad($values, 26, '')]]);
        $this->sheets->spreadsheets_values->update(
            $this->spreadsheetId,
            "{$targetSheet}!A{$insertRowIndex}:Z{$insertRowIndex}",
            $body,
            ['valueInputOption' => 'RAW']
        );

        return $insertRowIndex;
    }

    /** Colors a specific row with a consistent pastel color based on the category string */
    public function colorRowByCategory(int $rowIndex, string $category, ?string $sheetName = null): void
    {
        $targetSheet = $sheetName ?: $this->sheetName;
        // Get Sheet ID
        $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
        $sheetId = 0;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() === $targetSheet) {
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
                        'endColumnIndex' => 26 // A to Z
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

    /**
     * Batch colors multiple rows based on category in a single API call,
     * maintaining the pastel category/department palette.
     */
    public function batchColorRowsByCategory(array $rowCategories, ?string $sheetName = null): void
    {
        $targetSheet = $sheetName ?: $this->sheetName;
        $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
        $sheetId = 0;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() === $targetSheet) {
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

        $requests = [];
        foreach ($rowCategories as $rowIndex => $category) {
            $catKey = strtolower(trim((string)$category));
            $bgColor = $categoryColors[$catKey] ?? null;

            if (!$bgColor) {
                $hash = md5($catKey);
                $r = (hexdec(substr($hash, 0, 2)) / 255.0 + 1.0) / 2.0;
                $g = (hexdec(substr($hash, 2, 2)) / 255.0 + 1.0) / 2.0;
                $b = (hexdec(substr($hash, 4, 2)) / 255.0 + 1.0) / 2.0;
                $bgColor = ['red' => $r, 'green' => $g, 'blue' => $b];
            }

            $requests[] = new \Google\Service\Sheets\Request([
                'repeatCell' => [
                    'range' => [
                        'sheetId'          => $sheetId,
                        'startRowIndex'    => $rowIndex - 1, // 0-based
                        'endRowIndex'      => $rowIndex,
                        'startColumnIndex' => 0,
                        'endColumnIndex'   => 26 // A to Z
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
            ]);
        }

        if (!empty($requests)) {
            $batchUpdateRequest = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest(['requests' => $requests]);
            $this->sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batchUpdateRequest);
        }
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
                        'endColumnIndex'   => 26,
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
     * Update specific columns or an entire row in a given 1-based row number.
     * Supports:
     * 1. Full row array (0-indexed): ['ENG-001', 'Title', ...] -> updates range A{row}:Z{row} in single call.
     * 2. Associative column letters: ['F' => 'progress', 'J' => 'Budi'] -> updates specific cells.
     * 3. Associative numeric indices: [5 => 'progress', 9 => 'Budi'] -> converts to letters and updates.
     */
    public function updateRow(int $rowNumber, array $colValues, ?string $sheetName = null): void
    {
        $this->clearCache();
        $targetSheet = $sheetName ?? $this->sheetName;

        // If it's a list (0-indexed sequential array representing entire row)
        if (array_is_list($colValues) || (isset($colValues[0]) && is_int(array_key_first($colValues)) && count($colValues) > 10)) {
            $padded = array_pad($colValues, 26, '');
            $body = new ValueRange([
                'range'  => "{$targetSheet}!A{$rowNumber}:Z{$rowNumber}",
                'values' => [$padded],
            ]);
            $this->sheets->spreadsheets_values->update(
                $this->spreadsheetId,
                "{$targetSheet}!A{$rowNumber}:Z{$rowNumber}",
                $body,
                ['valueInputOption' => 'RAW']
            );
            return;
        }

        $data = [];
        foreach ($colValues as $col => $value) {
            if (is_int($col) || is_numeric($col)) {
                $colLetter = chr(65 + (int)$col);
            } else {
                $colLetter = strtoupper((string)$col);
            }

            $data[] = new ValueRange([
                'range'  => "{$targetSheet}!{$colLetter}{$rowNumber}",
                'values' => [[$value]],
            ]);
        }

        $body = new BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data'             => $data,
        ]);

        $this->sheets->spreadsheets_values->batchUpdate($this->spreadsheetId, $body);
    }

    /**
     * Batch update a specific column (e.g. 'Z') across multiple row indices in a single Google Sheets API call.
     */
    public function batchUpdateColumn(array $rowIndices, string $colLetter, $value, ?string $sheetName = null): void
    {
        if (empty($rowIndices)) return;
        $this->clearCache();
        $targetSheet = $sheetName ?? $this->sheetName;
        $colLetter = strtoupper($colLetter);

        $data = [];
        foreach ($rowIndices as $rowNum) {
            $data[] = new ValueRange([
                'range'  => "{$targetSheet}!{$colLetter}{$rowNum}",
                'values' => [[(string)$value]],
            ]);
        }

        $body = new BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data'             => $data,
        ]);

        $this->sheets->spreadsheets_values->batchUpdate($this->spreadsheetId, $body);
    }

    /**
     * Delete an issue row by 1-based row number.
     */
    public function deleteRow(int $rowIndex, ?string $sheetName = null): bool
    {
        $targetSheet = $sheetName ?? $this->sheetName;
        $spreadsheet = $this->sheets->spreadsheets->get($this->spreadsheetId);
        $sheetId = null;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() === $targetSheet) {
                $sheetId = $sheet->getProperties()->getSheetId();
                break;
            }
        }

        if ($sheetId === null) {
            return false;
        }

        $request = new \Google\Service\Sheets\Request([
            'deleteDimension' => [
                'range' => [
                    'sheetId'    => $sheetId,
                    'dimension'  => 'ROWS',
                    'startIndex' => $rowIndex - 1, // 0-based inclusive
                    'endIndex'   => $rowIndex,     // 0-based exclusive
                ]
            ]
        ]);

        $batchReq = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest([
            'requests' => [$request]
        ]);

        $this->sheets->spreadsheets->batchUpdate($this->spreadsheetId, $batchReq);
        $this->clearCache($targetSheet);
        return true;
    }

    /** Save image locally named after the Issue ID and return filename for Google Sheets. */
    public function uploadImage(UploadedFile $file, string $customName = ''): string
    {
        $uploadsDir = public_path('uploads');
        if (!file_exists($uploadsDir)) {
            mkdir($uploadsDir, 0755, true);
        }

        // Whitelist allowed image extensions only
        $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
        $extension = strtolower($file->getClientOriginalExtension() ?: 'png');
        if (!in_array($extension, $allowedExtensions)) {
            $extension = 'jpg';
        }

        // Sanitize customName to prevent path traversal or special characters
        $safeCustomName = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $customName);
        $baseName  = $safeCustomName ?: ('img_' . md5(microtime() . \Illuminate\Support\Str::random(6)));
        $filename  = "{$baseName}.{$extension}";

        $file->move($uploadsDir, $filename);

        // Return clean filename matching the Issue ID for Google Sheets
        return $filename;
    }

    // =========================================================================
    // OPERATIONS — Department Work Board (per-dept sheets)
    // =========================================================================

    /**
     * Sheet name for a department's operations board.
     * E.g. "Engineer" → "Ops_Engineer"
     */
    private function opsDeptSheet(string $dept): string
    {
        // Sanitize department name for sheet tab name
        $safe = preg_replace('/[^a-zA-Z0-9\-_]/', '_', trim($dept));
        return "Ops_{$safe}";
    }

    /**
     * Headers for an Operations sheet (16 columns: A to P).
     */
    private function opsHeaders(): array
    {
        return [[
            'ID', 'Department', 'Title', 'Description', 'Location',
            'Photo URL', 'Start Date', 'End Date', 'Priority',
            'Status', 'Created At', 'Completed At', 'Created By', 'Notes',
            'Google Event ID', 'Schedule Blocks'
        ]];
    }

    /**
     * Parse clean note and ranges from notes (Col N) and scheduleBlocks (Col P).
     */
    public function extractNotesAndRanges(?string $rawNotes, ?string $rawBlocks = null, ?string $start = null, ?string $end = null): array
    {
        $cleanNotes = trim((string)$rawNotes);
        $ranges = [];

        // 1. If Column P has JSON blocks
        if (!empty($rawBlocks)) {
            $decoded = json_decode(trim($rawBlocks), true);
            if (is_array($decoded) && !empty($decoded)) {
                $ranges = $decoded;
            }
        }

        // 2. If Column N has legacy [SCHEDULE_RANGES: ...]
        if (preg_match('/\[SCHEDULE_RANGES:\s*(\[.*?\])\s*\]/s', $cleanNotes, $m)) {
            if (empty($ranges)) {
                $decoded = json_decode($m[1], true);
                if (is_array($decoded) && !empty($decoded)) {
                    $ranges = $decoded;
                }
            }
            $cleanNotes = trim(str_replace($m[0], '', $cleanNotes));
        }

        // 3. Fallback to start/end date
        if (empty($ranges) && (!empty($start) || !empty($end))) {
            $ranges = [['startDate' => $start ?: $end, 'endDate' => $end ?: $start]];
        }

        return [
            'notes'          => $cleanNotes,
            'scheduleBlocks' => !empty($ranges) && count($ranges) > 1 ? json_encode(array_values($ranges)) : '',
            'ranges'         => $ranges,
        ];
    }

    /**
     * Ensure an Ops_<dept> sheet tab exists; create it if not.
     */
    /**
     * Ensure an Ops_<dept> sheet tab exists in the Operations spreadsheet; create it if not.
     */
    public function ensureOpsDeptSheet(string $dept): string
    {
        $sheetName = $this->opsDeptSheet($dept);
        $existing  = $this->listOpsSheets(true);

        if (!in_array($sheetName, $existing, true)) {
            // Create tab
            $addReq = new \Google\Service\Sheets\Request([
                'addSheet' => ['properties' => ['title' => $sheetName]]
            ]);
            $batch = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest(['requests' => [$addReq]]);
            $this->sheets->spreadsheets->batchUpdate($this->opsSpreadsheetId, $batch);

            // Write header row (16 columns A–P)
            $body = new ValueRange(['values' => $this->opsHeaders()]);
            $this->sheets->spreadsheets_values->update(
                $this->opsSpreadsheetId,
                "{$sheetName}!A1:P1",
                $body,
                ['valueInputOption' => 'RAW']
            );

            // Apply professional styling and rules
            $spreadsheet = $this->sheets->spreadsheets->get($this->opsSpreadsheetId);
            $newSheetId  = null;
            foreach ($spreadsheet->getSheets() as $sheet) {
                if ($sheet->getProperties()->getTitle() === $sheetName) {
                    $newSheetId = $sheet->getProperties()->getSheetId();
                    break;
                }
            }
            if ($newSheetId !== null) {
                $this->setupOpsSheetFormatting($newSheetId);
            }

            Cache::forget('google_ops_sheets_list');
        }

        return $sheetName;
    }

    /**
     * Get all work items for a department. Returns array of associative arrays.
     */
    public function getOpsWorkItems(string $dept, bool $forceRefresh = false): array
    {
        $sheetName = $this->ensureOpsDeptSheet($dept);
        $cacheKey  = "ops_rows_{$sheetName}";

        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        return Cache::remember($cacheKey, 15, function () use ($sheetName) {
            try {
                $response = $this->sheets->spreadsheets_values->get(
                    $this->opsSpreadsheetId,
                    "{$sheetName}!A2:P"
                );
                $rows = $response->getValues() ?? [];
            } catch (\Throwable $e) {
                return [];
            }

            $items = [];
            foreach ($rows as $idx => $row) {
                $row = array_pad($row, 16, '');
                if (empty($row[0])) continue; // Skip blank rows
                $ext = $this->extractNotesAndRanges($row[13] ?? '', $row[15] ?? '', $row[6] ?? '', $row[7] ?? '');
                $items[] = [
                    'rowIndex'       => $idx + 2,
                    'id'             => $row[0],
                    'department'     => $row[1],
                    'title'          => $row[2],
                    'description'    => $row[3],
                    'location'       => $row[4],
                    'photoUrl'       => $row[5],
                    'startDate'      => $row[6],
                    'endDate'        => $row[7],
                    'priority'       => $row[8] ?: 'normal',
                    'status'         => $row[9] ?: 'active',
                    'createdAt'      => $row[10],
                    'completedAt'    => $row[11],
                    'createdBy'      => $row[12],
                    'notes'          => $ext['notes'],
                    'googleEventId'  => $row[14],
                    'scheduleBlocks' => $ext['scheduleBlocks'],
                    'ranges'         => $ext['ranges'],
                ];
            }
            return $items;
        });
    }

    /**
     * Get all work items across all department sheets in ONE single batch request (batchGet).
     */
    public function getAllOpsWorkItems(bool $forceRefresh = false): array
    {
        $cacheKey = 'ops_all_work_items';
        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        return Cache::remember($cacheKey, 30, function () {
            try {
                $opsSheets = $this->listOpsSheets(false);
                $deptSheets = array_values(array_filter($opsSheets, fn($s) => str_starts_with($s, 'Ops_') && $s !== 'Ops_Sheet1'));

                if (empty($deptSheets)) {
                    return [];
                }

                $ranges = array_map(fn($s) => "{$s}!A2:P", $deptSheets);

                $batchResponse = $this->sheets->spreadsheets_values->batchGet(
                    $this->opsSpreadsheetId,
                    ['ranges' => $ranges]
                );

                $valueRanges = $batchResponse->getValueRanges() ?? [];
                $allItems = [];

                foreach ($valueRanges as $vr) {
                    $rangeName = $vr->getRange();
                    $sheetTitle = explode('!', $rangeName)[0];
                    $sheetTitle = trim($sheetTitle, "'");
                    $deptName = str_starts_with($sheetTitle, 'Ops_') ? substr($sheetTitle, 4) : $sheetTitle;

                    $rows = $vr->getValues() ?? [];
                    foreach ($rows as $idx => $row) {
                        $row = array_pad($row, 16, '');
                        if (empty($row[0])) continue;
                        $ext = $this->extractNotesAndRanges($row[13] ?? '', $row[15] ?? '', $row[6] ?? '', $row[7] ?? '');
                        $allItems[] = [
                            'rowIndex'       => $idx + 2,
                            'id'             => $row[0],
                            'department'     => $row[1] ?: $deptName,
                            'title'          => $row[2],
                            'description'    => $row[3],
                            'location'       => $row[4],
                            'photoUrl'       => $row[5],
                            'startDate'      => $row[6],
                            'endDate'        => $row[7],
                            'priority'       => $row[8] ?: 'normal',
                            'status'         => $row[9] ?: 'active',
                            'createdAt'      => $row[10],
                            'completedAt'    => $row[11],
                            'createdBy'      => $row[12],
                            'notes'          => $ext['notes'],
                            'googleEventId'  => $row[14],
                            'scheduleBlocks' => $ext['scheduleBlocks'],
                            'ranges'         => $ext['ranges'],
                        ];
                    }
                }

                return $allItems;
            } catch (\Throwable $e) {
                Log::error('getAllOpsWorkItems batchGet error: ' . $e->getMessage());
                return [];
            }
        });
    }

    /**
     * Append a new work item to the department's Ops sheet and sync with Google Calendar.
     */
    public function appendOpsWorkItem(string $dept, array $data): string
    {
        $sheetName = $this->ensureOpsDeptSheet($dept);
        $id        = 'ops-' . uniqid();
        $now       = now()->toIso8601String();

        // Attempt Google Calendar Sync
        $taskToSync = array_merge($data, [
            'department' => $dept,
            'status'     => 'active',
        ]);
        $googleEventId = $this->syncOpsTaskToCalendar($taskToSync);

        $ext = $this->extractNotesAndRanges(
            $data['notes'] ?? '',
            $data['scheduleBlocks'] ?? '',
            $data['startDate'] ?? '',
            $data['endDate'] ?? ''
        );

        $row = [
            $id,
            $dept,
            $data['title']       ?? '',
            $data['description'] ?? '',
            $data['location']    ?? '',
            $data['photoUrl']    ?? '',
            $data['startDate']   ?? '',
            $data['endDate']     ?? '',
            $data['priority']    ?? 'normal',
            'active',
            $now,
            '',
            $data['createdBy']   ?? 'Admin',
            $ext['notes'],
            $googleEventId       ?: '',
            $ext['scheduleBlocks'],
        ];

        $body = new ValueRange(['values' => [array_pad($row, 16, '')]]);
        $this->sheets->spreadsheets_values->append(
            $this->opsSpreadsheetId,
            "{$sheetName}!A:P",
            $body,
            ['valueInputOption' => 'RAW', 'insertDataOption' => 'INSERT_ROWS']
        );

        Cache::forget("ops_rows_{$sheetName}");
        return $id;
    }

    /**
     * Update a work item's status and sync changes to Google Calendar.
     */
    public function updateOpsWorkItem(string $dept, int $rowIndex, array $fields): void
    {
        $sheetName = $this->ensureOpsDeptSheet($dept);

        // Fetch current row to merge
        $response = $this->sheets->spreadsheets_values->get(
            $this->opsSpreadsheetId,
            "{$sheetName}!A{$rowIndex}:P{$rowIndex}"
        );
        $existing = array_pad($response->getValues()[0] ?? [], 16, '');

        // Merge changed fields
        if (array_key_exists('title', $fields))       $existing[2]  = $fields['title'];
        if (array_key_exists('description', $fields)) $existing[3]  = $fields['description'];
        if (array_key_exists('location', $fields))    $existing[4]  = $fields['location'];
        if (array_key_exists('photoUrl', $fields))    $existing[5]  = $fields['photoUrl'];
        if (array_key_exists('startDate', $fields))   $existing[6]  = $fields['startDate'];
        if (array_key_exists('endDate', $fields))     $existing[7]  = $fields['endDate'];
        if (array_key_exists('priority', $fields))    $existing[8]  = $fields['priority'];
        if (array_key_exists('status', $fields))      $existing[9]  = $fields['status'];
        if (array_key_exists('completedAt', $fields)) $existing[11] = $fields['completedAt'];

        if (array_key_exists('notes', $fields) || array_key_exists('scheduleBlocks', $fields)) {
            $rawNotes = array_key_exists('notes', $fields) ? $fields['notes'] : $existing[13];
            $rawBlocks = array_key_exists('scheduleBlocks', $fields) ? $fields['scheduleBlocks'] : $existing[15];
            $ext = $this->extractNotesAndRanges($rawNotes, $rawBlocks, $existing[6], $existing[7]);
            $existing[13] = $ext['notes'];
            $existing[15] = $ext['scheduleBlocks'];
        }

        // Sync with Google Calendar
        $taskToSync = [
            'department'    => $existing[1] ?: $dept,
            'title'         => $existing[2],
            'description'   => $existing[3],
            'location'      => $existing[4],
            'startDate'     => $existing[6],
            'endDate'       => $existing[7],
            'priority'      => $existing[8],
            'status'        => $existing[9],
            'createdBy'     => $existing[12],
            'notes'         => $existing[13],
            'googleEventId' => $existing[14] ?? '',
        ];

        $syncedEventId = $this->syncOpsTaskToCalendar($taskToSync);
        if (!empty($syncedEventId)) {
            $existing[14] = $syncedEventId;
        }

        $body = new ValueRange(['values' => [$existing]]);
        $this->sheets->spreadsheets_values->update(
            $this->opsSpreadsheetId,
            "{$sheetName}!A{$rowIndex}:P{$rowIndex}",
            $body,
            ['valueInputOption' => 'RAW']
        );

        Cache::forget("ops_rows_{$sheetName}");
    }

    /**
     * Delete a work item row and remove event from Google Calendar.
     */
    public function deleteOpsWorkItem(string $dept, int $rowIndex): void
    {
        $sheetName = $this->ensureOpsDeptSheet($dept);

        // Fetch row first to get googleEventId if exists
        try {
            $response = $this->sheets->spreadsheets_values->get(
                $this->opsSpreadsheetId,
                "{$sheetName}!A{$rowIndex}:P{$rowIndex}"
            );
            $row = array_pad($response->getValues()[0] ?? [], 16, '');
            $googleEventId = trim($row[14] ?? '');
            if (!empty($googleEventId)) {
                $this->deleteCalendarEvent($googleEventId);
            }
        } catch (\Throwable $e) {
            Log::warning('Failed to fetch event ID before delete: ' . $e->getMessage());
        }

        // Get sheet numeric ID
        $spreadsheet = $this->sheets->spreadsheets->get($this->opsSpreadsheetId);
        $sheetId     = null;
        foreach ($spreadsheet->getSheets() as $sheet) {
            if ($sheet->getProperties()->getTitle() === $sheetName) {
                $sheetId = $sheet->getProperties()->getSheetId();
                break;
            }
        }
        if ($sheetId === null) return;

        $req = new \Google\Service\Sheets\Request([
            'deleteDimension' => [
                'range' => [
                    'sheetId'    => $sheetId,
                    'dimension'  => 'ROWS',
                    'startIndex' => $rowIndex - 1, // 0-based
                    'endIndex'   => $rowIndex,
                ]
            ]
        ]);
        $batch = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest(['requests' => [$req]]);
        $this->sheets->spreadsheets->batchUpdate($this->opsSpreadsheetId, $batch);

        Cache::forget("ops_rows_{$sheetName}");
    }

    /**
     * Create or update an event in Google Calendar.
     */
    public function syncOpsTaskToCalendar(array $task): ?string
    {
        if (empty($this->calendarId) || !$this->calendar) {
            return null;
        }

        try {
            // Determine start & end date
            $startDate = !empty($task['startDate']) ? substr($task['startDate'], 0, 10) : date('Y-m-d');
            $endDate   = !empty($task['endDate']) ? substr($task['endDate'], 0, 10) : $startDate;

            // Google Calendar all-day event end date is exclusive (so +1 day to cover all of $endDate)
            $exclusiveEndDate = date('Y-m-d', strtotime($endDate . ' +1 day'));

            $dept     = $task['department'] ?? 'Ops';
            $title    = $task['title'] ?? 'Tugas Operasional';
            $summary  = "[{$dept}] {$title}";

            $descParts = [];
            if (!empty($task['department']))  $descParts[] = "🏢 Department: " . $task['department'];
            if (!empty($task['location']))    $descParts[] = "📍 Location: " . $task['location'];
            if (!empty($task['priority']))    $descParts[] = "⚡ Priority: " . ucfirst($task['priority']);
            if (!empty($task['status']))      $descParts[] = "📌 Status: " . ucfirst($task['status']);
            if (!empty($task['createdBy']))   $descParts[] = "👤 Created By: " . $task['createdBy'];

            if (!empty($task['description'])) {
                $descParts[] = "\n📝 Description:\n" . $task['description'];
            }

            $parsedNotes = $this->parseNotesAndRanges($task['notes'] ?? '');
            if (!empty($parsedNotes['formattedRanges'])) {
                $descParts[] = "\n📅 Schedule Blocks:\n" . $parsedNotes['formattedRanges'];
            }
            if (!empty($parsedNotes['cleanNotes'])) {
                $descParts[] = "\n📋 Notes:\n" . $parsedNotes['cleanNotes'];
            }

            // Department color mapping in Google Calendar (1-11)
            $colorId = $this->getDepartmentColorId($dept);

            $eventData = [
                'summary'     => $summary,
                'location'    => $task['location'] ?? '',
                'description' => implode("\n", $descParts),
                'start'       => ['date' => $startDate],
                'end'         => ['date' => $exclusiveEndDate],
                'colorId'     => $colorId,
            ];

            $event = new GoogleCalendarEvent($eventData);

            $existingEventId = trim($task['googleEventId'] ?? '');
            if (!empty($existingEventId)) {
                try {
                    $updated = $this->calendar->events->patch($this->calendarId, $existingEventId, $event);
                    return $updated->getId();
                } catch (\Google\Service\Exception $e) {
                    if ($e->getCode() === 404) {
                        // Event was deleted externally in Google Calendar, recreate it
                        $created = $this->calendar->events->insert($this->calendarId, $event);
                        return $created->getId();
                    }
                    throw $e;
                }
            } else {
                $created = $this->calendar->events->insert($this->calendarId, $event);
                return $created->getId();
            }
        } catch (\Throwable $e) {
            Log::warning('Google Calendar sync error: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Delete an event from Google Calendar.
     */
    public function deleteCalendarEvent(?string $eventId): void
    {
        if (empty($this->calendarId) || empty($eventId) || !$this->calendar) {
            return;
        }

        try {
            $this->calendar->events->delete($this->calendarId, trim($eventId));
        } catch (\Throwable $e) {
            Log::warning('Google Calendar delete error: ' . $e->getMessage());
        }
    }

    /**
     * Sync all existing ops tasks across all departments to Google Calendar (backfill/sync).
     */
    public function syncAllToGoogleCalendar(): array
    {
        if (empty($this->calendarId) || !$this->calendar) {
            return ['synced' => 0, 'message' => 'GOOGLE_CALENDAR_ID not configured'];
        }

        $allTasks = $this->getAllOpsWorkItems(true);
        $count = 0;

        foreach ($allTasks as $task) {
            if (empty($task['title']) || empty($task['department'])) continue;

            $eventId = $this->syncOpsTaskToCalendar($task);
            if (!empty($eventId) && (empty($task['googleEventId']) || $task['googleEventId'] !== $eventId)) {
                try {
                    $sheetName = $this->ensureOpsDeptSheet($task['department']);
                    $rowIndex  = $task['rowIndex'];
                    $body = new ValueRange(['values' => [[$eventId]]]);
                    $this->sheets->spreadsheets_values->update(
                        $this->opsSpreadsheetId,
                        "{$sheetName}!O{$rowIndex}:O{$rowIndex}",
                        $body,
                        ['valueInputOption' => 'RAW']
                    );
                } catch (\Throwable $e) {
                    Log::warning('Failed to update event ID in sheet: ' . $e->getMessage());
                }
            }
            $count++;
        }

        Cache::forget('ops_all_work_items');
        return ['synced' => $count, 'message' => "Successfully synchronized {$count} tasks to Google Calendar"];
    }

    /**
     * Parse and sanitize notes field, converting raw [SCHEDULE_RANGES: ...] into clean formatted blocks.
     */
    private function parseNotesAndRanges(?string $rawNotes): array
    {
        if (empty($rawNotes)) {
            return ['cleanNotes' => '', 'formattedRanges' => ''];
        }

        $rangesStr = '';
        $cleanNotes = $rawNotes;

        if (preg_match('/\[SCHEDULE_RANGES:\s*(\[.*?\])\s*\]/s', $rawNotes, $matches)) {
            $json = $matches[1];
            $cleanNotes = trim(str_replace($matches[0], '', $rawNotes));
            $decoded = json_decode($json, true);
            if (is_array($decoded) && count($decoded) > 1) {
                $lines = [];
                foreach ($decoded as $idx => $r) {
                    $s = !empty($r['startDate']) ? date('M j, Y', strtotime($r['startDate'])) : '';
                    $e = !empty($r['endDate']) ? date('M j, Y', strtotime($r['endDate'])) : $s;
                    $blockNum = $idx + 1;
                    if ($s && $e && $s !== $e) {
                        $lines[] = "  • Block {$blockNum}: {$s} – {$e}";
                    } elseif ($s) {
                        $lines[] = "  • Block {$blockNum}: {$s}";
                    }
                }
                if (!empty($lines)) {
                    $rangesStr = implode("\n", $lines);
                }
            }
        }

        return ['cleanNotes' => $cleanNotes, 'formattedRanges' => $rangesStr];
    }

    /**
     * Map department to Google Calendar Event colorId (1-11).
     * 1: Lavender, 2: Sage (Mint), 3: Grape (Purple), 4: Flamingo (Coral/Salmon)
     * 5: Banana (Yellow/Lime), 6: Tangerine (Orange), 7: Peacock (Cyan), 8: Graphite (Gray)
     * 9: Blueberry (Navy), 10: Basil (Dark Green), 11: Tomato (Red)
     */
    private function getDepartmentColorId(string $dept): string
    {
        $d = strtolower(trim($dept));
        return match (true) {
            str_contains($d, 'it') || str_contains($d, 'tech')                                 => '7',  // Peacock / Cyan (IT)
            str_contains($d, 'f&b') || str_contains($d, 'fnb') || str_contains($d, 'food')     => '11', // Tomato / Red (F&B)
            str_contains($d, 'hr') || str_contains($d, 'human') || str_contains($d, 'legal') || str_contains($d, 'tekong') || str_contains($d, 'oe') => '3', // Grape / Dark Purple (HR)
            str_contains($d, 'hk') || str_contains($d, 'house') || str_contains($d, 'pest')   => '2',  // Sage / Mint Green (HK)
            str_contains($d, 'fasilitas') || str_contains($d, 'facility') || str_contains($d, 'security') => '5', // Banana / Lime Yellow (Fasilitas)
            str_contains($d, 'engineer')                                                       => '8',  // Graphite / Slate Gray (Engineer)
            str_contains($d, 'gr') || str_contains($d, 'guest') || str_contains($d, 'service') || str_contains($d, 'bar') || str_contains($d, 'spa') || str_contains($d, 'tirek') => '4', // Flamingo / Salmon Coral (GR)
            str_contains($d, 'finance')                                                        => '10', // Basil / Dark Green (Finance)
            str_contains($d, 'procure')                                                        => '9',  // Blueberry / Slate Navy (Procurement)
            str_contains($d, 'reserva') || str_contains($d, 'sales') || str_contains($d, 'market') => '1',  // Lavender / Magenta (Reservasi/Sales)
            default                                                                             => '6',  // Tangerine / Orange (Default Ops)
        };
    }

    /**
     * Automatically format an Operations sheet with frozen header, clean column widths,
     * elegant Navy/Slate headers, and conditional status/priority badges.
     */
    public function setupOpsSheetFormatting(int $sheetId): void
    {
        $requests = [];

        // 1. Delete existing conditional format rules on this sheet to avoid duplicates
        try {
            $spreadsheetObj = $this->sheets->spreadsheets->get($this->opsSpreadsheetId);
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

        // 2. Freeze the first header row (baris 1 selalu terlihat saat di-scroll)
        $requests[] = new \Google\Service\Sheets\Request([
            'updateSheetProperties' => [
                'properties' => [
                    'sheetId' => $sheetId,
                    'gridProperties' => [
                        'frozenRowCount' => 1,
                    ],
                ],
                'fields' => 'gridProperties.frozenRowCount',
            ]
        ]);

        // 3. Set text wrap for readable data cells (Cols A-N, 0-14 including Notes)
        $requests[] = new \Google\Service\Sheets\Request([
            'repeatCell' => [
                'range' => [
                    'sheetId'          => $sheetId,
                    'startRowIndex'    => 1,
                    'endRowIndex'      => 1000,
                    'startColumnIndex' => 0,
                    'endColumnIndex'   => 14,
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

        // CLIP metadata columns (Google Event ID: Col 14, Schedule Blocks: Col 15) so long technical strings do not expand row height
        $requests[] = new \Google\Service\Sheets\Request([
            'repeatCell' => [
                'range' => [
                    'sheetId'          => $sheetId,
                    'startRowIndex'    => 1,
                    'endRowIndex'      => 1000,
                    'startColumnIndex' => 14,
                    'endColumnIndex'   => 16,
                ],
                'cell' => [
                    'userEnteredFormat' => [
                        'wrapStrategy'      => 'CLIP',
                        'verticalAlignment' => 'MIDDLE',
                    ]
                ],
                'fields' => 'userEnteredFormat(wrapStrategy,verticalAlignment)',
            ]
        ]);

        // 4. Header row styling (Navy #1E293B, White bold text, centered, middle-aligned, 16 columns A–P)
        $requests[] = new \Google\Service\Sheets\Request([
            'repeatCell' => [
                'range' => [
                    'sheetId'          => $sheetId,
                    'startRowIndex'    => 0,
                    'endRowIndex'      => 1,
                    'startColumnIndex' => 0,
                    'endColumnIndex'   => 16,
                ],
                'cell' => [
                    'userEnteredFormat' => [
                        'backgroundColor'     => ['red' => 0.118, 'green' => 0.161, 'blue' => 0.231],
                        'textFormat'          => ['bold' => true, 'foregroundColor' => ['red' => 1.0, 'green' => 1.0, 'blue' => 1.0]],
                        'horizontalAlignment' => 'CENTER',
                        'verticalAlignment'   => 'MIDDLE',
                    ]
                ],
                'fields' => 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
            ]
        ]);

        // 5. Center-aligned columns for clean presentation (ID, Dept, Dates, Priority, Status, Timestamps, EventID, ScheduleBlocks)
        $centerCols = [0, 1, 6, 7, 8, 9, 10, 11, 14, 15];
        foreach ($centerCols as $cIdx) {
            $requests[] = new \Google\Service\Sheets\Request([
                'repeatCell' => [
                    'range' => [
                        'sheetId'          => $sheetId,
                        'startRowIndex'    => 1,
                        'endRowIndex'      => 1000,
                        'startColumnIndex' => $cIdx,
                        'endColumnIndex'   => $cIdx + 1,
                    ],
                    'cell' => [
                        'userEnteredFormat' => [
                            'horizontalAlignment' => 'CENTER',
                            'verticalAlignment'   => 'MIDDLE',
                        ]
                    ],
                    'fields' => 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
                ]
            ]);
        }

        // 6. Set proportional column widths (anti-wrapping for IDs and timestamps)
        $colWidths = [
            0  => 150, // A: ID (e.g. ops-6a8e94935dfe2 without line break)
            1  => 110, // B: Department
            2  => 230, // C: Title
            3  => 260, // D: Description
            4  => 120, // E: Location
            5  => 110, // F: Photo URL
            6  => 110, // G: Start Date
            7  => 110, // H: End Date
            8  => 100, // I: Priority
            9  => 110, // J: Status
            10 => 165, // K: Created At (ISO timestamp on single line)
            11 => 165, // L: Completed At
            12 => 130, // M: Created By
            13 => 220, // N: Notes (human-readable, wrapped)
            14 => 150, // O: Google Event ID (clipped)
            15 => 180, // P: Schedule Blocks (clipped)
        ];
        foreach ($colWidths as $cIndex => $widthPx) {
            $requests[] = new \Google\Service\Sheets\Request([
                'updateDimensionProperties' => [
                    'range' => [
                        'sheetId'    => $sheetId,
                        'dimension'  => 'COLUMNS',
                        'startIndex' => $cIndex,
                        'endIndex'   => $cIndex + 1,
                    ],
                    'properties' => [
                        'pixelSize' => $widthPx,
                    ],
                    'fields' => 'pixelSize',
                ]
            ]);
        }

        // 7. Clean horizontal row dividers (columns A-P)
        $requests[] = new \Google\Service\Sheets\Request([
            'updateBorders' => [
                'range' => [
                    'sheetId'          => $sheetId,
                    'startRowIndex'    => 0,
                    'endRowIndex'      => 1000,
                    'startColumnIndex' => 0,
                    'endColumnIndex'   => 16,
                ],
                'bottom' => [
                    'style' => 'SOLID',
                    'color' => ['red' => 0.82, 'green' => 0.85, 'blue' => 0.88],
                ],
                'innerHorizontal' => [
                    'style' => 'SOLID',
                    'color' => ['red' => 0.89, 'green' => 0.91, 'blue' => 0.93],
                ],
            ]
        ]);

        // 8. Conditional formatting for Status (Column J, index 9) using TEXT_EQ
        $statusRules = [
            ['value' => 'done', 'bg' => ['red' => 0.863, 'green' => 0.988, 'blue' => 0.906], 'text' => ['red' => 0.082, 'green' => 0.502, 'blue' => 0.239]],
            ['value' => 'completed', 'bg' => ['red' => 0.863, 'green' => 0.988, 'blue' => 0.906], 'text' => ['red' => 0.082, 'green' => 0.502, 'blue' => 0.239]],
            ['value' => 'solved', 'bg' => ['red' => 0.863, 'green' => 0.988, 'blue' => 0.906], 'text' => ['red' => 0.082, 'green' => 0.502, 'blue' => 0.239]],
            ['value' => 'active', 'bg' => ['red' => 0.878, 'green' => 0.949, 'blue' => 0.996], 'text' => ['red' => 0.012, 'green' => 0.412, 'blue' => 0.631]],
            ['value' => 'in_progress', 'bg' => ['red' => 0.878, 'green' => 0.949, 'blue' => 0.996], 'text' => ['red' => 0.012, 'green' => 0.412, 'blue' => 0.631]],
            ['value' => 'todo', 'bg' => ['red' => 0.996, 'green' => 0.953, 'blue' => 0.780], 'text' => ['red' => 0.706, 'green' => 0.325, 'blue' => 0.035]],
            ['value' => 'pending', 'bg' => ['red' => 0.996, 'green' => 0.953, 'blue' => 0.780], 'text' => ['red' => 0.706, 'green' => 0.325, 'blue' => 0.035]],
            ['value' => 'cancelled', 'bg' => ['red' => 0.945, 'green' => 0.961, 'blue' => 0.976], 'text' => ['red' => 0.392, 'green' => 0.455, 'blue' => 0.545]],
            ['value' => 'deleted_from_calendar', 'bg' => ['red' => 0.945, 'green' => 0.961, 'blue' => 0.976], 'text' => ['red' => 0.392, 'green' => 0.455, 'blue' => 0.545]],
        ];

        foreach ($statusRules as $idx => $r) {
            $requests[] = new \Google\Service\Sheets\Request([
                'addConditionalFormatRule' => [
                    'rule' => [
                        'ranges' => [[
                            'sheetId'          => $sheetId,
                            'startRowIndex'    => 1,
                            'endRowIndex'      => 1000,
                            'startColumnIndex' => 9,
                            'endColumnIndex'   => 10,
                        ]],
                        'booleanRule' => [
                            'condition' => [
                                'type'   => 'TEXT_EQ',
                                'values' => [['userEnteredValue' => $r['value']]],
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

        // 9. Conditional formatting for Priority (Column I, index 8) using TEXT_EQ
        $priorityRules = [
            ['value' => 'urgent', 'bg' => ['red' => 0.996, 'green' => 0.886, 'blue' => 0.886], 'text' => ['red' => 0.725, 'green' => 0.110, 'blue' => 0.110]],
            ['value' => 'critical', 'bg' => ['red' => 0.996, 'green' => 0.886, 'blue' => 0.886], 'text' => ['red' => 0.725, 'green' => 0.110, 'blue' => 0.110]],
            ['value' => 'high', 'bg' => ['red' => 1.000, 'green' => 0.929, 'blue' => 0.835], 'text' => ['red' => 0.761, 'green' => 0.255, 'blue' => 0.047]],
            ['value' => 'normal', 'bg' => ['red' => 0.941, 'green' => 0.992, 'blue' => 0.957], 'text' => ['red' => 0.086, 'green' => 0.396, 'blue' => 0.204]],
            ['value' => 'low', 'bg' => ['red' => 0.945, 'green' => 0.961, 'blue' => 0.976], 'text' => ['red' => 0.392, 'green' => 0.455, 'blue' => 0.545]],
        ];

        foreach ($priorityRules as $pIdx => $pr) {
            $requests[] = new \Google\Service\Sheets\Request([
                'addConditionalFormatRule' => [
                    'rule' => [
                        'ranges' => [[
                            'sheetId'          => $sheetId,
                            'startRowIndex'    => 1,
                            'endRowIndex'      => 1000,
                            'startColumnIndex' => 8,
                            'endColumnIndex'   => 9,
                        ]],
                        'booleanRule' => [
                            'condition' => [
                                'type'   => 'TEXT_EQ',
                                'values' => [['userEnteredValue' => $pr['value']]],
                            ],
                            'format' => [
                                'backgroundColor' => $pr['bg'],
                                'textFormat'      => ['bold' => true, 'foregroundColor' => $pr['text']],
                            ],
                        ],
                    ],
                    'index' => count($statusRules) + $pIdx,
                ]
            ]);
        }

        try {
            $batch = new \Google\Service\Sheets\BatchUpdateSpreadsheetRequest(['requests' => $requests]);
            $this->sheets->spreadsheets->batchUpdate($this->opsSpreadsheetId, $batch);
        } catch (\Throwable $e) {
            Log::warning("Failed to apply formatting on Ops sheet ID {$sheetId}: " . $e->getMessage());
        }
    }

    /**
     * Format all Ops_<Dept> sheet tabs in the Operations spreadsheet.
     */
    public function formatAllOpsSheets(): array
    {
        $spreadsheet = $this->sheets->spreadsheets->get($this->opsSpreadsheetId);
        $count = 0;
        foreach ($spreadsheet->getSheets() as $sh) {
            $title = $sh->getProperties()->getTitle();
            if (str_starts_with($title, 'Ops_') && $title !== 'Ops_Sheet1') {
                $sheetId = $sh->getProperties()->getSheetId();
                
                // Write standard header row (A1:P1, 16 columns)
                try {
                    $body = new ValueRange(['values' => $this->opsHeaders()]);
                    $this->sheets->spreadsheets_values->update(
                        $this->opsSpreadsheetId,
                        "{$title}!A1:P1",
                        $body,
                        ['valueInputOption' => 'RAW']
                    );
                } catch (\Throwable $e) {
                    Log::warning("Failed to write headers for {$title}: " . $e->getMessage());
                }

                $this->setupOpsSheetFormatting($sheetId);
                $count++;
            }
        }
        return ['formatted' => $count, 'message' => "Berhasil merapikan format tampilan {$count} sheet operasional."];
    }

    /**
     * Migrate existing tasks across all Ops_* tabs:
     * 1. Updates header to A1:P1 with "Schedule Blocks".
     * 2. Scans Column N (Notes); if it contains [SCHEDULE_RANGES: ...], extracts
     *    clean note into Column N and moves the JSON string to Column P.
     */
    public function migrateOpsNotesToScheduleBlocks(): array
    {
        $spreadsheet = $this->sheets->spreadsheets->get($this->opsSpreadsheetId);
        $migratedRows = 0;
        $processedSheets = 0;

        foreach ($spreadsheet->getSheets() as $sh) {
            $title = $sh->getProperties()->getTitle();
            if (!str_starts_with($title, 'Ops_') || $title === 'Ops_Sheet1') {
                continue;
            }
            $sheetId = $sh->getProperties()->getSheetId();
            $processedSheets++;

            // 1. Ensure header row A1:P1
            try {
                $headerBody = new ValueRange(['values' => $this->opsHeaders()]);
                $this->sheets->spreadsheets_values->update(
                    $this->opsSpreadsheetId,
                    "{$title}!A1:P1",
                    $headerBody,
                    ['valueInputOption' => 'RAW']
                );
            } catch (\Throwable $e) {
                Log::warning("Header update failed on {$title}: " . $e->getMessage());
            }

            // 2. Read existing data rows A2:P
            try {
                $response = $this->sheets->spreadsheets_values->get(
                    $this->opsSpreadsheetId,
                    "{$title}!A2:P"
                );
                $rows = $response->getValues() ?? [];
            } catch (\Throwable $e) {
                $rows = [];
            }

            if (empty($rows)) {
                $this->setupOpsSheetFormatting($sheetId);
                continue;
            }

            $batchUpdates = [];
            foreach ($rows as $idx => $row) {
                $row = array_pad($row, 16, '');
                $rowIndex = $idx + 2;
                $rawNotes = $row[13] ?? '';
                $existingBlocks = $row[15] ?? '';

                if (str_contains($rawNotes, '[SCHEDULE_RANGES:')) {
                    $ext = $this->extractNotesAndRanges($rawNotes, $existingBlocks, $row[6] ?? '', $row[7] ?? '');
                    $batchUpdates[] = [
                        'range'  => "{$title}!N{$rowIndex}:P{$rowIndex}",
                        'values' => [[$ext['notes'], $row[14] ?? '', $ext['scheduleBlocks']]],
                    ];
                    $migratedRows++;
                }
            }

            if (!empty($batchUpdates)) {
                $data = [];
                foreach ($batchUpdates as $u) {
                    $vr = new ValueRange();
                    $vr->setRange($u['range']);
                    $vr->setValues($u['values']);
                    $data[] = $vr;
                }
                $req = new \Google\Service\Sheets\BatchUpdateValuesRequest([
                    'valueInputOption' => 'RAW',
                    'data'             => $data,
                ]);
                $this->sheets->spreadsheets_values->batchUpdate($this->opsSpreadsheetId, $req);
            }

            // 3. Re-apply formatting to include Column P
            $this->setupOpsSheetFormatting($sheetId);
        }

        $this->clearCache();
        Cache::forget('ops_all_work_items');
        foreach ($this->listOpsSheets(false) as $sh) {
            Cache::forget("ops_rows_{$sh}");
        }

        return [
            'sheets'       => $processedSheets,
            'migratedRows' => $migratedRows,
            'message'      => "Migrasi selesai: {$migratedRows} baris pada {$processedSheets} sheet diperbarui.",
        ];
    }

    /**
     * Pull modifications from Google Calendar back into Google Sheets.
     * Updates dates or titles for existing tasks, and marks deleted/cancelled events
     * as 'deleted_from_calendar' (soft-hide).
     */
    public function pullFromGoogleCalendar(): array
    {
        if (empty($this->calendarId) || !$this->calendar) {
            return ['updated' => 0, 'deleted' => 0, 'message' => 'GOOGLE_CALENDAR_ID not configured'];
        }

        try {
            // 1. Fetch events from Google Calendar (including showDeleted to catch cancelled ones)
            $optParams = [
                'maxResults'   => 2500,
                'singleEvents' => true,
                'showDeleted'  => true,
            ];
            $eventsList = $this->calendar->events->listEvents($this->calendarId, $optParams);
            $eventsMap = [];

            foreach ($eventsList->getItems() as $ev) {
                $eventsMap[$ev->getId()] = $ev;
            }

            // 2. Fetch all current ops tasks from Google Sheets
            $opsTasks = $this->getAllOpsWorkItems(true);
            $updatedCount = 0;
            $deletedCount = 0;
            $batchUpdates = [];

            $newlyDeletedTasks = [];

            foreach ($opsTasks as $task) {
                $eventId = trim($task['googleEventId'] ?? '');
                if (empty($eventId)) continue;

                $sheetName = $this->ensureOpsDeptSheet($task['department']);
                $row = $task['rowIndex'];

                if (!isset($eventsMap[$eventId])) {
                    continue;
                }

                $event = $eventsMap[$eventId];
                $isCancelled = ($event->getStatus() === 'cancelled');

                if ($isCancelled) {
                    if ($task['status'] === 'deleted_from_calendar') {
                        continue;
                    }

                    // Soft-hide: status -> 'deleted_from_calendar'
                    $now = date('Y-m-d H:i');
                    $noteUpdate = trim($task['notes'] . " [Dihapus di G-Cal: {$now}]");

                    $batchUpdates[] = [
                        'range'  => "{$sheetName}!J{$row}:J{$row}",
                        'values' => [['deleted_from_calendar']],
                    ];
                    $batchUpdates[] = [
                        'range'  => "{$sheetName}!N{$row}:N{$row}",
                        'values' => [[$noteUpdate]],
                    ];
                    $deletedCount++;
                    $newlyDeletedTasks[] = [
                        'id'         => $task['id'],
                        'title'      => $task['title'],
                        'department' => $task['department'],
                        'location'   => $task['location'] ?? '',
                        'startDate'  => $task['startDate'] ?? '',
                        'endDate'    => $task['endDate'] ?? '',
                    ];
                    continue;
                }

                // Parse Google Calendar dates
                $gStart = $event->getStart()->getDate() ?: substr($event->getStart()->getDateTime(), 0, 10);
                $gEndRaw = $event->getEnd()->getDate() ?: substr($event->getEnd()->getDateTime(), 0, 10);

                if (!empty($gEndRaw)) {
                    // Google Calendar all-day end date is exclusive, subtract 1 day for inclusive end date
                    $gEnd = date('Y-m-d', strtotime($gEndRaw . ' -1 day'));
                    if ($gEnd < $gStart) {
                        $gEnd = $gStart;
                    }
                } else {
                    $gEnd = $gStart;
                }

                $gSummary = trim($event->getSummary() ?? '');
                // Clean department prefix e.g. "[Engineer] My Task" -> "My Task"
                $cleanedTitle = preg_replace('/^\[.*?\]\s*/', '', $gSummary);

                $hasDateChange = ($gStart && $gStart !== $task['startDate']) || ($gEnd && $gEnd !== $task['endDate']);
                $hasTitleChange = ($cleanedTitle && $cleanedTitle !== $task['title'] && $cleanedTitle !== $gSummary);

                if ($hasDateChange || $hasTitleChange) {
                    if ($hasTitleChange) {
                        $batchUpdates[] = [
                            'range'  => "{$sheetName}!C{$row}:C{$row}",
                            'values' => [[$cleanedTitle]],
                        ];
                    }
                    if ($hasDateChange) {
                        $batchUpdates[] = [
                            'range'  => "{$sheetName}!G{$row}:H{$row}",
                            'values' => [[$gStart, $gEnd]],
                        ];
                    }
                    $updatedCount++;
                }
            }

            // Execute batch update on Google Sheets
            if (!empty($batchUpdates)) {
                $data = [];
                foreach ($batchUpdates as $u) {
                    $vr = new ValueRange();
                    $vr->setRange($u['range']);
                    $vr->setValues($u['values']);
                    $data[] = $vr;
                }
                $req = new \Google\Service\Sheets\BatchUpdateValuesRequest([
                    'valueInputOption' => 'USER_ENTERED',
                    'data'             => $data,
                ]);
                $this->sheets->spreadsheets_values->batchUpdate($this->opsSpreadsheetId, $req);
            }

            // Clear cache so website updates instantly
            $this->clearCache();
            Cache::forget('ops_all_work_items');
            foreach ($this->listOpsSheets(false) as $sh) {
                Cache::forget("ops_rows_{$sh}");
            }

            return [
                'updated'           => $updatedCount,
                'deleted'           => $deletedCount,
                'newlyDeletedTasks' => $newlyDeletedTasks,
                'message'           => "Sinkronisasi berhasil: {$updatedCount} tugas diperbarui, {$deletedCount} tugas ditandai dihapus dari Google Calendar.",
            ];
        } catch (\Throwable $e) {
            Log::error('Pull from Google Calendar error: ' . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Restore a task that was deleted from Google Calendar.
     * Recreates event in Google Calendar, resets status in sheet to 'todo',
     * and clears the deletion marker in notes.
     */
    public function restoreTask(string $dept, string $taskId): array
    {
        $allTasks = $this->getOpsWorkItems($dept, true);
        $targetTask = null;
        foreach ($allTasks as $t) {
            if ($t['id'] === $taskId) {
                $targetTask = $t;
                break;
            }
        }

        if (!$targetTask) {
            throw new \Exception("Task ID {$taskId} tidak ditemukan di departemen {$dept}.");
        }

        // 1. Recreate Google Calendar event (empty existing event ID forces insert)
        $taskToSync = $targetTask;
        $taskToSync['googleEventId'] = '';
        $taskToSync['status'] = 'todo';
        $newEventId = $this->syncOpsTaskToCalendar($taskToSync);

        // 2. Update Google Sheet row (Status -> 'todo', GoogleEventId -> $newEventId, Notes -> append restore log)
        $sheetName = $this->ensureOpsDeptSheet($dept);
        $row = $targetTask['rowIndex'];
        $now = date('Y-m-d H:i');
        $cleanNotes = trim(preg_replace('/\[Dihapus di G-Cal:.*?\]/', '', $targetTask['notes'] ?? ''));
        $noteUpdate = trim($cleanNotes . " [Dipulihkan ke G-Cal: {$now}]");

        $batchUpdates = [
            [
                'range'  => "{$sheetName}!J{$row}:J{$row}",
                'values' => [['todo']],
            ],
            [
                'range'  => "{$sheetName}!N{$row}:N{$row}",
                'values' => [[$noteUpdate]],
            ],
            [
                'range'  => "{$sheetName}!O{$row}:O{$row}",
                'values' => [[$newEventId ?? '']],
            ],
        ];

        $data = [];
        foreach ($batchUpdates as $u) {
            $vr = new ValueRange();
            $vr->setRange($u['range']);
            $vr->setValues($u['values']);
            $data[] = $vr;
        }
        $req = new \Google\Service\Sheets\BatchUpdateValuesRequest([
            'valueInputOption' => 'USER_ENTERED',
            'data'             => $data,
        ]);
        $this->sheets->spreadsheets_values->batchUpdate($this->opsSpreadsheetId, $req);

        // Clear cache
        $this->clearCache();
        Cache::forget('ops_all_work_items');
        Cache::forget("ops_rows_{$sheetName}");

        $targetTask['status'] = 'todo';
        $targetTask['notes'] = $noteUpdate;
        $targetTask['googleEventId'] = $newEventId ?? '';

        return [
            'success' => true,
            'message' => "Jadwal '{$targetTask['title']}' berhasil dipulihkan dan ditambahkan kembali ke Google Calendar.",
            'task'    => $targetTask,
        ];
    }
}


