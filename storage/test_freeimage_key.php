<?php
require __DIR__ . '/../vendor/autoload.php';

try {
    $apiKey = '6d025147137d4b92834d9ee04824033a';
    $img = imagecreatetruecolor(100, 100);
    $green = imagecolorallocate($img, 0, 200, 100);
    imagefill($img, 0, 0, $green);
    ob_start();
    imagepng($img);
    $base64 = base64_encode(ob_get_clean());
    imagedestroy($img);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://freeimage.host/api/1/upload?key=' . $apiKey);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, [
        'key' => $apiKey,
        'action' => 'upload',
        'source' => $base64,
        'format' => 'json'
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $res = curl_exec($ch);
    curl_close($ch);

    $json = json_decode($res, true);
    if (isset($json['image']['url'])) {
        echo "SUCCESS! Direct HTTPS Link: " . $json['image']['url'] . "\n";
    } else {
        echo "RESPONSE: " . $res . "\n";
    }
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
