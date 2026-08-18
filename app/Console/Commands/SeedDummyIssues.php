<?php

namespace App\Console\Commands;

use App\Services\GoogleService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SeedDummyIssues extends Command
{
    protected $signature   = 'issues:seed {--count=20 : Number of issues to add}';
    protected $description = 'Seed dummy issues into the current active Google Sheet for demo/testing.';

    public function handle(GoogleService $google): int
    {
        $count = (int) $this->option('count');

        // Real images that exist in public/uploads/
        $images = [
            'issue-1785924143-problem.png',
            'issue-1785924729-problem.png',
            'issue-1785924779-problem.png',
            'issue-1785979190-problem.png',
            'issue-1785979223-problem.jpg',
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
            'TEL-IT-070826-45-problem.jpg',
            'TEL-IT-070826-46-problem.jpg',
        ];

        $pendingImages = [
            'issue-1786004355-pending-1786085878.jpg',
            'issue-1786009599-pending-1786077810.jpg',
            'issue-1786077923-pending-1786077960.jpg',
            'issue-1786077923-pending-1786077999.jpg',
            'TEL-IT-070826-43-pending-1786085927.jpg',
        ];

        $issues = [
            [
                'title'       => 'Broken AC Unit in Bungalow 3',
                'description' => 'The air conditioning unit has stopped working completely. Room temperature is unbearable for guests during the afternoon peak heat.',
                'location'    => 'Bungalow 3 — Beachfront Wing',
                'category'    => 'broken',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'Engineering',
                'reporter'    => 'Maria Santos',
                'image'       => 'issue-1785991295-problem.jpg',
            ],
            [
                'title'       => 'Leaking Pipe Under Sink — Kitchen Staff Area',
                'description' => 'Water is pooling beneath the kitchen prep sink. The leak started after last night\'s dinner service and is getting worse.',
                'location'    => 'Main Kitchen — Staff Prep Area',
                'category'    => 'plumbing',
                'status'      => 'progress',
                'priority'    => 'high',
                'department'  => 'Maintenance',
                'reporter'    => 'Chef Ricky',
                'image'       => 'issue-1785992354-problem.jpg',
                'taker'       => 'Budi Santoso',
            ],
            [
                'title'       => 'Power Trip — Meeting Room B Sockets Dead',
                'description' => 'All electrical sockets in Meeting Room B are unresponsive. The circuit breaker appears to have tripped and won\'t reset.',
                'location'    => 'Meeting Room B — Conference Center',
                'category'    => 'electrical',
                'status'      => 'solved',
                'priority'    => 'medium',
                'department'  => 'Engineering',
                'reporter'    => 'Jessica Lin',
                'image'       => 'IT-070826-2-problem.jpg',
                'solver'      => 'Ahmad Fauzi',
                'fixDesc'     => 'Replaced blown fuse and reset the dedicated circuit breaker. All sockets verified working.',
                'proofImage'  => '12-proof.jpg',
            ],
            [
                'title'       => 'Cracked Deck Planks Near Infinity Pool',
                'description' => 'Three wooden deck planks adjacent to the infinity pool have split and warped. Potential safety hazard for barefoot guests.',
                'location'    => 'Infinity Pool Deck — Level 2',
                'category'    => 'structural',
                'status'      => 'pending',
                'priority'    => 'critical',
                'department'  => 'Maintenance',
                'reporter'    => 'Pool Supervisor Anto',
                'image'       => 'issue-1785992420-problem.jpg',
                'pendingReason' => 'Waiting for replacement teak wood planks from supplier. ETA 3 days.',
                'pendingBy'   => 'Warehouse Dept',
                'pendingImage' => 'issue-1786004355-pending-1786085878.jpg',
            ],
            [
                'title'       => 'Wasp Nest Discovered — Treehouse Cabin 7',
                'description' => 'A large wasp nest (approx. 40cm) has been found under the eaves of Treehouse Cabin 7. The cabin is currently occupied by guests.',
                'location'    => 'Treehouse Cabin 7 — Jungle Wing',
                'category'    => 'pest-hygiene',
                'status'      => 'progress',
                'priority'    => 'critical',
                'department'  => 'Housekeeping',
                'reporter'    => 'Siti Rahayu',
                'image'       => 'issue-1785993217-problem.jpg',
                'taker'       => 'Pest Control Team',
            ],
            [
                'title'       => 'WiFi Dead — Entire Resort Lobby',
                'description' => 'The main access point in the resort lobby lost connectivity. Guests are unable to connect. Primary router shows no uplink light.',
                'location'    => 'Main Lobby — Reception Area',
                'category'    => 'it-technology',
                'status'      => 'solved',
                'priority'    => 'high',
                'department'  => 'IT',
                'reporter'    => 'Front Desk Team',
                'image'       => 'IT-070826-4-problem.jpg',
                'solver'      => 'IT Team',
                'fixDesc'     => 'ISP fiber cable was disconnected at the junction box. Reconnected and verified full connectivity across all APs.',
                'proofImage'  => '13-proof.jpg',
            ],
            [
                'title'       => 'Kayak Storage Rack Collapsed',
                'description' => 'The marine-grade metal rack storing 4 sea kayaks has buckled and fallen. Kayaks are undamaged but cannot be accessed safely.',
                'location'    => 'Beach Equipment Shed',
                'category'    => 'marine-outdoor',
                'status'      => 'open',
                'priority'    => 'medium',
                'department'  => 'Marine',
                'reporter'    => 'Beach Activities Lead',
                'image'       => 'Scy-070826-3-problem.jpg',
            ],
            [
                'title'       => 'Slippery Floor — Spa Entrance After Rain',
                'description' => 'The stone tile flooring at the spa entrance becomes dangerously slippery when wet. A guest almost fell this morning.',
                'location'    => 'Spa Entrance — Wellness Wing',
                'category'    => 'safety-hazard',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'Maintenance',
                'reporter'    => 'Spa Manager Dewi',
                'image'       => 'issue-1785995410-problem.jpg',
            ],
            [
                'title'       => 'Guest Complaint — Noisy Water Pump All Night',
                'description' => 'Guests in Bungalow 5 reported extremely loud water pump noise throughout the night preventing sleep. Urgent attention needed.',
                'location'    => 'Bungalow 5 — Pool View',
                'category'    => 'guest-issues',
                'status'      => 'progress',
                'priority'    => 'high',
                'department'  => 'Engineering',
                'reporter'    => 'Night Manager',
                'image'       => 'issue-1785996960-problem.jpeg',
                'taker'       => 'Eng Team — Dimas',
            ],
            [
                'title'       => 'Mold Growth — Bathroom Ceiling Bungalow 9',
                'description' => 'Significant black mold has appeared on the bathroom ceiling of Bungalow 9. Likely caused by poor ventilation. Health concern for guests.',
                'location'    => 'Bungalow 9 — Bathroom',
                'category'    => 'pest-hygiene',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'Housekeeping',
                'reporter'    => 'Housekeeping Supervisor',
                'image'       => 'issue-1785996993-problem.jpeg',
            ],
            [
                'title'       => 'CCTV Camera Offline — Jetty Area',
                'description' => 'The security CCTV camera covering the main jetty has gone offline. The jetty is a high-traffic area with guest boat arrivals.',
                'location'    => 'Main Jetty — Entry Point',
                'category'    => 'it-technology',
                'status'      => 'solved',
                'priority'    => 'medium',
                'department'  => 'IT',
                'reporter'    => 'Security Team',
                'image'       => 'TEL-IT-070826-43-problem.jpg',
                'solver'      => 'IT Team',
                'fixDesc'     => 'Power cable to the camera was chewed by an animal. Replaced cable with armored sheathing and repositioned camera.',
                'proofImage'  => '14-proof.jpg',
            ],
            [
                'title'       => 'Generator Fuel Low — Risk of Night Blackout',
                'description' => 'Backup generator fuel level is at 15%. Scheduled refill was missed. Resort may lose power backup during a grid outage tonight.',
                'location'    => 'Generator Room — Service Block',
                'category'    => 'electrical',
                'status'      => 'solved',
                'priority'    => 'critical',
                'department'  => 'Engineering',
                'reporter'    => 'Engineering Lead',
                'image'       => 'TEL-Eng-070826-42-problem.jpg',
                'solver'      => 'Procurement Yusuf',
                'fixDesc'     => 'Emergency fuel order placed and delivered. Generator now at 95% capacity. Refill schedule updated.',
                'proofImage'  => '35-proof.jpg',
            ],
            [
                'title'       => 'Broken Lounge Chair — Restaurant Terrace',
                'description' => 'One of the rattan lounge chairs on the restaurant terrace has a broken leg. Chair has been taped off but needs replacement.',
                'location'    => 'Restaurant Terrace — Dining Area',
                'category'    => 'broken',
                'status'      => 'open',
                'priority'    => 'low',
                'department'  => 'F&B',
                'reporter'    => 'Restaurant Manager',
                'image'       => 'issue-1786002058-problem.jpg',
            ],
            [
                'title'       => 'Blocked Drainage — Outdoor Shower Cabin 2',
                'description' => 'The outdoor shower drain in Cabin 2 is completely blocked. Water is pooling and overflowing onto the wooden walkway.',
                'location'    => 'Cabin 2 — Outdoor Shower',
                'category'    => 'plumbing',
                'status'      => 'pending',
                'priority'    => 'medium',
                'department'  => 'Maintenance',
                'reporter'    => 'Cabin Attendant Reza',
                'image'       => 'issue-1786002251-problem.png',
                'pendingReason' => 'Drain snake tool is out for repair. Temporary drainage channel installed. Awaiting tool return.',
                'pendingBy'   => 'Maintenance Lead',
                'pendingImage' => 'issue-1786009599-pending-1786077810.jpg',
            ],
            [
                'title'       => 'Sun Shade Sail Torn — Kids Pool Area',
                'description' => 'The large shade sail over the children\'s pool has a 1.5m tear. Direct sun exposure is now unprotected during peak hours.',
                'location'    => 'Kids Pool — Family Zone',
                'category'    => 'structural',
                'status'      => 'open',
                'priority'    => 'medium',
                'department'  => 'Maintenance',
                'reporter'    => 'Activities Coordinator',
                'image'       => 'issue-1786002352-problem.jpeg',
            ],
            [
                'title'       => 'Speedboat Engine Stalling — Boat #2',
                'description' => 'The resort speedboat #2 is stalling mid-journey. It has been pulled from service. Guests are waiting for transfers.',
                'location'    => 'Marine Dock — Boat Storage',
                'category'    => 'marine-outdoor',
                'status'      => 'progress',
                'priority'    => 'critical',
                'department'  => 'Marine',
                'reporter'    => 'Captain Arif',
                'image'       => 'issue-1786002564-problem.png',
                'taker'       => 'Marine Mechanic Hadi',
            ],
            [
                'title'       => 'Trail Lights Out — Forest Walkway',
                'description' => 'All solar-powered trail lights along the 400m forest walkway are out. Evening trail walks are dangerous without lighting.',
                'location'    => 'Forest Walkway — Nature Trail',
                'category'    => 'electrical',
                'status'      => 'open',
                'priority'    => 'high',
                'department'  => 'Engineering',
                'reporter'    => 'Nature Guide Wawan',
                'image'       => 'issue-1786002998-problem.png',
            ],
            [
                'title'       => 'POS System Crash — Bar Counter',
                'description' => 'The point-of-sale tablet at the pool bar is frozen and unresponsive. Transactions are being recorded manually. Revenue tracking at risk.',
                'location'    => 'Pool Bar — Bar Counter',
                'category'    => 'it-technology',
                'status'      => 'solved',
                'priority'    => 'medium',
                'department'  => 'IT',
                'reporter'    => 'Bar Manager Lia',
                'image'       => 'issue-1786006086-problem.png',
                'solver'      => 'IT Support Dani',
                'fixDesc'     => 'Factory reset the POS tablet and reinstalled the billing app. Data synced from cloud backup. No revenue loss.',
                'proofImage'  => 'issue-1786003238-proof.png',
            ],
            [
                'title'       => 'Fire Extinguisher Expired — Dive Center',
                'description' => 'Monthly safety check revealed 2 fire extinguishers in the dive center have passed their inspection date by 3 months.',
                'location'    => 'Dive Center — Equipment Room',
                'category'    => 'safety-hazard',
                'status'      => 'progress',
                'priority'    => 'high',
                'department'  => 'Safety',
                'reporter'    => 'Dive Master Pak Bram',
                'image'       => 'issue-1786007022-problem.jpg',
                'taker'       => 'Safety Officer Indah',
            ],
            [
                'title'       => 'Sewage Smell — Near Staff Quarters Block C',
                'description' => 'A strong sewage smell has been reported near staff quarters Block C. The smell is coming from the inspection chamber access point.',
                'location'    => 'Staff Quarters — Block C Exterior',
                'category'    => 'plumbing',
                'status'      => 'pending',
                'priority'    => 'high',
                'department'  => 'Maintenance',
                'reporter'    => 'Block C Resident Rep',
                'image'       => 'issue-1786074481-problem.jpg',
                'pendingReason' => 'Septic tank inspection requires a specialist contractor. Appointment scheduled for next week. Ventilation fans installed in the interim.',
                'pendingBy'   => 'Maintenance Head',
                'pendingImage' => 'issue-1786077923-pending-1786077960.jpg',
            ],
        ];

        // Resolve current active sheet
        $allSheets = $google->listSheets(true);
        $active    = end($allSheets) ?: 'Sheet1';
        $google->setSheet($active);

        $this->info("Seeding {$count} dummy issues into sheet: [{$active}]");

        $added = 0;
        foreach (array_slice($issues, 0, $count) as $data) {
            $now     = now();
            $issueId = 'DEMO-' . strtoupper(substr(md5($data['title'] . microtime()), 0, 8));

            $row = [
                $issueId,                                          // A — ID
                $data['title'],                                    // B — Title
                $data['description'],                              // C — Description
                $data['location'],                                 // D — Location
                $data['category'],                                 // E — Category
                $data['status'],                                   // F — Status
                $data['reporter'] ?? 'Demo Seeder',               // G — Reporter
                $now->subDays(rand(1, 60))->format('Y-m-d H:i:s'), // H — Submitted At
                $data['image'] ?? '',                              // I — Image URL
                $data['taker']  ?? '',                             // J — Taker
                !empty($data['taker']) ? $now->subDays(rand(0, 30))->format('Y-m-d H:i:s') : '', // K — Taken At
                $data['solver'] ?? '',                             // L — Solver
                !empty($data['solver']) ? $now->subDays(rand(0, 15))->format('Y-m-d H:i:s') : '', // M — Solved At
                $data['fixDesc'] ?? '',                            // N — Fix Description
                $data['proofImage'] ?? '',                         // O — Proof Image URL
                !empty($data['solver']) ? rand(1, 5) . ' hours' : '', // P — Duration
                $data['priority'] ?? 'medium',                    // Q — Priority
                !empty($data['priority']) && $data['priority'] === 'high'
                    ? $now->addDays(rand(1, 7))->format('Y-m-d')
                    : '',                                           // R — Deadline
                $data['pendingReason'] ?? '',                      // S — Pending Reason
                $data['pendingBy'] ?? '',                          // T — Pending By
                $data['pendingImage'] ?? '',                       // U — Pending Image URL
                '',                                                // V — Tagged Departments
                $data['department'] ?? '',                         // W — Origin Department
            ];

            try {
                $rowIndex = $google->appendRow($row);
                if ($rowIndex) {
                    $google->colorRowByCategory($rowIndex, $data['category']);
                }
                $this->line("  ✓ Added: <info>{$data['title']}</info>");
                $added++;
                // Small sleep to avoid hitting rate limit
                usleep(300000); // 0.3s
            } catch (\Throwable $e) {
                $this->warn("  ✗ Failed [{$data['title']}]: " . $e->getMessage());
            }
        }

        $google->clearCache($active);
        $this->newLine();
        $this->info("Done! Added {$added}/{$count} issues to sheet [{$active}].");

        return Command::SUCCESS;
    }
}
