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

    /** Return optimized Data URL that fits within Google Sheets 50,000 cell character limit. */
    public function uploadImage(UploadedFile $file, string $prefix = 'img'): string
    {
        $realPath = $file->getRealPath();
        $maxWidth = 450;
        $quality  = 60;

        try {
            $info = @getimagesize($realPath);
            if ($info) {
                $width  = $info[0];
                $height = $info[1];
                $type   = $info[2];

                switch ($type) {
                    case IMAGETYPE_JPEG: $src = @imagecreatefromjpeg($realPath); break;
                    case IMAGETYPE_PNG:  $src = @imagecreatefrompng($realPath); break;
                    case IMAGETYPE_WEBP: $src = @imagecreatefromwebp($realPath); break;
                    case IMAGETYPE_GIF:  $src = @imagecreatefromgif($realPath); break;
                    default:             $src = @imagecreatefromstring(file_get_contents($realPath)); break;
                }

                if ($src) {
                    if ($width > $maxWidth) {
                        $newHeight = (int)(($height / $width) * $maxWidth);
                        $dst = imagecreatetruecolor($maxWidth, $newHeight);
                        imagecopyresampled($dst, $src, 0, 0, 0, 0, $maxWidth, $newHeight, $width, $height);
                        imagedestroy($src);
                        $src = $dst;
                    }

                    ob_start();
                    imagejpeg($src, null, $quality);
                    $compressedData = ob_get_clean();
                    imagedestroy($src);

                    if ($compressedData) {
                        $b64 = 'data:image/jpeg;base64,' . base64_encode($compressedData);
                        // Truncate if somehow larger than 49,000 chars to guarantee Google Sheets limit
                        if (strlen($b64) <= 49000) {
                            return $b64;
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('GD image compression failed: ' . $e->getMessage());
        }

        // Fallback to uncompressed base64 truncated to 49,000 chars
        $mime = $file->getMimeType() ?: 'image/jpeg';
        $b64  = 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($realPath));

        return strlen($b64) > 49000 ? substr($b64, 0, 49000) : $b64;
    }
}




