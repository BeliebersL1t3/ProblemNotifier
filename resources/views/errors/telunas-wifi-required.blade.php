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
    <script>
        // Frame-busting: Prevent page from being embedded inside an iframe or dismissable dialog
        if (window.top !== window.self) {
            window.top.location.href = window.location.href;
        }
    </script>
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
            background: rgba(22, 33, 54, 0.92);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(227, 209, 170, 0.2);
            border-radius: 1.5rem;
            padding: 2.25rem 1.75rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
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
            width: 72px;
            height: 72px;
            margin: 0 auto 1.25rem;
            background: rgba(239, 68, 68, 0.12);
            border: 2px solid rgba(239, 68, 68, 0.35);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        .icon-wrap svg {
            width: 36px;
            height: 36px;
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
            margin-bottom: 0.85rem;
        }
        h1 {
            font-size: 1.4rem;
            font-weight: 800;
            color: #ffffff;
            margin-bottom: 0.65rem;
            line-height: 1.3;
        }
        p.desc {
            color: #94a3b8;
            font-size: 0.875rem;
            line-height: 1.5;
            margin-bottom: 1.25rem;
        }
        .info-card {
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 0.875rem;
            padding: 1rem;
            margin-bottom: 1.25rem;
            text-align: left;
            font-size: 0.825rem;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.3rem 0;
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
            background: rgba(227, 209, 170, 0.04);
            border: 1px solid rgba(227, 209, 170, 0.12);
            border-radius: 0.875rem;
            padding: 0.85rem 1rem;
            margin-bottom: 1.25rem;
            text-align: left;
        }
        .steps-title {
            color: #E3D1AA;
            font-size: 0.8rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }
        .steps ol {
            padding-left: 1.2rem;
            color: #cbd5e1;
            font-size: 0.8rem;
            line-height: 1.55;
        }
        .btn-reload {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            padding: 0.75rem 1.25rem;
            background: rgba(227, 209, 170, 0.15);
            color: #E3D1AA;
            border: 1px solid rgba(227, 209, 170, 0.35);
            font-size: 0.875rem;
            font-weight: 700;
            border-radius: 0.75rem;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s ease;
        }
        .btn-reload:hover {
            background: rgba(227, 209, 170, 0.25);
            transform: translateY(-1px);
        }
        .divider {
            position: relative;
            margin: 1.5rem 0 1.25rem;
            text-align: center;
        }
        .divider::before {
            content: '';
            position: absolute;
            left: 0;
            top: 50%;
            width: 100%;
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
        }
        .divider span {
            position: relative;
            background: #172338;
            padding: 0 0.75rem;
            color: #64748b;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .bypass-card {
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(227, 209, 170, 0.25);
            border-radius: 1rem;
            padding: 1.25rem;
            text-align: left;
            position: relative;
        }
        .bypass-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #E3D1AA;
            font-weight: 700;
            font-size: 0.875rem;
            margin-bottom: 0.4rem;
        }
        .bypass-header svg {
            width: 18px;
            height: 18px;
            color: #E3D1AA;
        }
        .bypass-desc {
            color: #94a3b8;
            font-size: 0.775rem;
            line-height: 1.45;
            margin-bottom: 1rem;
        }
        .input-wrap {
            position: relative;
            margin-bottom: 0.75rem;
        }
        .input-passcode {
            width: 100%;
            padding: 0.75rem 2.5rem 0.75rem 0.85rem;
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 0.65rem;
            color: #ffffff;
            font-size: 0.875rem;
            outline: none;
            transition: all 0.2s ease;
        }
        .input-passcode:focus {
            border-color: #E3D1AA;
            box-shadow: 0 0 0 2px rgba(227, 209, 170, 0.2);
            background: rgba(30, 41, 59, 0.95);
        }
        .input-passcode::placeholder {
            color: #64748b;
            font-size: 0.825rem;
        }
        .btn-toggle-eye {
            position: absolute;
            right: 0.65rem;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: #64748b;
            cursor: pointer;
            padding: 0.25rem;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .btn-toggle-eye:hover {
            color: #E3D1AA;
        }
        .btn-toggle-eye svg {
            width: 18px;
            height: 18px;
        }
        .btn-bypass {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            padding: 0.75rem 1.25rem;
            background: #E3D1AA;
            color: #0f172a;
            font-size: 0.875rem;
            font-weight: 700;
            border-radius: 0.65rem;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(227, 209, 170, 0.25);
        }
        .btn-bypass:hover {
            background: #f1dfbc;
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(227, 209, 170, 0.35);
        }
        .btn-bypass svg {
            width: 16px;
            height: 16px;
        }
        .alert {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.65rem 0.85rem;
            border-radius: 0.6rem;
            font-size: 0.775rem;
            margin-bottom: 0.75rem;
            line-height: 1.4;
        }
        .alert svg {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
        }
        .alert-error {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #fca5a5;
        }
        .alert-success {
            background: rgba(34, 197, 94, 0.15);
            border: 1px solid rgba(34, 197, 94, 0.3);
            color: #86efac;
        }
        .footer-note {
            margin-top: 1.25rem;
            font-size: 0.725rem;
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
            Sistem Telunas Issue Tracker dikhususkan untuk staf di area resort. Untuk alasan keamanan, sistem tidak dapat diakses melalui data seluler atau jaringan luar tanpa otorisasi.
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
                Cara Menghubungkan Normal:
            </div>
            <ol>
                <li>Pastikan ponsel atau laptop Anda terhubung ke <strong>Wi-Fi Telunas Resort</strong>.</li>
                <li>Jika menggunakan paket data (Telkomsel/Indosat/dll), nyalakan Wi-Fi perangkat Anda.</li>
                <li>Setelah terhubung ke Wi-Fi Telunas, tekan tombol muat ulang di bawah.</li>
            </ol>
        </div>

        <button onclick="window.location.reload();" class="btn-reload">
            <svg style="width:16px;height:16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Muat Ulang Halaman
        </button>

        <div class="divider">
            <span>atau</span>
        </div>

        <!-- Leader Bypass Form -->
        <div class="bypass-card">
            <div class="bypass-header">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span>Izin Akses Khusus Pemimpin (Bypass)</span>
            </div>
            <p class="bypass-desc">
                Pemimpin atau supervisor yang bertugas di luar resort dapat memasukkan passcode resmi untuk mengaktifkan izin akses selama 24 jam.
            </p>

            @if ($errors->has('passcode'))
                <div class="alert alert-error">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{{ $errors->first('passcode') }}</span>
                </div>
            @endif

            @if (session('status'))
                <div class="alert alert-success">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{{ session('status') }}</span>
                </div>
            @endif

            <form action="{{ route('telunas.wifi.bypass') }}" method="POST">
                @csrf
                <div class="input-wrap">
                    <input type="password" id="passcode" name="passcode" class="input-passcode" placeholder="Masukkan passcode supervisor..." required autocomplete="off">
                    <button type="button" id="togglePasscode" class="btn-toggle-eye" title="Lihat Passcode">
                        <svg id="eyeOpen" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <svg id="eyeClosed" style="display:none;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                    </button>
                </div>
                <button type="submit" class="btn-bypass">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Buka Akses Website (24 Jam)
                </button>
            </form>
        </div>

        <p class="footer-note">
            Jika Anda sudah terhubung ke Wi-Fi Telunas namun tetap melihat halaman ini, silakan hubungi tim IT / Administrator.
        </p>
    </div>

    <script>
        const passcodeField = document.getElementById('passcode');
        const toggleBtn = document.getElementById('togglePasscode');
        const eyeOpen = document.getElementById('eyeOpen');
        const eyeClosed = document.getElementById('eyeClosed');

        if (toggleBtn && passcodeField) {
            toggleBtn.addEventListener('click', function () {
                if (passcodeField.type === 'password') {
                    passcodeField.type = 'text';
                    eyeOpen.style.display = 'none';
                    eyeClosed.style.display = 'block';
                } else {
                    passcodeField.type = 'password';
                    eyeOpen.style.display = 'block';
                    eyeClosed.style.display = 'none';
                }
            });
        }
    </script>
</body>
</html>
