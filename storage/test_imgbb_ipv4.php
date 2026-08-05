<?php
require __DIR__ . '/../vendor/autoload.php';

try {
    $apiKey = '06edfc5b9a00cb0ef375813f3d44c9f9';

    // Create a 1x1 test image
    $img = imagecreatetruecolor(50, 50);
    $blue = imagecolorallocate($img, 0, 150, 255);
    imagefill($img, 0, 0, $blue);
    ob_start();
    imagepng($img);
    $pngData = ob_get_clean();
    imagedestroy($img);

    $base64 = base64_encode($pngData);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://api.imgbb.com/1/upload?key=' . $apiKey);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, ['image' => $base64]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);

    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        echo "cURL Error: " . $err . "\n";
    } else {
        $json = json_decode($response, true);
        if (isset($json['data']['url'])) {
            echo "SUCCESS! Clean Short URL: " . $json['data']['url'] . "\n";
        } else {
            echo "FAILED: " . $response . "\n";
        }
    }
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
