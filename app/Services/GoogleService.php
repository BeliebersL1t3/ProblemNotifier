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

    /** Return all issue rows (skips header row 1), each padded to 16 columns. */
    public function getRows(): array
    {
        $response = $this->sheets->spreadsheets_values->get(
            $this->spreadsheetId,
            "{$this->sheetName}!A2:P"
        );

        $values = $response->getValues() ?? [];

        // Pad every row to 16 columns so missing trailing cells don't cause errors
        return array_map(fn($row) => array_pad($row, 16, ''), $values);
    }

    /** Append a new row. Expects exactly 16 values (A–P). */
    public function appendRow(array $values): void
    {
        $body = new ValueRange(['values' => [array_pad($values, 16, '')]]);
        $this->sheets->spreadsheets_values->append(
            $this->spreadsheetId,
            "{$this->sheetName}!A:P",
            $body,
            ['valueInputOption' => 'RAW', 'insertDataOption' => 'INSERT_ROWS']
        );
    }

    /**
     * Update specific columns in a given 1-based row number.
     * $colValues: ['F' => 'progress', 'J' => 'Budi', ...]
     */
    public function updateRow(int $rowNumber, array $colValues): void
    {
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

    /** Save image locally on dedicated server host and return local network URL for Google Sheets. */
    public function uploadImage(UploadedFile $file, string $prefix = 'img'): string
    {
        $uploadsDir = public_path('uploads');
        if (!file_exists($uploadsDir)) {
            mkdir($uploadsDir, 0755, true);
        }

        $extension = strtolower($file->getClientOriginalExtension() ?: 'png');
        $filename  = "{$prefix}-" . time() . '-' . \Illuminate\Support\Str::random(6) . '.' . $extension;

        $file->move($uploadsDir, $filename);

        // Dynamically returns http://<server-ip>/uploads/<filename> based on the request host
        return request()->getSchemeAndHttpHost() . '/uploads/' . $filename;
    }
}








