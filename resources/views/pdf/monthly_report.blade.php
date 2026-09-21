<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <title>{{ $reportTitle ?? 'Telunas Monthly Report' }}</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 12mm 10mm 12mm 10mm;
        }
        body {
            font-family: DejaVu Sans, Helvetica, Arial, sans-serif;
            font-size: 8.5pt;
            color: #1F2937;
            margin: 0;
            padding: 0;
        }
        .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            border-bottom: 2px solid #C9AA71;
            padding-bottom: 8px;
        }
        .logo-img {
            max-width: 120px;
            height: auto;
        }
        .title-block {
            text-align: right;
        }
        .report-title {
            font-size: 14pt;
            font-weight: bold;
            color: #1C1B0E;
            margin: 0 0 2px 0;
            text-transform: uppercase;
        }
        .report-subtitle {
            font-size: 8.5pt;
            color: #78716C;
            margin: 0;
        }
        .scope-badge {
            display: inline-block;
            background-color: #F5EFEB;
            border: 1px solid #D7C9B8;
            color: #78350F;
            font-weight: bold;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 8pt;
            margin-top: 4px;
        }
        /* KPI Cards */
        .kpi-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 6px 0;
            margin-bottom: 12px;
        }
        .kpi-card {
            background-color: #FBF9F5;
            border: 1px solid #E7E0D3;
            border-radius: 6px;
            padding: 6px 10px;
            text-align: center;
        }
        .kpi-label {
            font-size: 7pt;
            text-transform: uppercase;
            color: #78716C;
            font-weight: bold;
        }
        .kpi-value {
            font-size: 14pt;
            font-weight: bold;
            color: #8F6F30;
            margin-top: 2px;
        }
        .kpi-sub {
            font-size: 6.5pt;
            color: #A8A29E;
        }
        /* Issues Table */
        .issues-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 7.5pt;
        }
        .issues-table th {
            background-color: #1C1B0E;
            color: #F5EFEB;
            text-align: left;
            padding: 5px 6px;
            font-size: 7pt;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: 1px solid #1C1B0E;
        }
        .issues-table td {
            padding: 4px 6px;
            border: 1px solid #E5E7EB;
            vertical-align: top;
        }
        .issues-table tr:nth-child(even) {
            background-color: #F9FAFB;
        }
        /* Status Badges */
        .badge {
            display: inline-block;
            padding: 1px 5px;
            border-radius: 3px;
            font-size: 6.5pt;
            font-weight: bold;
            text-transform: uppercase;
        }
        .badge-solved { background-color: #D1FAE5; color: #065F46; border: 1px solid #A7F3D0; }
        .badge-progress { background-color: #DBEAFE; color: #1E40AF; border: 1px solid #BFDBFE; }
        .badge-pending { background-color: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
        .badge-open { background-color: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; }
        .badge-high { background-color: #FEE2E2; color: #991B1B; }
        .badge-med { background-color: #FEF3C7; color: #92400E; }
        .badge-low { background-color: #F3F4F6; color: #4B5563; }
        .footer-table {
            width: 100%;
            margin-top: 10px;
            font-size: 7pt;
            color: #9CA3AF;
            border-top: 1px solid #E5E7EB;
            padding-top: 4px;
        }
    </style>
</head>
<body>
    <!-- Header -->
    <table class="header-table">
        <tr>
            <td style="width: 45%; vertical-align: middle;">
                @php
                    $logoFile = public_path('logo.png');
                    $logoBase64 = file_exists($logoFile) ? 'data:image/png;base64,' . base64_encode(file_get_contents($logoFile)) : null;
                @endphp
                @if($logoBase64)
                    <img src="{{ $logoBase64 }}" class="logo-img" alt="Telunas Resorts" style="max-height: 38px; width: auto;" />
                @else
                    <strong style="font-size: 13pt; color: #C9AA71;">TELUNAS RESORTS</strong>
                @endif
                <div style="font-size: 7pt; color: #78716C; margin-top: 2px;">
                    PT. Telunas Resort Indonesia &bull; Pulau Sugi, Kepulauan Riau
                </div>
            </td>
            <td class="title-block" style="width: 55%; vertical-align: middle;">
                <div class="report-title">Monthly Operations Report</div>
                <div class="report-subtitle">
                    Period: <strong>{{ $periodLabel ?? now()->subMonth()->format('F Y') }}</strong>
                </div>
                <div class="scope-badge">
                    Scope: {{ $scopeLabel ?? 'All Departments' }}
                </div>
            </td>
        </tr>
    </table>

    <!-- KPI Summary Row -->
    <table class="kpi-table">
        <tr>
            <td class="kpi-card" style="width: 20%;">
                <div class="kpi-label">Total Logged Issues</div>
                <div class="kpi-value">{{ $totalCount ?? count($issues) }}</div>
                <div class="kpi-sub">Within report period</div>
            </td>
            <td class="kpi-card" style="width: 20%;">
                <div class="kpi-label">Resolved / Solved</div>
                <div class="kpi-value" style="color: #059669;">{{ $solvedCount ?? 0 }}</div>
                <div class="kpi-sub">
                    {{ $totalCount > 0 ? round(($solvedCount / $totalCount) * 100) : 0 }}% resolution rate
                </div>
            </td>
            <td class="kpi-card" style="width: 20%;">
                <div class="kpi-label">In Progress</div>
                <div class="kpi-value" style="color: #2563EB;">{{ $progressCount ?? 0 }}</div>
                <div class="kpi-sub">Active staff handling</div>
            </td>
            <td class="kpi-card" style="width: 20%;">
                <div class="kpi-label">Pending Delays</div>
                <div class="kpi-value" style="color: #D97706;">{{ $pendingCount ?? 0 }}</div>
                <div class="kpi-sub">Awaiting parts / supplies</div>
            </td>
            <td class="kpi-card" style="width: 20%;">
                <div class="kpi-label">Avg. Duration</div>
                <div class="kpi-value" style="font-size: 11pt; color: #4B5563; padding-top: 3px;">
                    {{ $avgDuration ?? 'N/A' }}
                </div>
                <div class="kpi-sub">Resolution turnaround</div>
            </td>
        </tr>
    </table>

    <!-- Issues Table -->
    <table class="issues-table">
        <thead>
            <tr>
                <th style="width: 5%;">ID</th>
                <th style="width: 8%;">Date</th>
                <th style="width: 24%;">Problem Title & Location</th>
                <th style="width: 12%;">Department</th>
                <th style="width: 10%;">Category</th>
                <th style="width: 12%;">Reporter</th>
                <th style="width: 12%;">Handled By</th>
                <th style="width: 7%;">Duration</th>
                <th style="width: 6%;">Priority</th>
                <th style="width: 6%; text-align: center;">Status</th>
            </tr>
        </thead>
        <tbody>
            @forelse($issues as $issue)
                @php
                    $status = strtolower($issue['status'] ?? 'open');
                    $priority = strtolower($issue['priority'] ?? 'low');
                @endphp
                <tr>
                    <td style="font-weight: bold; color: #1C1B0E;">
                        #{{ str_replace('TEL-', '', $issue['id'] ?? '') }}
                    </td>
                    <td>
                        {{ !empty($issue['reportedAtFormatted']) ? $issue['reportedAtFormatted'] : ($issue['reportedAt'] ?? '-') }}
                    </td>
                    <td>
                        <strong style="color: #111827;">{{ $issue['title'] ?? '-' }}</strong>
                        @if(!empty($issue['location']))
                            <div style="font-size: 6.5pt; color: #6B7280;">📍 {{ $issue['location'] }}</div>
                        @endif
                    </td>
                    <td>{{ $issue['department'] ?? '-' }}</td>
                    <td>{{ !empty($issue['category']) ? ucwords(str_replace(['-', '_'], ' ', $issue['category'])) : '-' }}</td>
                    <td>{{ $issue['reporter'] ?? '-' }}</td>
                    <td>
                        @if(!empty($issue['solvedBy']))
                            <span style="color: #059669; font-weight: bold;">{{ $issue['solvedBy'] }}</span>
                        @elseif(!empty($issue['taker']))
                            <span>{{ $issue['taker'] }}</span>
                        @else
                            <span style="color: #9CA3AF;">-</span>
                        @endif
                    </td>
                    <td>{{ $issue['durationLabel'] ?? '-' }}</td>
                    <td>
                        <span class="badge badge-{{ $priority }}">
                            {{ strtoupper($priority) }}
                        </span>
                    </td>
                    <td style="text-align: center;">
                        <span class="badge badge-{{ $status }}">
                            {{ strtoupper($status) }}
                        </span>
                    </td>
                </tr>
                @if(!empty($includeDelayTimeline) && $status === 'pending' && !empty($issue['pendingReason']))
                <tr>
                    <td colspan="10" style="background-color: #FFFBEB; color: #B45309; font-size: 6.5pt; padding: 3px 6px;">
                        <em>Delay Reason: {{ $issue['pendingReason'] }} (Logged by: {{ $issue['pendingBy'] ?? 'Staff' }})</em>
                    </td>
                </tr>
                @endif
            @empty
                <tr>
                    <td colspan="10" style="text-align: center; padding: 15px; color: #9CA3AF;">
                        No issue records logged for this department scope within the selected period.
                    </td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <!-- Footer -->
    <table class="footer-table">
        <tr>
            <td style="text-align: left;">
                Telunas CampusFix Issue Tracker &bull; Official Management Report &bull; Generated on {{ now()->format('d M Y, H:i') }}
            </td>
            <td style="text-align: right;">
                Confidential Document &bull; Telunas Resorts Indonesia
            </td>
        </tr>
    </table>
</body>
</html>
