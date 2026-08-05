<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $svc = app(App\Services\GoogleService::class);
    $file = new Illuminate\Http\UploadedFile(
        base_path('public/favicon.ico'),
        'test.ico',
        'image/x-icon',
        null,
        true
    );
    echo "Uploading to ImgBB cloud...\n";
    $url = $svc->uploadImage($file, 'test-cloud');
    echo "SUCCESS! Cloud URL: " . $url . "\n";
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
