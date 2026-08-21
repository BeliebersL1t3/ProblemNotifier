<?php

namespace App\Console\Commands;

use App\Services\GoogleService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SeedDummyIssues extends Command
{
    protected $signature   = 'issues:seed {--sheet= : Target a specific sheet (default all)} {--count=10 : Issues per sheet}';
    protected $description = 'Create 2028 & 2029 sheets (2029 newest) and seed ~10 dashboard-compliant dummy issues per sheet.';

    private static function formatParagraphText(?string $text, int $width = 70): string
    {
        if (empty($text)) return '';
        $trimmed = trim($text);
        if (str_contains($trimmed, "\n")) return $trimmed;
        if (strlen($trimmed) > $width) {
            return wordwrap($trimmed, $width, "\n");
        }
        return $trimmed;
    }

    public function handle(GoogleService $google): int
    {
        $this->info("=== Starting Sheet Setup & Dummy Data Seeding ===");

        // 1. Ensure 2028 and 2029 sheets exist in correct order (2029 newest)
        $existingSheets = $google->listSheets(true);
        $this->info("Currently existing sheets: " . implode(', ', $existingSheets));

        // Create 2028 if not exists
        if (!in_array('2028', $existingSheets)) {
            $this->info("Creating sheet [2028]...");
            try {
                $google->createYearSheet('2028');
                $this->info("  ✓ Sheet [2028] created with headers and formatting.");
            } catch (\Throwable $e) {
                $this->warn("  ! Could not create 2028: " . $e->getMessage());
            }
        }

        // Refresh list
        $existingSheets = $google->listSheets(true);

        // Create 2029 if not exists (created after 2028 so it's placed as the newest)
        if (!in_array('2029', $existingSheets)) {
            $this->info("Creating sheet [2029] (newest sheet)...");
            try {
                $google->createYearSheet('2029');
                $this->info("  ✓ Sheet [2029] created with headers and formatting.");
            } catch (\Throwable $e) {
                $this->warn("  ! Could not create 2029: " . $e->getMessage());
            }
        }

        // Final list of all sheets
        $allSheets = $google->listSheets(true);
        $this->info("All sheets ready: " . implode(', ', $allSheets));

        // Ensure all sheets have Column X1 (Assigned Department) header
        $this->info("Checking Column X1 (Assigned Department) header on all sheets...");
        try {
            $google->ensureAssignedDepartmentHeader();
            $this->info("  ✓ Assigned Department headers verified.");
        } catch (\Throwable $e) {
            $this->warn("  ! Note on header check: " . $e->getMessage());
        }

        $targetSheetOption = $this->option('sheet');
        $sheetsToSeed = $targetSheetOption ? [$targetSheetOption] : $allSheets;

        $deptCodes = [
            'Engineer'        => 'Eng',
            'Tekong'          => 'Tkg',
            'Pest Control'    => 'Pst',
            'Security'        => 'Scy',
            'Fasilitas'       => 'Fas',
            'HK'              => 'HK',
            'F&B'             => 'FnB',
            'Service'         => 'Svc',
            'Bar'             => 'Bar',
            'GR'              => 'GR',
            'Spa'             => 'Spa',
            'TiRek'           => 'TRK',
            'OE'              => 'OE',
            'IT'              => 'IT',
            'Procurement'     => 'PRc',
            'Sales/Marketing' => 'Sls',
            'Reservasi'       => 'Res',
            'Finance'         => 'Fin',
            'Legal'           => 'LGL',
            'HR'              => 'HR',
            'Emergency'       => 'SOS',
        ];

        // Verified existing images in public/uploads/
        $problemImages = [
            'issue-1785991295-problem.jpg',
            'issue-1785992056-problem.jpg',
            'issue-1785992354-problem.jpg',
            'issue-1785992420-problem.jpg',
            'issue-1785993217-problem.jpg',
            'issue-1785995410-problem.jpg',
            'issue-1785996960-problem.jpeg',
            'issue-1785996993-problem.jpeg',
            'issue-1786002058-problem.jpg',
            'issue-1786002251-problem.png',
            'issue-1786002352-problem.jpeg',
            'issue-1786002564-problem.png',
            'issue-1786002998-problem.png',
            'issue-1786004355-problem.jpg',
            'issue-1786006086-problem.png',
            'issue-1786007022-problem.jpg',
            'issue-1786009599-problem.jpg',
            'issue-1786070997-problem.jpg',
            'issue-1786074481-problem.jpg',
            'IT-070826-2-problem.jpg',
            'IT-070826-4-problem.jpg',
            'Scy-070826-3-problem.jpg',
            'TEL-Eng-070826-42-problem.jpg',
            'TEL-IT-070826-43-problem.jpg',
            'Bar-190826-11-problem.png',
            'HK-180826-26-problem.jpg',
            'IT-190826-2-problem.png',
        ];

        $proofImages = [
            '12-proof.jpg',
            '13-proof.jpg',
            '14-proof.jpg',
            '35-proof.jpg',
            '4-proof.jpg',
            'Bar-190826-11-proof.png',
            'DEMO-1040B818-proof.jpg',
            'DEMO-15A71701-proof.png',
            'DEMO-54ABAEB7-proof.png',
            'DEMO-73F967F2-proof.jpg',
            'DEMO-AC865F55-proof.png',
            'DEMO-D524B15C-proof.png',
            'DEMO-D551A3A7-proof.png',
            'DEMO-D5C484CA-proof.png',
            'Fin-180826-27-proof.png',
            'FnB-190826-28-proof.jpg',
            'HK-180826-26-proof.png',
            'IT-190826-3-proof.png',
            'SOS-190826-10-proof.jpg',
            'SOS-190826-5-proof.jpg',
            'issue-1785979223-proof.png',
        ];

        $pendingImages = [
            'issue-1786004355-pending-1786085878.jpg',
            'issue-1786009599-pending-1786077810.jpg',
            'issue-1786077923-pending-1786077960.jpg',
            'issue-1786077923-pending-1786077999.jpg',
            'TEL-IT-070826-43-pending-1786085927.jpg',
            'Bar-190826-11-pending-1787208356.jpg',
            '4-pending-1787123058.jpg',
        ];

        // Rich issue catalog template (10 per sheet, varied per year)
        $issueTemplates = [
            // 1. Broken Equipment (open)
            [
                'title'       => 'Air Conditioning Failure in Overwater Villa',
                'description' => 'The main AC inverter unit stopped cooling. Temperature inside villa is rising and the outdoor compressor fan is not spinning.',
                'location'    => 'TPI - Overwater Villa 105',
                'category'    => 'broken',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'HK',
                'assigned'    => 'Engineer',
                'tagged'      => 'GR, HK',
                'reporter'    => 'Siti Rahma (HK Supervisor)',
                'image'       => 'issue-1785991295-problem.jpg',
            ],
            // 2. Plumbing (progress)
            [
                'title'       => 'Fresh Water Leak Under Kitchen Sink',
                'description' => 'A pressurized PVC pipe joint under the dishwashing station has cracked, leaking water onto the preparation area floor.',
                'location'    => 'TBR - Main Dining Clubhouse',
                'category'    => 'plumbing',
                'status'      => 'progress',
                'priority'    => 'medium',
                'department'  => 'F&B',
                'assigned'    => 'Engineer, Fasilitas',
                'tagged'      => 'OE',
                'reporter'    => 'Chef Ricky',
                'image'       => 'issue-1785992354-problem.jpg',
                'taker'       => 'Budi Santoso (Eng)',
            ],
            // 3. Electrical (solved)
            [
                'title'       => 'Pathway Solar Light Power Cut',
                'description' => 'Three low-voltage solar pathway lights along the mangrove boardwalk failed to illuminate after sunset.',
                'location'    => 'TPI - Activity Jetty',
                'category'    => 'electrical',
                'status'      => 'solved',
                'priority'    => 'low',
                'department'  => 'Security',
                'assigned'    => 'Engineer',
                'tagged'      => 'Fasilitas',
                'reporter'    => 'Pak Joko (Security)',
                'image'       => 'IT-070826-2-problem.jpg',
                'taker'       => 'Ahmad Fauzi',
                'solver'      => 'Ahmad Fauzi',
                'fixDesc'     => 'Replaced depleted 12V LiFePO4 battery pack and cleaned photovoltaic solar panel surface. Illumination verified normal.',
                'proofImage'  => '12-proof.jpg',
                'duration'    => 'Solved in 45 minutes',
            ],
            // 4. Structural / Building (pending)
            [
                'title'       => 'Warped Teak Deck Planks Near Pool',
                'description' => 'Several outdoor deck timber planks have warped from weather exposure, posing a minor tripping hazard for barefoot guests.',
                'location'    => 'TBR - Infinity Pool & Bar Deck',
                'category'    => 'structural',
                'status'      => 'pending',
                'priority'    => 'medium',
                'department'  => 'GR',
                'assigned'    => 'Fasilitas',
                'tagged'      => 'Procurement, GR',
                'reporter'    => 'Anto (Pool Lead)',
                'image'       => 'issue-1785992420-problem.jpg',
                'taker'       => 'Fasilitas Team',
                'pendingReason' => 'Awaiting arrival of treated ironwood replacement planks on next scheduled cargo boat from Batam.',
                'pendingBy'   => 'Procurement Dept',
                'pendingImage' => 'issue-1786004355-pending-1786085878.jpg',
            ],
            // 5. Pest & Hygiene (progress)
            [
                'title'       => 'Hornet Nest Removal Behind Villa Balcony',
                'description' => 'A growing hornet nest was spotted under the roof overhang directly above the private balcony seating area.',
                'location'    => 'TPI - Overwater Villa 101',
                'category'    => 'pest-hygiene',
                'status'      => 'progress',
                'priority'    => 'high',
                'department'  => 'HK',
                'assigned'    => 'Pest Control',
                'tagged'      => 'GR, HK',
                'reporter'    => 'Dewi (HK Attendant)',
                'image'       => 'issue-1785993217-problem.jpg',
                'taker'       => 'Pest Control Team',
            ],
            // 6. IT & Technology (solved)
            [
                'title'       => 'Point of Sale Receipt Printer Offline',
                'description' => 'The thermal receipt printer at the beach bar counter disconnected from the local network and stopped printing guest bills.',
                'location'    => 'TBR - Beach Bar Counter',
                'category'    => 'it-technology',
                'status'      => 'solved',
                'priority'    => 'medium',
                'department'  => 'Bar',
                'assigned'    => 'IT',
                'tagged'      => 'F&B, Finance',
                'reporter'    => 'Lia (Bar Manager)',
                'image'       => 'issue-1785995410-problem.jpg',
                'taker'       => 'Reza (IT Support)',
                'solver'      => 'Reza (IT Support)',
                'fixDesc'     => 'Assigned static IP reservation on DHCP server and replaced damaged Cat6 RJ45 patch cable behind counter.',
                'proofImage'  => 'issue-1786002352-problem.jpeg',
                'duration'    => 'Solved in 30 minutes',
            ],
            // 7. Marine & Outdoor (open)
            [
                'title'       => 'Speedboat Mooring Cleat Loose',
                'description' => 'The heavy-duty stainless mooring bollard on the guest arrival jetty pontoon is wobbling under boat docking tension.',
                'location'    => 'TPI - Main Arrival Jetty',
                'category'    => 'marine-outdoor',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'Tekong',
                'assigned'    => 'Engineer, Tekong',
                'tagged'      => 'Security',
                'reporter'    => 'Captain Arif',
                'image'       => 'issue-1786002564-problem.png',
            ],
            // 8. Safety Hazard / Critical (open or progress with critical deadline)
            [
                'title'       => '🚨 Saltwater Ingress at Main Substation Breaker',
                'description' => 'Heavy sea spray has reached the secondary junction box housing the beachfront distribution breaker. Sparks reported.',
                'location'    => 'TBR - Solar Farm Inverter Room',
                'category'    => 'safety-hazard',
                'status'      => 'progress',
                'priority'    => 'critical',
                'department'  => 'OE',
                'assigned'    => 'Engineer',
                'tagged'      => 'Security, OE, Fasilitas',
                'reporter'    => 'Dimas (Chief Eng)',
                'image'       => 'TEL-Eng-070826-42-problem.jpg',
                'taker'       => 'Dimas Pratama',
                'isCritical'  => true,
            ],
            // 9. Guest Issues / Critical (solved)
            [
                'title'       => 'Emergency Medical Oxygen Tank Low',
                'description' => 'First responder oxygen cylinder regulator gauge reads below safety threshold. Needs immediate replacement from backup storage.',
                'location'    => 'TPI - Spa Sanctuary Room 2',
                'category'    => 'guest-issues',
                'status'      => 'solved',
                'priority'    => 'critical',
                'department'  => 'Spa',
                'assigned'    => 'ALL',
                'tagged'      => 'ALL',
                'reporter'    => 'Nurse Maya',
                'image'       => 'SOS-190826-9-problem.jpg',
                'taker'       => 'Security & Safety Lead',
                'solver'      => 'Pak Hendra (Safety)',
                'fixDesc'     => 'Swapped depleted oxygen tank with fresh medical-grade tank from central clinic inventory. Pressure tested at 2000 PSI.',
                'proofImage'  => 'SOS-190826-10-proof.jpg',
                'duration'    => 'Solved in 15 minutes',
                'isCritical'  => true,
            ],
            // 10. Other (pending)
            [
                'title'       => 'Luggage Transport Cart Hydraulic Wheel Jam',
                'description' => 'The heavy luggage transport trolley wheel bearing has seized due to salt water exposure during high tide transfers.',
                'location'    => 'Kantor - Central Store Warehouse',
                'category'    => 'other',
                'status'      => 'pending',
                'priority'    => 'low',
                'department'  => 'GR',
                'assigned'    => 'Engineer',
                'tagged'      => 'GR, Procurement',
                'reporter'    => 'Wawan (Porter Lead)',
                'image'       => 'issue-1786002058-problem.jpg',
                'taker'       => 'Workshop Tech',
                'pendingReason' => 'New marine-grade sealed bearings ordered. Expected on Tuesday supply boat.',
                'pendingBy'   => 'Procurement Team',
                'pendingImage' => 'Bar-190826-11-pending-1787208356.jpg',
            ],
        ];

        foreach ($sheetsToSeed as $sheetName) {
            $this->newLine();
            $this->info(">>> Processing Sheet [{$sheetName}] <<<");
            $google->setSheet($sheetName);

            // Determine year base for timestamps
            $yearNum = 2026;
            if (preg_match('/(\d{4})/', $sheetName, $m)) {
                $yearNum = (int)$m[1];
            }

            $isNewestSheet = ($sheetName === end($allSheets));

            // Fetch existing rows to calculate starting sequential ID
            $existingRows = $google->getRows(true);
            $existingCount = count($existingRows);
            $this->info("  Found {$existingCount} existing issues in [{$sheetName}].");

            $newRows = [];
            $rowColors = [];

            foreach ($issueTemplates as $idx => $t) {
                $seqIndex = $existingCount + $idx + 1;
                $dept = $t['department'];
                $deptCode = $deptCodes[$dept] ?? strtoupper(substr($dept, 0, 3));

                // Date simulation
                $month = rand(1, 12);
                $day = rand(1, 28);
                $hour = rand(8, 18);
                $minute = rand(0, 59);

                if ($isNewestSheet) {
                    // For the newest sheet (2029 / current), use recent/today dates
                    $submittedAtCarbon = Carbon::now()->subDays(rand(0, 3))->setHour($hour)->setMinute($minute);
                } else {
                    $submittedAtCarbon = Carbon::create($yearNum, $month, $day, $hour, $minute, 0, 'Asia/Jakarta');
                }

                $dmy = $submittedAtCarbon->format('dmy');
                $issueId = "{$deptCode}-{$dmy}-{$seqIndex}";

                $submittedAt = $submittedAtCarbon->toIso8601String();

                $taker = $t['taker'] ?? '';
                $takenAt = '';
                if (!empty($taker)) {
                    $takenAt = $submittedAtCarbon->copy()->addMinutes(rand(15, 60))->toIso8601String();
                }

                $solver = $t['solver'] ?? '';
                $solvedAt = '';
                $duration = $t['duration'] ?? '';
                $fixDesc = $t['fixDesc'] ?? '';
                $proofImg = $t['proofImage'] ?? '';

                if ($t['status'] === 'solved') {
                    $solvedAtCarbon = !empty($takenAt)
                        ? Carbon::parse($takenAt)->addMinutes(rand(20, 180))
                        : $submittedAtCarbon->copy()->addMinutes(rand(30, 240));
                    $solvedAt = $solvedAtCarbon->toIso8601String();
                    if (empty($duration)) {
                        $duration = 'Solved in ' . rand(1, 3) . ' hours';
                    }
                }

                // CRITICAL TIMER / DEADLINE HANDLING:
                // Rule: Strictly numeric millisecond timestamp string for critical issues. Empty string for non-critical issues.
                $deadline = '';
                if (!empty($t['isCritical']) || $t['priority'] === 'critical') {
                    if ($isNewestSheet) {
                        if ($t['status'] === 'open') {
                            // Active critical countdown: 45 minutes from now
                            $deadline = (string)(Carbon::now()->addMinutes(45)->timestamp * 1000);
                        } elseif ($t['status'] === 'progress') {
                            // Overdue critical issue: 20 minutes ago (triggers critical overdue badge & banner)
                            $deadline = (string)(Carbon::now()->subMinutes(20)->timestamp * 1000);
                        } else {
                            // Solved critical issue
                            $deadline = (string)($submittedAtCarbon->copy()->addMinutes(30)->timestamp * 1000);
                        }
                    } else {
                        // Historical sheets: deadline in ms relative to submission
                        $deadline = (string)($submittedAtCarbon->copy()->addMinutes(60)->timestamp * 1000);
                    }
                }

                // PENDING TIMELINE (JSON array for Column S)
                $pendingJson = '';
                $pendingBy = $t['pendingBy'] ?? '';
                $pendingImg = $t['pendingImage'] ?? '';
                if ($t['status'] === 'pending' && !empty($t['pendingReason'])) {
                    $pendingDate = $submittedAtCarbon->copy()->addHours(2)->format('M d, H:i');
                    $pendingJson = json_encode([
                        [
                            'date'   => $pendingDate,
                            'by'     => $pendingBy ?: 'Staff',
                            'reason' => $t['pendingReason'],
                            'image'  => $pendingImg,
                        ]
                    ]);
                }

                $descFormatted = self::formatParagraphText($t['description']);
                $fixFormatted = self::formatParagraphText($fixDesc);

                $row = [
                    $issueId,                        // A (0) - ID
                    $t['title'],                     // B (1) - Title
                    $descFormatted,                  // C (2) - Description
                    $t['location'],                  // D (3) - Location
                    $t['category'],                  // E (4) - Category
                    $t['status'],                    // F (5) - Status
                    $t['reporter'],                  // G (6) - Reporter
                    $submittedAt,                    // H (7) - Submitted At (ISO8601)
                    $t['image'] ?? '',               // I (8) - Image URL (filename)
                    $taker,                          // J (9) - Taker
                    $takenAt,                        // K (10) - Taken At (ISO8601)
                    $solver,                         // L (11) - Solver
                    $solvedAt,                       // M (12) - Solved At (ISO8601)
                    $fixFormatted,                   // N (13) - Fix Description
                    $proofImg,                       // O (14) - Proof Image URL (filename)
                    $duration,                       // P (15) - Duration Label
                    $t['priority'],                  // Q (16) - Priority
                    $deadline,                       // R (17) - Deadline (Numeric MS timestamp string for critical, '' for others)
                    $pendingJson,                    // S (18) - Pending Reason (JSON timeline)
                    $pendingBy,                      // T (19) - Pending By
                    $pendingImg,                     // U (20) - Pending Image URL
                    $t['tagged'] ?? '',              // V (21) - Tagged Departments
                    $dept,                           // W (22) - Origin Department
                    $t['assigned'] ?? $dept,         // X (23) - Assigned Department
                ];

                $newRows[] = $row;
                $targetRowNumber = $existingCount + count($newRows) + 1; // +1 because row 1 is header
                $rowColors[$targetRowNumber] = $t['category'];
            }

            // Append all rows in a single batch call
            $this->info("  Appending " . count($newRows) . " dummy issues to [{$sheetName}]...");
            try {
                $startIdx = $google->appendRows($newRows);
                $this->info("  ✓ Successfully appended rows starting at row index {$startIdx}.");
            } catch (\Throwable $e) {
                $this->error("  ✗ Failed to append rows to [{$sheetName}]: " . $e->getMessage());
                continue;
            }

            // Batch color rows by category
            $this->info("  Applying pastel category colors to rows in [{$sheetName}]...");
            try {
                $google->batchColorRows($rowColors);
                $this->info("  ✓ Category colors applied.");
            } catch (\Throwable $e) {
                $this->warn("  ! Note on row coloring: " . $e->getMessage());
            }

            // Apply sheet formatting rules (text wrap, bold headers, Column F status conditional formatting)
            $this->info("  Applying status conditional formatting to Column F in [{$sheetName}]...");
            try {
                $google->setupActiveSheetFormatting($sheetName);
                $this->info("  ✓ Sheet formatting and status rules configured.");
            } catch (\Throwable $e) {
                $this->warn("  ! Note on sheet formatting: " . $e->getMessage());
            }

            $google->clearCache($sheetName);
            $this->info("  ✓ Finished seeding [{$sheetName}].");
            
            // Brief sleep between sheets to remain well within Google API quota limits
            sleep(1);
        }

        $google->clearCache();
        $this->newLine();
        $this->info("=== All Sheets Processed Successfully! ===");
        $this->info("Newest sheet is: " . end($allSheets));

        return Command::SUCCESS;
    }
}
