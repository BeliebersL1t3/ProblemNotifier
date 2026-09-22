@php
    $logoPath = public_path('logo.png');
    $logoUrl = null;
    if (isset($message) && method_exists($message, 'embed') && file_exists($logoPath)) {
        try {
            $logoUrl = $message->embed($logoPath);
        } catch (\Throwable $e) {
            $logoUrl = null;
        }
    }
    if (!$logoUrl) {
        $logoUrl = 'cid:telunas-logo';
    }
    $reportRef = 'TEL-CF-' . date('Ymd') . '-' . strtoupper(substr(md5($emailSubject . microtime()), 0, 4));
@endphp
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{ $emailSubject }}</title>
    <style type="text/css">
        /* Client-specific Resets */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
        body { margin: 0; padding: 0; width: 100% !important; background-color: #F6F4EF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        
        /* Mobile responsive */
        @media only screen and (max-width: 620px) {
            .container-table { width: 100% !important; border-radius: 0 !important; }
            .content-padding { padding: 24px 18px !important; }
            .kpi-col { display: block !important; width: 100% !important; margin-bottom: 10px !important; }
            .kpi-col-table { width: 100% !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F4EF; color: #2D3748; -webkit-font-smoothing: antialiased;">

    <!-- Wrapper Table -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F6F4EF; table-layout: fixed;">
        <tr>
            <td align="center" style="padding: 30px 12px;">
                
                <!-- Main Container Card -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container-table" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E5E0D5; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); overflow: hidden;">
                    
                    <!-- Decorative Resort Gold Header Stripe -->
                    <tr>
                        <td height="5" style="background: linear-gradient(90deg, #A88448 0%, #C9AA71 50%, #A88448 100%); font-size: 1px; line-height: 1px;">&nbsp;</td>
                    </tr>

                    <!-- Executive Header -->
                    <tr>
                        <td align="center" style="padding: 32px 30px 24px; background-color: #FFFFFF; border-bottom: 1px solid #ECE7DE;">
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="center">
                                        <img src="{{ $logoUrl }}" alt="Telunas Resorts" width="135" style="display: block; margin: 0 auto 14px; max-width: 135px; height: auto;" border="0" />
                                        <h1 style="margin: 0 0 4px; font-family: 'Georgia', serif, -apple-system, sans-serif; font-size: 18px; font-weight: 700; letter-spacing: 2.5px; color: #1F2937; text-transform: uppercase;">
                                            TELUNAS RESORTS
                                        </h1>
                                        <div style="font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #9A7B3E;">
                                            CAMPUSFIX &bull; FACILITY &amp; ISSUE TRACKER REPORT
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Main Content Area -->
                    <tr>
                        <td class="content-padding" style="padding: 32px 34px 28px; background-color: #FFFFFF;">
                            
                            <!-- Official Dispatch Meta Pill -->
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                                <tr>
                                    <td style="background-color: #F8F5EE; border: 1px solid #E2D9C8; border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 700; color: #8F7034; letter-spacing: 0.5px; text-transform: uppercase;">
                                        Official Dispatch &bull; Ref: {{ $reportRef }}
                                    </td>
                                </tr>
                            </table>

                            <!-- Report Headline -->
                            <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 700; color: #111827; line-height: 1.35; letter-spacing: -0.3px;">
                                {{ $emailSubject }}
                            </h2>

                            @if(!empty($isNoReply))
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                                <tr>
                                    <td style="background-color: #FEF3C7; border: 1px solid #FDE68A; border-left: 3px solid #D97706; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #92400E; line-height: 1.45;">
                                        <strong>Automated Monthly Dispatch (No-Reply):</strong> This periodic operations report was compiled automatically by the Telunas CampusFix system. Replies to this email address are not monitored.
                                    </td>
                                </tr>
                            </table>
                            @endif

                            <!-- Custom Sender's Memo (if provided) -->
                            @if(!empty($customMessage))
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                                <tr>
                                    <td style="background-color: #FAF8F5; border-left: 3px solid #C9AA71; border-top: 1px solid #EFEAE1; border-right: 1px solid #EFEAE1; border-bottom: 1px solid #EFEAE1; border-radius: 0 8px 8px 0; padding: 14px 18px;">
                                        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9A7B3E; margin-bottom: 6px;">
                                            Executive Note &bull; {{ $senderName }}
                                        </div>
                                        <div style="font-size: 14px; line-height: 1.6; color: #374151;">
                                            {!! nl2br(e($customMessage)) !!}
                                        </div>
                                    </td>
                                </tr>
                            </table>
                            @endif

                            <!-- KPI / Metric Highlights (2 Cards side by side) -->
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                                <tr>
                                    <!-- Total Issues KPI Tile -->
                                    <td class="kpi-col" width="48%" valign="top">
                                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="kpi-col-table" style="background-color: #FDFBF7; border: 1px solid #ECE4D5; border-radius: 8px; padding: 14px 16px;">
                                            <tr>
                                                <td>
                                                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #8C8270; margin-bottom: 4px;">
                                                        Total Issues
                                                    </div>
                                                    <div style="font-size: 26px; font-weight: 800; color: #8F6F30; line-height: 1;">
                                                        {{ $reportMeta['total_issues'] ?? '-' }}
                                                    </div>
                                                    <div style="font-size: 11px; color: #6B7280; margin-top: 4px;">
                                                        Logged in report scope
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    
                                    <td class="kpi-col" width="4%" style="font-size: 1px; line-height: 1px;">&nbsp;</td>

                                    <!-- Scope Filter KPI Tile -->
                                    <td class="kpi-col" width="48%" valign="top">
                                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="kpi-col-table" style="background-color: #FDFBF7; border: 1px solid #ECE4D5; border-radius: 8px; padding: 14px 16px;">
                                            <tr>
                                                <td>
                                                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #8C8270; margin-bottom: 4px;">
                                                        Department Filter
                                                    </div>
                                                    @php
                                                        $rawScope = strtolower((string)($reportMeta['scope'] ?? 'all'));
                                                        $scopeMap = [
                                                            'all'        => 'All Departments',
                                                            'my_scope'   => 'My Scope',
                                                            'to_fix'     => 'To Fix',
                                                            'my_reports' => 'My Reports',
                                                            'mentions'   => 'Mentions',
                                                        ];
                                                        $scopeLabel = $scopeMap[$rawScope] ?? ucwords(str_replace('_', ' ', $reportMeta['scope']));
                                                    @endphp
                                                    <div style="font-size: 15px; font-weight: 700; color: #1F2937;">
                                                        <span style="display: inline-block; background-color: #ECE5D8; color: #4A3E2C; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">
                                                            {{ $scopeLabel }}
                                                        </span>
                                                    </div>
                                                    <div style="font-size: 11px; color: #6B7280; margin-top: 6px;">
                                                        Period: <strong>{{ is_array($reportMeta['sheets'] ?? '') ? implode(', ', $reportMeta['sheets']) : ($reportMeta['sheets'] ?? 'All Periods') }}</strong>
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Detailed Audit Metadata Table -->
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFFFFF; border: 1px solid #EBE6DC; border-radius: 8px; margin-bottom: 24px; overflow: hidden;">
                                <tr>
                                    <td style="padding: 10px 16px; background-color: #FAF8F5; border-bottom: 1px solid #EBE6DC; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #7C7465;">
                                        Audit Dispatch Details
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 16px;">
                                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <td style="padding: 5px 0; font-size: 13px; color: #6B7280; width: 40%;">Generated By</td>
                                                <td style="padding: 5px 0; font-size: 13px; color: #1F2937; font-weight: 600; text-align: right;">
                                                    {{ $senderName }} <span style="color: #6B7280; font-weight: normal;">({{ $senderDepartment }})</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 5px 0; font-size: 13px; color: #6B7280; border-top: 1px solid #F3EFE6;">Generated Date</td>
                                                <td style="padding: 5px 0; font-size: 13px; color: #1F2937; font-weight: 600; text-align: right; border-top: 1px solid #F3EFE6;">
                                                    {{ now()->format('d M Y, H:i') }}
                                                </td>
                                            </tr>
                                            @if(!empty($reportMeta['sheets']))
                                            <tr>
                                                <td style="padding: 5px 0; font-size: 13px; color: #6B7280; border-top: 1px solid #F3EFE6;">Sheet / Period</td>
                                                <td style="padding: 5px 0; font-size: 13px; color: #1F2937; font-weight: 600; text-align: right; border-top: 1px solid #F3EFE6;">
                                                    {{ is_array($reportMeta['sheets']) ? implode(', ', $reportMeta['sheets']) : $reportMeta['sheets'] }}
                                                </td>
                                            </tr>
                                            @endif
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Official PDF Document Attachment Card -->
                            @if(!empty($pdfFilename))
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FAF8F5; border: 1px solid #DCD4C4; border-radius: 8px; margin-bottom: 12px;">
                                <tr>
                                    <td style="padding: 12px 16px;">
                                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <!-- PDF Badge Icon -->
                                                <td width="42" valign="middle" align="center" style="padding-right: 12px;">
                                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color: #B91C1C; border-radius: 6px; width: 38px; height: 38px;">
                                                        <tr>
                                                            <td align="center" valign="middle" style="color: #FFFFFF; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; font-family: Arial, sans-serif;">
                                                                PDF
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <!-- Document Details -->
                                                <td valign="middle">
                                                    <div style="font-size: 13px; font-weight: 700; color: #1F2937; word-break: break-all; line-height: 1.3;">
                                                        {{ $pdfFilename }}
                                                    </div>
                                                    <div style="font-size: 11px; color: #6B7280; margin-top: 2px;">
                                                        Official Telunas Audit Document &bull; Attached to this email
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            @endif

                            <!-- Official Excel Spreadsheet Attachment Card -->
                            @if(!empty($excelFilename))
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; margin-bottom: 20px;">
                                <tr>
                                    <td style="padding: 12px 16px;">
                                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <!-- Excel Badge Icon -->
                                                <td width="42" valign="middle" align="center" style="padding-right: 12px;">
                                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color: #15803D; border-radius: 6px; width: 38px; height: 38px;">
                                                        <tr>
                                                            <td align="center" valign="middle" style="color: #FFFFFF; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; font-family: Arial, sans-serif;">
                                                                XLSX
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <!-- Document Details -->
                                                <td valign="middle">
                                                    <div style="font-size: 13px; font-weight: 700; color: #14532D; word-break: break-all; line-height: 1.3;">
                                                        {{ $excelFilename }}
                                                    </div>
                                                    <div style="font-size: 11px; color: #166534; margin-top: 2px;">
                                                        Raw Data &amp; KPI Spreadsheet Workbook &bull; Attached to this email
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            @endif

                            <!-- Archival & Viewing Instructions -->
                            <p style="margin: 0; font-size: 13px; color: #6B7280; line-height: 1.55;">
                                The full detailed report has been compiled and securely attached to this email according to your subscription preferences for your review, analysis, and records.
                            </p>

                        </td>
                    </tr>

                    <!-- Executive Footer -->
                    <tr>
                        <td style="padding: 24px 34px 28px; background-color: #F8F6F1; border-top: 1px solid #ECE7DE; text-align: center;">
                            <div style="font-size: 12px; font-weight: 700; color: #4B5563; margin-bottom: 4px;">
                                Telunas CampusFix Issue Tracker System
                            </div>
                            <div style="font-size: 11px; color: #8F8778; letter-spacing: 0.5px; margin-bottom: 12px;">
                                Telunas Resorts &bull; Private Island &amp; Beach Resort
                            </div>
                            <div style="font-size: 10px; color: #9CA3AF; line-height: 1.5; border-top: 1px solid #E5E0D5; padding-top: 12px;">
                                <strong>Confidentiality Notice:</strong> This automated transmission and its attachments contain privileged operational information intended solely for authorized Telunas Resorts personnel. If you received this email in error, please immediately notify the system administrator and delete this communication.
                            </div>
                        </td>
                    </tr>

                </table>
                <!-- End Main Container Card -->

            </td>
        </tr>
    </table>
    <!-- End Wrapper Table -->

</body>
</html>
