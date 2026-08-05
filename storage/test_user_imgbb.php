<?php
require __DIR__ . '/../vendor/autoload.php';

try {
    $file = __DIR__ . '/../public/favicon.ico';
    $imageData = base64_encode(file_get_contents($file));
    $apiKey = '06edfc5b9a00cb0ef375813f3d44c9f9';

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://api.imgbb.com/1/upload?key=' . $apiKey);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, ['image' => $imageData]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $response = curl_exec($ch);
    curl_close($ch);

    $json = json_decode($response, true);
    if (isset($json['data']['url'])) {
        echo "SUCCESS! Cloud Image URL: " . $json['data']['url'] . "\n";
    } else {
        echo "FAILED: " . json_encode($json) . "\n";
    }
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
