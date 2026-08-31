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

        // 1. Ensure 2026, 2027, and 2028 sheets exist in chronological order
        $existingSheets = $google->listSheets(true);
        $this->info("Currently existing sheets: " . implode(', ', $existingSheets));

        $targetYears = ['2026', '2027', '2028'];
        foreach ($targetYears as $year) {
            $existingSheets = $google->listSheets(true);
            if (!in_array($year, $existingSheets)) {
                $this->info("Creating sheet [{$year}]...");
                try {
                    $google->createYearSheet($year);
                    $this->info("  ✓ Sheet [{$year}] created with headers and formatting.");
                } catch (\Throwable $e) {
                    $this->warn("  ! Could not create {$year}: " . $e->getMessage());
                }
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

        // Comprehensive 24-issue matrix covering ALL 12 departments in Origin, Assigned, and Tagged roles
        $issueTemplates = [
            // --- 1. ENGINEER ---
            [
                'title'       => 'Air Conditioning Inverter Failure in Overwater Villa',
                'description' => 'The main AC inverter unit stopped cooling. Temperature inside villa is rising and outdoor compressor fan is not spinning.',
                'location'    => 'TPI - Overwater Villa 105',
                'category'    => 'broken',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'HK',
                'assigned'    => 'Engineer',
                'tagged'      => 'GR, Procurement',
                'reporter'    => 'Siti Rahma (HK)',
                'image'       => 'issue-1785991295-problem.jpg',
            ],
            [
                'title'       => '🚨 Saltwater Ingress at Main Substation Breaker',
                'description' => 'Heavy sea spray reached the secondary junction box housing the beachfront distribution breaker. Sparks reported.',
                'location'    => 'TBR - Solar Farm Inverter Room',
                'category'    => 'safety-hazard',
                'status'      => 'progress',
                'priority'    => 'critical',
                'department'  => 'OE',
                'assigned'    => 'Engineer',
                'tagged'      => 'Fasilitas, HR',
                'reporter'    => 'Bambang OE',
                'image'       => 'TEL-Eng-070826-42-problem.jpg',
                'taker'       => 'Dimas Pratama',
                'isCritical'  => true,
            ],
            [
                'title'       => 'Powerhouse Generator Fuel Filter Replacement',
                'description' => 'Primary diesel generator fuel flow sensor triggered yellow warning. Filter canister replaced and line purged.',
                'location'    => 'TBR - Powerhouse Generator 2',
                'category'    => 'electrical',
                'status'      => 'solved',
                'priority'    => 'medium',
                'department'  => 'Engineer',
                'assigned'    => 'Fasilitas',
                'tagged'      => 'OE, Procurement',
                'reporter'    => 'Dimas Pratama',
                'image'       => 'TEL-Eng-070826-42-problem.jpg',
                'taker'       => 'Anto (Fasilitas)',
                'solver'      => 'Anto (Fasilitas)',
                'fixDesc'     => 'Replaced 10-micron fuel filter element, primed high pressure pump, and tested at full 80kW load.',
                'proofImage'  => '12-proof.jpg',
                'duration'    => 'Solved in 45 minutes',
            ],

            // --- 2. FASILITAS ---
            [
                'title'       => 'Arrival Jetty Pontoon Timber Plank Loose',
                'description' => 'Two heavy ironwood planks on the floating pontoon have popped up due to wave action, creating a safety hazard for guests disembarking.',
                'location'    => 'TPI - Main Arrival Jetty',
                'category'    => 'structural',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'GR',
                'assigned'    => 'Fasilitas',
                'tagged'      => 'HR, Engineer',
                'reporter'    => 'Wawan (GR)',
                'image'       => 'issue-1786002564-problem.png',
            ],
            [
                'title'       => 'Warped Teak Deck Planks Near Infinity Pool',
                'description' => 'Several outdoor deck timber planks have warped from weather exposure, posing a tripping hazard for barefoot guests.',
                'location'    => 'TBR - Infinity Pool & Bar Deck',
                'category'    => 'structural',
                'status'      => 'pending',
                'priority'    => 'medium',
                'department'  => 'Fasilitas',
                'assigned'    => 'Procurement',
                'tagged'      => 'GR, OE',
                'reporter'    => 'Anto (Fasilitas)',
                'image'       => 'issue-1785992420-problem.jpg',
                'taker'       => 'Budi Purchasing',
                'pendingReason' => 'Awaiting arrival of treated ironwood replacement planks on scheduled cargo boat from Batam.',
                'pendingBy'   => 'Budi Purchasing',
                'pendingImage' => 'issue-1786004355-pending-1786085878.jpg',
            ],

            // --- 3. HK (HOUSEKEEPING) ---
            [
                'title'       => 'Bathroom Mixer Tap Leak in Villa 102',
                'description' => 'Hot water mixer cartridge is dripping continuously under the vanity counter, soaking the amenity shelf.',
                'location'    => 'TPI - Villa 102 Bathroom',
                'category'    => 'plumbing',
                'status'      => 'open',
                'priority'    => 'medium',
                'department'  => 'HK',
                'assigned'    => 'Engineer',
                'tagged'      => 'GR, Finance',
                'reporter'    => 'Dewi Lestari (HK)',
                'image'       => 'issue-1785992354-problem.jpg',
            ],
            [
                'title'       => 'Hornet Nest Removal Behind Balcony Overhang',
                'description' => 'A growing hornet nest was spotted under the roof overhang directly above the guest balcony lounge area.',
                'location'    => 'TPI - Overwater Villa 101',
                'category'    => 'pest-hygiene',
                'status'      => 'solved',
                'priority'    => 'high',
                'department'  => 'GR',
                'assigned'    => 'HK',
                'tagged'      => 'OE, Fasilitas',
                'reporter'    => 'Nadia Safitri (GR)',
                'image'       => 'issue-1785993217-problem.jpg',
                'taker'       => 'Wahyu Hidayat (Pest Control)',
                'solver'      => 'Wahyu Hidayat (Pest Control)',
                'fixDesc'     => 'Safely removed nest using organic repellent at dusk and treated surrounding eaves to prevent recolonization.',
                'proofImage'  => 'HK-180826-26-proof.png',
                'duration'    => 'Solved in 1 hour',
            ],

            // --- 4. F&B ---
            [
                'title'       => '🚨 Walk-In Chiller Temperature Sensor Alarm',
                'description' => 'Main kitchen walk-in dairy cold room temperature jumped from 3°C to 11°C. Condenser fan cycling irregularly.',
                'location'    => 'TBR - Main Kitchen Cold Storage',
                'category'    => 'broken',
                'status'      => 'progress',
                'priority'    => 'critical',
                'department'  => 'F&B',
                'assigned'    => 'Engineer',
                'tagged'      => 'Procurement, OE',
                'reporter'    => 'Chef Ricky',
                'image'       => 'issue-1785991295-problem.jpg',
                'taker'       => 'Dimas Pratama',
                'isCritical'  => true,
            ],
            [
                'title'       => 'Grease Trap Cleaning & Chemical Bio-Enzyme Treatment',
                'description' => 'Quarterly maintenance of main kitchen wastewater grease separator. Sludge pumped out and microbial blocks replenished.',
                'location'    => 'TBR - Main Kitchen Utility Yard',
                'category'    => 'pest-hygiene',
                'status'      => 'solved',
                'priority'    => 'medium',
                'department'  => 'OE',
                'assigned'    => 'F&B',
                'tagged'      => 'HK, Fasilitas',
                'reporter'    => 'Bambang OE',
                'image'       => 'issue-1785992354-problem.jpg',
                'taker'       => 'Chef Ricky',
                'solver'      => 'Chef Ricky',
                'fixDesc'     => 'Fully evacuated 500L trap, cleaned baffles with high-pressure washer, and added biological enzyme treatment.',
                'proofImage'  => 'FnB-190826-28-proof.jpg',
                'duration'    => 'Solved in 2 hours',
            ],

            // --- 5. GR (GUEST RELATIONS) ---
            [
                'title'       => 'Sea Kayak Paddle Lock Mechanism Damaged',
                'description' => 'Two carbon-fiber sea kayak adjustable paddles have jammed locking pins from fine sand accumulation.',
                'location'    => 'TPI - Marine Activity Center',
                'category'    => 'marine-outdoor',
                'status'      => 'pending',
                'priority'    => 'low',
                'department'  => 'GR',
                'assigned'    => 'Procurement',
                'tagged'      => 'Fasilitas, Sales/Marketing',
                'reporter'    => 'Wawan (GR)',
                'image'       => 'issue-1786002058-problem.jpg',
                'taker'       => 'Ratna Dewi (Procurement)',
                'pendingReason' => 'Ordered 4 replacement quick-release locking collar assemblies from Singapore distributor.',
                'pendingBy'   => 'Ratna Dewi (Procurement)',
                'pendingImage' => 'Bar-190826-11-pending-1787208356.jpg',
            ],
            [
                'title'       => 'Sunset Lounge Bluetooth Audio Streamer Dropping',
                'description' => 'The background music receiver in the guest arrival lounge experiences intermittent audio stuttering during evening cocktail hour.',
                'location'    => 'TBR - Sunset Lounge',
                'category'    => 'it-technology',
                'status'      => 'solved',
                'priority'    => 'low',
                'department'  => 'Sales/Marketing',
                'assigned'    => 'GR',
                'tagged'      => 'IT, F&B',
                'reporter'    => 'Maya Marketing',
                'image'       => 'issue-1785995410-problem.jpg',
                'taker'       => 'Wawan (GR)',
                'solver'      => 'Wawan (GR)',
                'fixDesc'     => 'Repositioned receiver antenna, switched to 5GHz dedicated audio stream, and re-paired media tablet.',
                'proofImage'  => 'Bar-190826-11-proof.png',
                'duration'    => 'Solved in 35 minutes',
            ],

            // --- 6. HR ---
            [
                'title'       => 'Staff Dormitory Block C Solar Water Heater Cold',
                'description' => 'Roof solar heating collector circulating pump stopped running, causing water in Block C dorms to remain cold.',
                'location'    => 'Kantor - Staff Dormitory Block C',
                'category'    => 'plumbing',
                'status'      => 'open',
                'priority'    => 'medium',
                'department'  => 'HR',
                'assigned'    => 'Engineer',
                'tagged'      => 'Fasilitas, OE',
                'reporter'    => 'Siti HR',
                'image'       => 'issue-1785992056-problem.jpg',
            ],
            [
                'title'       => 'Staff Emergency Evacuation Assembly Signage Replaced',
                'description' => 'Weathered evacuation map board near staff canteen replaced with new luminescent UV-resistant graphic signage.',
                'location'    => 'Kantor - Central Staff Canteen',
                'category'    => 'structural',
                'status'      => 'solved',
                'priority'    => 'low',
                'department'  => 'HR',
                'assigned'    => 'Fasilitas',
                'tagged'      => 'OE, Security',
                'reporter'    => 'Siti HR',
                'image'       => 'issue-1786002251-problem.png',
                'taker'       => 'Dedi Kusuma (Fasilitas)',
                'solver'      => 'Dedi Kusuma (Fasilitas)',
                'fixDesc'     => 'Mounted reinforced acrylic glow-in-the-dark assembly area sign with stainless anti-corrosion brackets.',
                'proofImage'  => 'DEMO-1040B818-proof.jpg',
                'duration'    => 'Solved in 1 hour',
            ],

            // --- 7. IT ---
            [
                'title'       => 'Point of Sale Receipt Printer Offline at Beach Bar',
                'description' => 'The thermal receipt printer at the beach bar counter disconnected from local network and stopped printing guest tabs.',
                'location'    => 'TBR - Beach Bar Counter',
                'category'    => 'it-technology',
                'status'      => 'solved',
                'priority'    => 'medium',
                'department'  => 'F&B',
                'assigned'    => 'IT',
                'tagged'      => 'Finance, GR',
                'reporter'    => 'Chef Ricky',
                'image'       => 'issue-1785995410-problem.jpg',
                'taker'       => 'Dwi IT',
                'solver'      => 'Dwi IT',
                'fixDesc'     => 'Assigned static IP reservation on DHCP router and replaced damaged Cat6 RJ45 patch cable behind bar register.',
                'proofImage'  => 'IT-190826-3-proof.png',
                'duration'    => 'Solved in 30 minutes',
            ],
            [
                'title'       => 'Inter-Island Fiber Optic Link Flapping During High Tide',
                'description' => 'Fiber media converter between TBR server room and TPI distribution hub reporting packet loss during tidal surges.',
                'location'    => 'TPI - Server Substation',
                'category'    => 'it-technology',
                'status'      => 'progress',
                'priority'    => 'high',
                'department'  => 'IT',
                'assigned'    => 'Engineer',
                'tagged'      => 'OE, Reservasi',
                'reporter'    => 'Dwi IT',
                'image'       => 'IT-190826-2-problem.png',
                'taker'       => 'Budi Santoso (Eng)',
            ],

            // --- 8. OE (OPERATIONAL EXCELLENCE) ---
            [
                'title'       => 'Solar Photovoltaic Inverter Telemetry Modbus Fault',
                'description' => 'Inverter #4 communication gateway is not sending daily kWh generation telemetry to cloud energy dashboard.',
                'location'    => 'TBR - Solar Farm Inverter Shed',
                'category'    => 'electrical',
                'status'      => 'open',
                'priority'    => 'medium',
                'department'  => 'OE',
                'assigned'    => 'IT',
                'tagged'      => 'Engineer, Finance',
                'reporter'    => 'Bambang OE',
                'image'       => 'TEL-IT-070826-43-problem.jpg',
            ],
            [
                'title'       => 'Rainwater Harvesting Dual Filter Replacement',
                'description' => 'Sediment pre-filters on the 50,000L rainwater catchment system reached 2.5 bar differential pressure limit.',
                'location'    => 'Kantor - Rainwater Filtration Bay',
                'category'    => 'plumbing',
                'status'      => 'solved',
                'priority'    => 'medium',
                'department'  => 'OE',
                'assigned'    => 'Fasilitas',
                'tagged'      => 'Engineer, HK',
                'reporter'    => 'Bambang OE',
                'image'       => 'issue-1785992056-problem.jpg',
                'taker'       => 'Anto (Fasilitas)',
                'solver'      => 'Anto (Fasilitas)',
                'fixDesc'     => 'Flushed dual sand filters, replaced 5-micron spun PP cartridge, and verified effluent turbidity < 0.5 NTU.',
                'proofImage'  => 'DEMO-54ABAEB7-proof.png',
                'duration'    => 'Solved in 1.5 hours',
            ],

            // --- 9. PROCUREMENT ---
            [
                'title'       => 'Urgent Marine Outboard Engine Gasket Kit Delivery',
                'description' => 'Customs clearance completed for 250HP Suzuki outboard top-end gasket overhaul kits. Needs transport boat pickup.',
                'location'    => 'Kantor - Procurement Staging Pier',
                'category'    => 'marine-outdoor',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'Procurement',
                'assigned'    => 'Fasilitas',
                'tagged'      => 'Engineer, HR',
                'reporter'    => 'Ratna Dewi',
                'image'       => 'issue-1786002564-problem.png',
            ],
            [
                'title'       => 'New Microfiber Villa Linen Consignment Inspection',
                'description' => 'Received 200 sets of king bedsheets and bath sheets. Barcode tags logged and verified against master purchase invoice.',
                'location'    => 'Kantor - Central Store Warehouse',
                'category'    => 'other',
                'status'      => 'solved',
                'priority'    => 'low',
                'department'  => 'HK',
                'assigned'    => 'Procurement',
                'tagged'      => 'Finance, GR',
                'reporter'    => 'Siti Rahma (HK)',
                'image'       => 'issue-1786002058-problem.jpg',
                'taker'       => 'Budi Purchasing',
                'solver'      => 'Budi Purchasing',
                'fixDesc'     => 'Completed 100% QA check on thread count and colorfastness. Handed over stock to Housekeeping linen room.',
                'proofImage'  => 'Fin-180826-27-proof.png',
                'duration'    => 'Solved in 2 hours',
            ],

            // --- 10. SALES / MARKETING ---
            [
                'title'       => 'Lobby Photography Showcase Acrylic Frame Cracked',
                'description' => 'Illuminated promotional display frame near reception desk cracked during heavy luggage handling.',
                'location'    => 'TBR - Reception Lobby',
                'category'    => 'structural',
                'status'      => 'open',
                'priority'    => 'low',
                'department'  => 'Sales/Marketing',
                'assigned'    => 'Fasilitas',
                'tagged'      => 'GR, Procurement',
                'reporter'    => 'Maya Marketing',
                'image'       => 'issue-1786002251-problem.png',
            ],
            [
                'title'       => 'High-Season Resort Drone Video Landing Pad Marking',
                'description' => 'Refreshed high-visibility landing circle paint on activity jetty for marketing content creation team.',
                'location'    => 'TPI - Helipad / Drone Deck',
                'category'    => 'structural',
                'status'      => 'solved',
                'priority'    => 'low',
                'department'  => 'Sales/Marketing',
                'assigned'    => 'Fasilitas',
                'tagged'      => 'OE, GR',
                'reporter'    => 'Maya Marketing',
                'image'       => 'DEMO-73F967F2-proof.jpg',
                'taker'       => 'Dedi Kusuma (Fasilitas)',
                'solver'      => 'Dedi Kusuma (Fasilitas)',
                'fixDesc'     => 'Applied 2 coats of non-skid polyurethane safety yellow marking with reflective micro-beads.',
                'proofImage'  => 'DEMO-73F967F2-proof.jpg',
                'duration'    => 'Solved in 1 hour',
            ],

            // --- 11. RESERVASI ---
            [
                'title'       => 'Direct Booking VoIP Hotline Static Noise Interference',
                'description' => 'Reservations office main incoming landline SIP phone channel experiencing loud hum and background static.',
                'location'    => 'Kantor - Reservations Desk',
                'category'    => 'it-technology',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'Reservasi',
                'assigned'    => 'IT',
                'tagged'      => 'Sales/Marketing, GR',
                'reporter'    => 'Rina Reservasi',
                'image'       => 'TEL-IT-070826-43-problem.jpg',
            ],
            [
                'title'       => 'Speedboat Guest Transfer Schedule Sync Discrepancy',
                'description' => 'Automated guest ferry transfer manifest timing discrepancies resolved between booking CRM and marina operations.',
                'location'    => 'Kantor - Reservations Office',
                'category'    => 'it-technology',
                'status'      => 'solved',
                'priority'    => 'medium',
                'department'  => 'Reservasi',
                'assigned'    => 'IT',
                'tagged'      => 'GR, HR',
                'reporter'    => 'Rina Reservasi',
                'image'       => 'issue-1785995410-problem.jpg',
                'taker'       => 'Dwi IT',
                'solver'      => 'Dwi IT',
                'fixDesc'     => 'Re-indexed webhook listener between booking engine and boat departure roster. Manifests now auto-sync in real time.',
                'proofImage'  => 'IT-190826-3-proof.png',
                'duration'    => 'Solved in 25 minutes',
            ],

            // --- 12. FINANCE ---
            [
                'title'       => 'Cash Register Heavy Steel Drawer Lock Jammed',
                'description' => 'Key tumbler on the accounting petty cash safety drawer seized after exposure to humid sea air.',
                'location'    => 'Kantor - Accounting Office',
                'category'    => 'broken',
                'status'      => 'open',
                'priority'    => 'medium',
                'department'  => 'Finance',
                'assigned'    => 'Engineer',
                'tagged'      => 'Procurement, HR',
                'reporter'    => 'Agus Finance',
                'image'       => 'issue-1786002058-problem.jpg',
            ],
            [
                'title'       => 'Monthly Power & Desalination Water Utility Audit',
                'description' => 'Calibrated digital flowmeters on the seawater reverse osmosis desalination plant against electrical consumption ledger.',
                'location'    => 'TBR - Desalination Plant',
                'category'    => 'plumbing',
                'status'      => 'solved',
                'priority'    => 'low',
                'department'  => 'Finance',
                'assigned'    => 'OE',
                'tagged'      => 'Engineer, Finance',
                'reporter'    => 'Agus Finance',
                'image'       => 'issue-1785992056-problem.jpg',
                'taker'       => 'Bambang OE',
                'solver'      => 'Bambang OE',
                'fixDesc'     => 'Cleaned electromagnetic flow sensors and balanced telemetry ledger with ±0.2% variance.',
                'proofImage'  => 'Fin-180826-27-proof.png',
                'duration'    => 'Solved in 1.5 hours',
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
