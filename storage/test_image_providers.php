<?php
require __DIR__ . '/../vendor/autoload.php';

// Test Catbox.moe free upload API
function testCatbox() {
    $file = __DIR__ . '/../public/uploads/.gitkeep';
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://catbox.moe/user/api.php');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, [
        'reqtype' => 'fileupload',
        'fileToUpload' => new CURLFile($file, 'text/plain', 'test.txt')
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);

    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) return "Catbox Error: " . $err;
    return "Catbox Success: " . trim($res);
}

// Test Freeimage.host API
function testFreeimage() {
    $apiKey = '6d025147137d4b92834d9ee04824033a';
    $img = imagecreatetruecolor(50, 50);
    ob_start();
    imagepng($img);
    $data = base64_encode(ob_get_clean());
    imagedestroy($img);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://freeimage.host/api/1/upload?key=' . $apiKey);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, ['image' => $data]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);

    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) return "FreeImage Error: " . $err;
    $json = json_decode($res, true);
    return "FreeImage Success: " . ($json['image']['url'] ?? $res);
}

echo testCatbox() . "\n";
echo testFreeimage() . "\n";
