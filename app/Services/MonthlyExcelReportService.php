<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;

class MonthlyExcelReportService
{
    // Styling Constants (Telunas Signature Palette)
    protected const TELUNAS_GOLD_ARGB = 'FFE3D1AA';
    protected const SECTION_HEADER_ARGB = 'FFF3EAD8';
    protected const CHARCOAL_ARGB = 'FF1C1B0E';
    protected const CELL_BORDER_ARGB = 'FF94A3B8';    // Slate-400 crisp cell gridlines
    protected const GROUP_BORDER_ARGB = 'FF334155';   // Slate-700 solid column group divider
    protected const HEADER_BORDER_ARGB = 'FF9A7B38';  // Dark tan border for header cells
    protected const LINEN_ROW_ARGB = 'FFF5EFE6';      // Telunas soft linen alternating row
    protected const WHITE_ROW_ARGB = 'FFFFFFFF';

    /**
     * Generate XLSX binary string for the monthly report.
     *
     * @param array $issues Filtered list of issue arrays
     * @param array $options Configuration options (periodLabel, scopeLabel, includeKpiSummary, includeDelayTimeline, includeSolutionNotes, includeAuditTrail)
     * @return string Binary contents of the generated XLSX file
     */
    public function generateExcelReport(array $issues, array $options = []): string
    {
        $periodLabel = $options['periodLabel'] ?? now()->subMonth()->format('F Y');
        $scopeLabel = $options['scopeLabel'] ?? 'All Departments';
        $includeKpiSummary = $options['includeKpiSummary'] ?? true;
        $includeDelayTimeline = $options['includeDelayTimeline'] ?? true;
        $includeSolutionNotes = $options['includeSolutionNotes'] ?? true;
        $includeAuditTrail = $options['includeAuditTrail'] ?? false;

        $spreadsheet = new Spreadsheet();
        $spreadsheet->getProperties()
            ->setCreator('Telunas Resort CampusFix')
            ->setLastModifiedBy('Telunas Resort System')
            ->setTitle("Telunas Monthly Operations Report - {$scopeLabel} ({$periodLabel})")
            ->setSubject("Monthly Operations Report {$periodLabel}")
            ->setDescription("Automated monthly report for {$scopeLabel}");

        // ==========================================
        // 1. SHEET 1: RINGKASAN KPI (Optional)
        // ==========================================
        $sheetIndex = 0;
        if ($includeKpiSummary) {
            $kpiSheet = $spreadsheet->getActiveSheet();
            $kpiSheet->setTitle('Ringkasan KPI');
            $kpiSheet->setShowGridLines(true);

            // Title Block
            $kpiSheet->mergeCells('A1:F1');
            $kpiSheet->setCellValue('A1', 'TELUNAS RESORTS — REKAPITULASI LAPORAN OPERASIONAL');
            $kpiSheet->getStyle('A1')->getFont()->setName('Segoe UI')->setSize(13)->setBold(true)->getColor()->setARGB(self::CHARCOAL_ARGB);
            $kpiSheet->getRowDimension(1)->setRowHeight(26);

            $kpiSheet->mergeCells('A2:F2');
            $kpiSheet->setCellValue('A2', 'Pulau Sugi, Moro, Kepulauan Riau — Sistem Pelacakan Masalah & Resolusi Fasilitas');
            $kpiSheet->getStyle('A2')->getFont()->setName('Segoe UI')->setSize(9.5)->setItalic(true)->getColor()->setARGB('FF6B7280');
            $kpiSheet->getRowDimension(2)->setRowHeight(18);

            $kpiSheet->mergeCells('A3:F3');
            $kpiSheet->setCellValue('A3', "Periode: {$periodLabel} | Cakupan: {$scopeLabel} | Tanggal Ekspor: " . now()->format('d/m/Y H:i') . " WIB | Total Tiket: " . count($issues));
            $kpiSheet->getStyle('A3')->getFont()->setName('Segoe UI')->setSize(9)->setBold(true)->getColor()->setARGB('FF4B5563');
            $kpiSheet->getRowDimension(3)->setRowHeight(18);

            // Metrics calculation
            $total = count($issues);
            $solved = count(array_filter($issues, fn($i) => strtolower($i['status'] ?? '') === 'solved'));
            $progress = count(array_filter($issues, fn($i) => strtolower($i['status'] ?? '') === 'progress'));
            $pending = count(array_filter($issues, fn($i) => strtolower($i['status'] ?? '') === 'pending'));
            $open = count(array_filter($issues, fn($i) => in_array(strtolower($i['status'] ?? ''), ['open', 'new'])));
            $archived = count(array_filter($issues, fn($i) => !empty($i['isArchived'])));

            // Table 1: Status Operasional
            $kpiSheet->mergeCells('A5:C5');
            $kpiSheet->setCellValue('A5', '1. RINGKASAN STATUS OPERASIONAL');
            $this->applySectionHeaderStyle($kpiSheet, 'A5:C5');
            $kpiSheet->getRowDimension(5)->setRowHeight(22);

            $kpiTableHeaders = ['Status / Kondisi', 'Jumlah Tiket', 'Persentase (%)'];
            $this->populateTableRow($kpiSheet, 6, $kpiTableHeaders, true);

            $statusData = [
                ['Selesai (Solved)', $solved, $total > 0 ? round(($solved / $total) * 100, 1) . '%' : '0%'],
                ['Sedang Dikerjakan (Progress)', $progress, $total > 0 ? round(($progress / $total) * 100, 1) . '%' : '0%'],
                ['Tertunda (Pending Delay)', $pending, $total > 0 ? round(($pending / $total) * 100, 1) . '%' : '0%'],
                ['Terbuka / Belum Diambil (Open)', $open, $total > 0 ? round(($open / $total) * 100, 1) . '%' : '0%'],
                ['Tiket Terarsip (Archived)', $archived, $total > 0 ? round(($archived / $total) * 100, 1) . '%' : '0%'],
                ['TOTAL TIKET TERFILTER', $total, '100%'],
            ];

            $rowIdx = 7;
            foreach ($statusData as $idx => $sRow) {
                $isTotal = ($idx === count($statusData) - 1);
                $isEven = ($idx % 2 === 1);
                $kpiSheet->setCellValue("A{$rowIdx}", $sRow[0]);
                $kpiSheet->setCellValue("B{$rowIdx}", $sRow[1]);
                $kpiSheet->setCellValue("C{$rowIdx}", $sRow[2]);

                $range = "A{$rowIdx}:C{$rowIdx}";
                $this->applyCrispBorders($kpiSheet, $range);
                $kpiSheet->getStyle("A{$rowIdx}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_LEFT);
                $kpiSheet->getStyle("B{$rowIdx}:C{$rowIdx}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

                if ($isTotal) {
                    $kpiSheet->getStyle($range)->getFont()->setName('Segoe UI')->setSize(9.5)->setBold(true);
                    $this->applySolidFill($kpiSheet, $range, self::SECTION_HEADER_ARGB);
                } else {
                    $kpiSheet->getStyle($range)->getFont()->setName('Segoe UI')->setSize(9);
                    $fillColor = $isEven ? self::LINEN_ROW_ARGB : self::WHITE_ROW_ARGB;
                    $this->applySolidFill($kpiSheet, $range, $fillColor);
                }
                $kpiSheet->getRowDimension($rowIdx)->setRowHeight(20);
                $rowIdx++;
            }

            // Table 2: Rekapitulasi Departemen
            $rowIdx += 2;
            $kpiSheet->mergeCells("A{$rowIdx}:E{$rowIdx}");
            $kpiSheet->setCellValue("A{$rowIdx}", '2. REKAPITULASI PER DEPARTEMEN PENANGGUNG JAWAB');
            $this->applySectionHeaderStyle($kpiSheet, "A{$rowIdx}:E{$rowIdx}");
            $kpiSheet->getRowDimension($rowIdx)->setRowHeight(22);

            $rowIdx++;
            $deptHeaders = ['Departemen Penanggung Jawab', 'Total Tiket', 'Selesai', 'Pending', 'Tingkat Selesai (%)'];
            $this->populateTableRow($kpiSheet, $rowIdx, $deptHeaders, true);

            // Aggregate by department
            $deptStats = [];
            foreach ($issues as $issue) {
                $depts = !empty($issue['assignedDepartments']) && is_array($issue['assignedDepartments'])
                    ? $issue['assignedDepartments']
                    : [!empty($issue['department']) ? $issue['department'] : 'Other'];

                foreach ($depts as $d) {
                    $name = $d ?: 'Unassigned';
                    if (!isset($deptStats[$name])) {
                        $deptStats[$name] = ['total' => 0, 'solved' => 0, 'pending' => 0];
                    }
                    $deptStats[$name]['total']++;
                    $st = strtolower($issue['status'] ?? '');
                    if ($st === 'solved') $deptStats[$name]['solved']++;
                    if ($st === 'pending') $deptStats[$name]['pending']++;
                }
            }

            uasort($deptStats, fn($a, $b) => $b['total'] <=> $a['total']);

            $rowIdx++;
            $dIdx = 0;
            foreach ($deptStats as $dName => $stat) {
                $completion = $stat['total'] > 0 ? round(($stat['solved'] / $stat['total']) * 100, 1) . '%' : '0%';
                $kpiSheet->setCellValue("A{$rowIdx}", $dName);
                $kpiSheet->setCellValue("B{$rowIdx}", $stat['total']);
                $kpiSheet->setCellValue("C{$rowIdx}", $stat['solved']);
                $kpiSheet->setCellValue("D{$rowIdx}", $stat['pending']);
                $kpiSheet->setCellValue("E{$rowIdx}", $completion);

                $range = "A{$rowIdx}:E{$rowIdx}";
                $this->applyCrispBorders($kpiSheet, $range);
                $kpiSheet->getStyle("A{$rowIdx}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_LEFT);
                $kpiSheet->getStyle("B{$rowIdx}:E{$rowIdx}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
                $kpiSheet->getStyle($range)->getFont()->setName('Segoe UI')->setSize(9);

                $fillColor = ($dIdx % 2 === 1) ? self::LINEN_ROW_ARGB : self::WHITE_ROW_ARGB;
                $this->applySolidFill($kpiSheet, $range, $fillColor);

                $kpiSheet->getRowDimension($rowIdx)->setRowHeight(20);
                $rowIdx++;
                $dIdx++;
            }

            // Set column widths for KPI sheet
            $kpiSheet->getColumnDimension('A')->setWidth(34);
            $kpiSheet->getColumnDimension('B')->setWidth(16);
            $kpiSheet->getColumnDimension('C')->setWidth(16);
            $kpiSheet->getColumnDimension('D')->setWidth(16);
            $kpiSheet->getColumnDimension('E')->setWidth(24);
            $kpiSheet->getColumnDimension('F')->setWidth(20);

            // Add new sheet for Raw Tickets
            $dataSheet = $spreadsheet->createSheet();
            $sheetIndex = 1;
        } else {
            $dataSheet = $spreadsheet->getActiveSheet();
        }

        // ==========================================
        // 2. SHEET 2: DATA TIKET MENTAH
        // ==========================================
        $dataSheet->setTitle('Data Tiket');
        $dataSheet->setShowGridLines(true);
        $dataSheet->freezePane('A2');

        // Dynamic column definition with widened widths & group end markers
        $columnsConfig = [
            // Kelompok 1: Identifikasi & Lokasi
            ['header' => 'ID Tiket', 'key' => 'id', 'width' => 16, 'align' => Alignment::HORIZONTAL_CENTER],
            ['header' => 'Tanggal Lapor', 'key' => 'reportedAt', 'width' => 22, 'align' => Alignment::HORIZONTAL_CENTER],
            ['header' => 'Lokasi / Kamar', 'key' => 'location', 'width' => 26, 'align' => Alignment::HORIZONTAL_LEFT, 'isGroupEnd' => true],

            // Kelompok 2: Detail Masalah & Departemen
            ['header' => 'Judul Masalah', 'key' => 'title', 'width' => 42, 'align' => Alignment::HORIZONTAL_LEFT],
            ['header' => 'Kategori', 'key' => 'category', 'width' => 22, 'align' => Alignment::HORIZONTAL_LEFT],
            ['header' => 'Departemen Utama', 'key' => 'department', 'width' => 24, 'align' => Alignment::HORIZONTAL_LEFT],
            ['header' => 'Departemen Terkait (Tags)', 'key' => 'tags', 'width' => 26, 'align' => Alignment::HORIZONTAL_LEFT, 'isGroupEnd' => true],

            // Kelompok 3: Status & Penanggung Jawab
            ['header' => 'Status', 'key' => 'status', 'width' => 16, 'align' => Alignment::HORIZONTAL_CENTER],
            ['header' => 'Prioritas', 'key' => 'priority', 'width' => 15, 'align' => Alignment::HORIZONTAL_CENTER],
            ['header' => 'Pelapor', 'key' => 'reporter', 'width' => 22, 'align' => Alignment::HORIZONTAL_LEFT, 'isGroupEnd' => true],

            // Kelompok 4: Penanganan & Timeline Waktu
            ['header' => 'Diambil Oleh', 'key' => 'taker', 'width' => 22, 'align' => Alignment::HORIZONTAL_LEFT],
            ['header' => 'Waktu Diambil', 'key' => 'takenAt', 'width' => 22, 'align' => Alignment::HORIZONTAL_CENTER],
            ['header' => 'Diselesaikan Oleh', 'key' => 'solver', 'width' => 24, 'align' => Alignment::HORIZONTAL_LEFT],
            ['header' => 'Waktu Selesai', 'key' => 'solvedAt', 'width' => 22, 'align' => Alignment::HORIZONTAL_CENTER],
            ['header' => 'Durasi Pengerjaan', 'key' => 'duration', 'width' => 25, 'align' => Alignment::HORIZONTAL_CENTER, 'isGroupEnd' => true],
        ];

        // Kelompok 5: Catatan Tambahan & Status Arsip
        if ($includeDelayTimeline) {
            $columnsConfig[] = ['header' => 'Alasan Pending / Timeline', 'key' => 'pendingReason', 'width' => 36, 'align' => Alignment::HORIZONTAL_LEFT];
        }
        if ($includeSolutionNotes) {
            $columnsConfig[] = ['header' => 'Catatan Solved', 'key' => 'solvedNotes', 'width' => 38, 'align' => Alignment::HORIZONTAL_LEFT];
        }
        if ($includeAuditTrail) {
            $columnsConfig[] = ['header' => 'Riwayat Perubahan (Audit Trail)', 'key' => 'auditTrail', 'width' => 45, 'align' => Alignment::HORIZONTAL_LEFT];
        }
        $columnsConfig[] = ['header' => 'Status Arsip', 'key' => 'isArchived', 'width' => 16, 'align' => Alignment::HORIZONTAL_CENTER, 'isGroupEnd' => true];

        // Render Header Row
        $dataSheet->getRowDimension(1)->setRowHeight(28);
        foreach ($columnsConfig as $colIdx => $col) {
            $colLetter = $this->getColumnLetter($colIdx + 1);
            $cellCoord = "{$colLetter}1";
            $dataSheet->setCellValue($cellCoord, $col['header']);
            $dataSheet->getColumnDimension($colLetter)->setWidth($col['width']);

            $isGroupEnd = !empty($col['isGroupEnd']);
            $rightBorderStyle = $isGroupEnd ? Border::BORDER_MEDIUM : Border::BORDER_THIN;
            $rightBorderColor = $isGroupEnd ? self::GROUP_BORDER_ARGB : self::HEADER_BORDER_ARGB;

            $dataSheet->getStyle($cellCoord)->applyFromArray([
                'font' => [
                    'name'  => 'Segoe UI',
                    'size'  => 10,
                    'bold'  => true,
                    'color' => ['argb' => self::CHARCOAL_ARGB],
                ],
                'alignment' => [
                    'vertical'   => Alignment::VERTICAL_CENTER,
                    'horizontal' => Alignment::HORIZONTAL_CENTER,
                    'wrapText'   => true,
                ],
                'fill' => [
                    'fillType'   => Fill::FILL_SOLID,
                    'startColor' => ['argb' => self::TELUNAS_GOLD_ARGB],
                ],
                'borders' => [
                    'top'    => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => self::HEADER_BORDER_ARGB]],
                    'bottom' => ['borderStyle' => Border::BORDER_MEDIUM, 'color' => ['argb' => self::CHARCOAL_ARGB]],
                    'left'   => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => self::HEADER_BORDER_ARGB]],
                    'right'  => ['borderStyle' => $rightBorderStyle, 'color' => ['argb' => $rightBorderColor]],
                ],
            ]);
        }

        // Auto-filter
        $lastColLetter = $this->getColumnLetter(count($columnsConfig));
        $dataSheet->setAutoFilter("A1:{$lastColLetter}1");

        // Populate Data Rows
        $rowNumber = 2;
        foreach ($issues as $index => $issue) {
            $isEven = ($index % 2 === 1);
            $defaultFill = $isEven ? self::LINEN_ROW_ARGB : self::WHITE_ROW_ARGB;

            // Formatted values
            $statusKey = strtoupper($issue['status'] ?? 'OPEN');
            $priorityKey = strtoupper($issue['priority'] ?? 'LOW');
            $idStr = preg_replace('/^TEL-/', 'TEL-', $issue['id'] ?? '');

            // Pending reason / timeline text
            $pendingText = '-';
            if ($includeDelayTimeline) {
                if (!empty($issue['pendingTimeline']) && is_array($issue['pendingTimeline'])) {
                    $lines = [];
                    foreach ($issue['pendingTimeline'] as $pItem) {
                        $d = !empty($pItem['date']) ? "[{$pItem['date']}] " : '';
                        $b = !empty($pItem['by']) ? $pItem['by'] : 'Staff';
                        $r = $pItem['reason'] ?? '';
                        $lines[] = "{$d}{$b}: {$r}";
                    }
                    $pendingText = implode(' | ', $lines) ?: '-';
                } elseif (!empty($issue['pendingReason'])) {
                    $pendingText = $issue['pendingReason'];
                    if (!empty($issue['pendingBy'])) {
                        $pendingText .= " (by: {$issue['pendingBy']})";
                    }
                }
            }

            // Solved notes text
            $solvedNotes = '-';
            if ($includeSolutionNotes) {
                $notes = $issue['solutionNote'] ?? $issue['notes'] ?? $issue['note'] ?? null;
                if (!empty($notes)) {
                    $solvedNotes = $notes;
                }
            }

            // Audit trail text
            $auditText = '-';
            if ($includeAuditTrail && !empty($issue['editLogs']) && is_array($issue['editLogs'])) {
                $logLines = [];
                foreach ($issue['editLogs'] as $l) {
                    $t = $l['type'] ?? 'log';
                    $by = $l['by'] ?? 'Staff';
                    $dt = $l['date'] ?? '';
                    $chg = !empty($l['changes']) ? " [{$l['changes']}]" : '';
                    $logLines[] = "• [{$t}] {$dt} ({$by}){$chg}";
                }
                $auditText = implode(' | ', $logLines) ?: '-';
            }

            $tags = !empty($issue['taggedDepartments']) && is_array($issue['taggedDepartments'])
                ? implode(', ', $issue['taggedDepartments'])
                : '-';

            $assignedDept = !empty($issue['assignedDepartments']) && is_array($issue['assignedDepartments'])
                ? implode(', ', $issue['assignedDepartments'])
                : ($issue['department'] ?? '-');

            $rowMap = [
                'id'            => $idStr,
                'reportedAt'    => $issue['reportedAtFormatted'] ?? $issue['reportedAt'] ?? '-',
                'location'      => $issue['location'] ?? '-',
                'title'         => $issue['title'] ?? $issue['description'] ?? '-',
                'category'      => !empty($issue['category']) ? ucwords(str_replace(['_', '-'], ' ', $issue['category'])) : '-',
                'department'    => $assignedDept,
                'tags'          => $tags,
                'status'        => $statusKey,
                'priority'      => $priorityKey,
                'reporter'      => $issue['reporter'] ?? '-',
                'taker'         => $issue['taker'] ?? '-',
                'takenAt'       => $issue['takenAt'] ?? '-',
                'solver'        => $issue['solvedBy'] ?? $issue['solver'] ?? '-',
                'solvedAt'      => $issue['solvedAt'] ?? '-',
                'duration'      => $issue['durationLabel'] ?? '-',
                'pendingReason' => $pendingText,
                'solvedNotes'   => $solvedNotes,
                'auditTrail'    => $auditText,
                'isArchived'    => !empty($issue['isArchived']) ? 'ARCHIVED' : 'ACTIVE',
            ];

            $dataSheet->getRowDimension($rowNumber)->setRowHeight(21);

            foreach ($columnsConfig as $colIdx => $col) {
                $colLetter = $this->getColumnLetter($colIdx + 1);
                $cellCoord = "{$colLetter}{$rowNumber}";
                $val = $rowMap[$col['key']] ?? '-';
                $dataSheet->setCellValue($cellCoord, $val);

                $isGroupEnd = !empty($col['isGroupEnd']);
                $rightBorderStyle = $isGroupEnd ? Border::BORDER_MEDIUM : Border::BORDER_THIN;
                $rightBorderColor = $isGroupEnd ? self::GROUP_BORDER_ARGB : self::CELL_BORDER_ARGB;

                $wrapText = in_array($col['key'], ['title', 'location', 'pendingReason', 'solvedNotes', 'auditTrail']);

                // Base style
                $dataSheet->getStyle($cellCoord)->applyFromArray([
                    'font' => [
                        'name' => 'Segoe UI',
                        'size' => 9,
                    ],
                    'alignment' => [
                        'vertical'   => Alignment::VERTICAL_CENTER,
                        'horizontal' => $col['align'],
                        'wrapText'   => $wrapText,
                    ],
                    'fill' => [
                        'fillType'   => Fill::FILL_SOLID,
                        'startColor' => ['argb' => $defaultFill],
                    ],
                    'borders' => [
                        'top'    => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => self::CELL_BORDER_ARGB]],
                        'bottom' => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => self::CELL_BORDER_ARGB]],
                        'left'   => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => self::CELL_BORDER_ARGB]],
                        'right'  => ['borderStyle' => $rightBorderStyle, 'color' => ['argb' => $rightBorderColor]],
                    ],
                ]);

                // Highlight status chip
                if ($col['key'] === 'status') {
                    $statusColors = [
                        'SOLVED'   => ['fill' => 'FFDCFCE7', 'font' => 'FF166534'], // green
                        'PROGRESS' => ['fill' => 'FFE0F2FE', 'font' => 'FF075985'], // blue
                        'PENDING'  => ['fill' => 'FFFEF3C7', 'font' => 'FF92400E'], // amber
                        'OPEN'     => ['fill' => 'FFFEE2E2', 'font' => 'FF991B1B'], // rose
                        'ARCHIVED' => ['fill' => 'FFF3F4F6', 'font' => 'FF4B5563'], // gray
                    ];
                    $sc = $statusColors[$statusKey] ?? $statusColors['OPEN'];
                    $dataSheet->getStyle($cellCoord)->applyFromArray([
                        'font' => ['bold' => true, 'color' => ['argb' => $sc['font']]],
                        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => $sc['fill']]],
                    ]);
                }

                // Highlight priority text
                if ($col['key'] === 'priority') {
                    if (in_array($priorityKey, ['HIGH', 'CRITICAL', 'SOS'])) {
                        $dataSheet->getStyle($cellCoord)->getFont()->setBold(true)->getColor()->setARGB('FFDC2626');
                    } elseif ($priorityKey === 'MEDIUM') {
                        $dataSheet->getStyle($cellCoord)->getFont()->getColor()->setARGB('FFD97706');
                    }
                }
            }

            $rowNumber++;
        }

        // Write output to memory buffer
        $writer = new Xlsx($spreadsheet);
        ob_start();
        $writer->save('php://output');
        $output = ob_get_clean();

        return (string) $output;
    }

    protected function applySectionHeaderStyle($sheet, string $cellRange): void
    {
        $sheet->getStyle($cellRange)->applyFromArray([
            'font' => [
                'name'  => 'Segoe UI',
                'size'  => 10.5,
                'bold'  => true,
                'color' => ['argb' => self::CHARCOAL_ARGB],
            ],
            'fill' => [
                'fillType'   => Fill::FILL_SOLID,
                'startColor' => ['argb' => self::SECTION_HEADER_ARGB],
            ],
            'alignment' => [
                'vertical'   => Alignment::VERTICAL_CENTER,
                'horizontal' => Alignment::HORIZONTAL_LEFT,
            ],
        ]);
    }

    protected function populateTableRow($sheet, int $rowNum, array $headers, bool $isHeader = false): void
    {
        $sheet->getRowDimension($rowNum)->setRowHeight(22);
        foreach ($headers as $colIdx => $hText) {
            $colLetter = $this->getColumnLetter($colIdx + 1);
            $cellCoord = "{$colLetter}{$rowNum}";
            $sheet->setCellValue($cellCoord, $hText);

            $sheet->getStyle($cellCoord)->applyFromArray([
                'font' => [
                    'name'  => 'Segoe UI',
                    'size'  => 10,
                    'bold'  => true,
                    'color' => ['argb' => self::CHARCOAL_ARGB],
                ],
                'alignment' => [
                    'vertical'   => Alignment::VERTICAL_CENTER,
                    'horizontal' => Alignment::HORIZONTAL_CENTER,
                ],
                'fill' => [
                    'fillType'   => Fill::FILL_SOLID,
                    'startColor' => ['argb' => self::TELUNAS_GOLD_ARGB],
                ],
                'borders' => [
                    'top'    => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => self::HEADER_BORDER_ARGB]],
                    'bottom' => ['borderStyle' => Border::BORDER_MEDIUM, 'color' => ['argb' => self::CHARCOAL_ARGB]],
                    'left'   => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => self::CELL_BORDER_ARGB]],
                    'right'  => ['borderStyle' => Border::BORDER_THIN, 'color' => ['argb' => self::CELL_BORDER_ARGB]],
                ],
            ]);
        }
    }

    protected function applyCrispBorders($sheet, string $range): void
    {
        $sheet->getStyle($range)->getBorders()->applyFromArray([
            'allBorders' => [
                'borderStyle' => Border::BORDER_THIN,
                'color'       => ['argb' => self::CELL_BORDER_ARGB],
            ],
        ]);
    }

    protected function applySolidFill($sheet, string $range, string $argbColor): void
    {
        $sheet->getStyle($range)->getFill()->applyFromArray([
            'fillType'   => Fill::FILL_SOLID,
            'startColor' => ['argb' => $argbColor],
        ]);
    }

    protected function getColumnLetter(int $colIndex): string
    {
        $letter = '';
        while ($colIndex > 0) {
            $remainder = ($colIndex - 1) % 26;
            $letter = chr(65 + $remainder) . $letter;
            $colIndex = (int) (($colIndex - $remainder) / 26);
        }
        return $letter;
    }
}
