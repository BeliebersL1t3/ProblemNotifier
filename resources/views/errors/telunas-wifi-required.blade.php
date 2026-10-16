<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Akses Terbatas — Khusus Jaringan Wi-Fi Telunas</title>
    <link rel="icon" type="image/png" href="{{ asset('logo.png') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
        }
        body {
            background: linear-gradient(135deg, #0c1524 0%, #16243b 50%, #0d1a2d 100%);
            color: #f1f5f9;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
        }
        .container {
            max-width: 520px;
            width: 100%;
            background: rgba(22, 33, 54, 0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(227, 209, 170, 0.2);
            border-radius: 1.5rem;
            padding: 2.5rem 2rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        .glow {
            position: absolute;
            top: -80px;
            left: 50%;
            transform: translateX(-50%);
            width: 240px;
            height: 240px;
            background: radial-gradient(circle, rgba(227, 209, 170, 0.15) 0%, transparent 70%);
            pointer-events: none;
        }
        .icon-wrap {
            width: 80px;
            height: 80px;
            margin: 0 auto 1.5rem;
            background: rgba(239, 68, 68, 0.12);
            border: 2px solid rgba(239, 68, 68, 0.35);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        .icon-wrap svg {
            width: 40px;
            height: 40px;
            color: #f87171;
        }
        .badge {
            display: inline-block;
            padding: 0.35rem 0.85rem;
            background: rgba(227, 209, 170, 0.12);
            border: 1px solid rgba(227, 209, 170, 0.3);
            border-radius: 9999px;
            color: #E3D1AA;
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            margin-bottom: 1rem;
        }
        h1 {
            font-size: 1.5rem;
            font-weight: 800;
            color: #ffffff;
            margin-bottom: 0.75rem;
            line-height: 1.3;
        }
        p.desc {
            color: #94a3b8;
            font-size: 0.925rem;
            line-height: 1.55;
            margin-bottom: 1.5rem;
        }
        .info-card {
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 1rem;
            padding: 1.15rem;
            margin-bottom: 1.75rem;
            text-align: left;
            font-size: 0.85rem;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.35rem 0;
            border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
        }
        .info-row:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }
        .info-label {
            color: #64748b;
            font-weight: 500;
        }
        .info-val {
            color: #e2e8f0;
            font-family: monospace;
            font-weight: 600;
        }
        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.15rem 0.55rem;
            background: rgba(239, 68, 68, 0.2);
            color: #fca5a5;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .steps {
            background: rgba(227, 209, 170, 0.05);
            border: 1px solid rgba(227, 209, 170, 0.15);
            border-radius: 1rem;
            padding: 1rem 1.25rem;
            margin-bottom: 1.75rem;
            text-align: left;
        }
        .steps-title {
            color: #E3D1AA;
            font-size: 0.825rem;
            font-weight: 700;
            margin-bottom: 0.65rem;
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }
        .steps ol {
            padding-left: 1.2rem;
            color: #cbd5e1;
            font-size: 0.825rem;
            line-height: 1.6;
        }
        .btn-reload {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            padding: 0.85rem 1.5rem;
            background: #E3D1AA;
            color: #1e293b;
            font-size: 0.95rem;
            font-weight: 700;
            border-radius: 0.75rem;
            border: none;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s ease;
            box-shadow: 0 4px 14px rgba(227, 209, 170, 0.3);
        }
        .btn-reload:hover {
            background: #f1dfbc;
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(227, 209, 170, 0.4);
        }
        .footer-note {
            margin-top: 1.25rem;
            font-size: 0.75rem;
            color: #64748b;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="glow"></div>
        <div class="badge">Telunas Resort Security</div>

        <div class="icon-wrap">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.166a1 1 0 11-1.414 1.414 1 1 0 011.414-1.414zM3 3l18 18" />
            </svg>
        </div>

        <h1>Akses Khusus Jaringan Wi-Fi Telunas</h1>
        <p class="desc">
            Sistem Telunas Issue Tracker dikhususkan untuk penggunaan staf di area resort. Untuk alasan keamanan, sistem tidak dapat diakses melalui data seluler atau jaringan luar.
        </p>

        <div class="info-card">
            <div class="info-row">
                <span class="info-label">Status Sambungan:</span>
                <span class="status-pill">
                    <svg style="width:12px;height:12px;" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10"/></svg>
                    Di Luar Jaringan Wi-Fi Telunas
                </span>
            </div>
            <div class="info-row">
                <span class="info-label">IP Perangkat Anda:</span>
                <span class="info-val">{{ $clientIp ?? 'Tidak Diketahui' }}</span>
            </div>
            @if(!empty($allowedHint))
            <div class="info-row">
                <span class="info-label">IP Resmi Wi-Fi Resort:</span>
                <span class="info-val">{{ $allowedHint }}</span>
            </div>
            @endif
        </div>

        <div class="steps">
            <div class="steps-title">
                <svg style="width:16px;height:16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Cara Menghubungkan:
            </div>
            <ol>
                <li>Pastikan ponsel atau laptop Anda terhubung ke <strong>Wi-Fi Telunas Resort</strong>.</li>
                <li>Jika menggunakan paket data (Telkomsel/Indosat/dll), nyalakan Wi-Fi perangkat Anda.</li>
                <li>Setelah terhubung ke Wi-Fi Telunas, tekan tombol di bawah ini.</li>
            </ol>
        </div>

        <button onclick="window.location.reload();" class="btn-reload">
            <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Muat Ulang Halaman
        </button>

        <p class="footer-note">
            Jika Anda sudah terhubung ke Wi-Fi Telunas namun tetap melihat halaman ini, silakan hubungi tim IT / Administrator.
        </p>
    </div>
</body>
</html>
