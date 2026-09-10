<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DepartmentUsersSeeder extends Seeder
{
    public function run(): void
    {
        $password = Hash::make('telunas123');

        $accounts = [
            // ── ADMIN ──────────────────────────────────────────────────────────
            [
                'name'        => 'Admin Telunas',
                'email'       => 'admin@telunas.com',
                'role'        => 'admin',
                'department'  => null,
                'subdivision' => null,
                'staff_name'  => 'Admin Telunas',
            ],

            // ── 1. HR GROUP (Subdivisions: HR, Legal, LnD, Transportasi) ───────
            [
                'name'        => 'Bambang HR',
                'email'       => 'BambangHR@telunas.com',
                'role'        => 'department',
                'department'  => 'HR',
                'subdivision' => 'HR',
                'staff_name'  => 'Bambang HR',
            ],
            [
                'name'        => 'Hendro Legal',
                'email'       => 'HendroLegal@telunas.com',
                'role'        => 'department',
                'department'  => 'HR',
                'subdivision' => 'Legal',
                'staff_name'  => 'Hendro Legal',
            ],
            [
                'name'        => 'Putri LnD',
                'email'       => 'PutriLnD@telunas.com',
                'role'        => 'department',
                'department'  => 'HR',
                'subdivision' => 'LnD',
                'staff_name'  => 'Putri LnD',
            ],
            [
                'name'        => 'Arif Transportasi',
                'email'       => 'ArifTransportasi@telunas.com',
                'role'        => 'department',
                'department'  => 'HR',
                'subdivision' => 'Transportasi',
                'staff_name'  => 'Captain Arif',
            ],
            // Backward-compat email alias for Arif
            [
                'name'        => 'Arif Transportasi',
                'email'       => 'ArifTekong@telunas.com',
                'role'        => 'department',
                'department'  => 'HR',
                'subdivision' => 'Transportasi',
                'staff_name'  => 'Captain Arif',
            ],

            // ── 2. GR GROUP (Subdivisions: GRE, Service, TIrek, Spa, Bar) ──────
            [
                'name'        => 'Wawan GRE',
                'email'       => 'WawanGRE@telunas.com',
                'role'        => 'department',
                'department'  => 'GR',
                'subdivision' => 'GRE',
                'staff_name'  => 'Wawan GRE',
            ],
            [
                'name'        => 'Wawan GRE',
                'email'       => 'WawanGR@telunas.com',
                'role'        => 'department',
                'department'  => 'GR',
                'subdivision' => 'GRE',
                'staff_name'  => 'Wawan GRE',
            ],
            [
                'name'        => 'Anto Service',
                'email'       => 'AntoService@telunas.com',
                'role'        => 'department',
                'department'  => 'GR',
                'subdivision' => 'Service',
                'staff_name'  => 'Anto Service',
            ],
            [
                'name'        => 'Lia Bar',
                'email'       => 'LiaBar@telunas.com',
                'role'        => 'department',
                'department'  => 'GR',
                'subdivision' => 'Bar',
                'staff_name'  => 'Lia Bar',
            ],
            [
                'name'        => 'Sari Spa',
                'email'       => 'SariSpa@telunas.com',
                'role'        => 'department',
                'department'  => 'GR',
                'subdivision' => 'Spa',
                'staff_name'  => 'Sari Spa',
            ],
            [
                'name'        => 'Fajar TiRek',
                'email'       => 'FajarTiRek@telunas.com',
                'role'        => 'department',
                'department'  => 'GR',
                'subdivision' => 'TIrek',
                'staff_name'  => 'Fajar TiRek',
            ],

            // ── 3. OE (Operational Excellence) ─────────────────────────────────
            [
                'name'        => 'Dimas OE',
                'email'       => 'DimasOE@telunas.com',
                'role'        => 'department',
                'department'  => 'OE',
                'subdivision' => 'OE',
                'staff_name'  => 'Dimas OE',
            ],
            [
                'name'        => 'Taufik OE',
                'email'       => 'TaufikOE@telunas.com',
                'role'        => 'department',
                'department'  => 'OE',
                'subdivision' => 'OE',
                'staff_name'  => 'Taufik OE',
            ],

            // ── 4. KITCHEN (Formerly F&B) ──────────────────────────────────────
            [
                'name'        => 'Ricky Kitchen',
                'email'       => 'RickyKitchen@telunas.com',
                'role'        => 'department',
                'department'  => 'Kitchen',
                'subdivision' => 'Kitchen',
                'staff_name'  => 'Chef Ricky',
            ],
            [
                'name'        => 'Ricky Kitchen',
                'email'       => 'RickyFnB@telunas.com',
                'role'        => 'department',
                'department'  => 'Kitchen',
                'subdivision' => 'Kitchen',
                'staff_name'  => 'Chef Ricky',
            ],
            [
                'name'        => 'Bayu Kitchen',
                'email'       => 'BayuKitchen@telunas.com',
                'role'        => 'department',
                'department'  => 'Kitchen',
                'subdivision' => 'Kitchen',
                'staff_name'  => 'Bayu Kitchen',
            ],
            [
                'name'        => 'Bayu Kitchen',
                'email'       => 'BayuFnB@telunas.com',
                'role'        => 'department',
                'department'  => 'Kitchen',
                'subdivision' => 'Kitchen',
                'staff_name'  => 'Bayu Kitchen',
            ],

            // ── 5. HK (Housekeeping & Pest Control) ────────────────────────────
            [
                'name'        => 'Siti HK',
                'email'       => 'SitiHK@telunas.com',
                'role'        => 'department',
                'department'  => 'HK',
                'subdivision' => 'HK',
                'staff_name'  => 'Siti HK',
            ],
            [
                'name'        => 'Wahyu PestControl',
                'email'       => 'WahyuPestControl@telunas.com',
                'role'        => 'department',
                'department'  => 'HK',
                'subdivision' => 'Pest Control',
                'staff_name'  => 'Wahyu Pest Control',
            ],

            // ── 6. IT ──────────────────────────────────────────────────────────
            [
                'name'        => 'Reza IT',
                'email'       => 'RezaIT@telunas.com',
                'role'        => 'department',
                'department'  => 'IT',
                'subdivision' => 'IT',
                'staff_name'  => 'Reza IT',
            ],
            [
                'name'        => 'Dani IT',
                'email'       => 'DaniIT@telunas.com',
                'role'        => 'department',
                'department'  => 'IT',
                'subdivision' => 'IT',
                'staff_name'  => 'Dani IT',
            ],

            // ── 7. PROCUREMENT ─────────────────────────────────────────────────
            [
                'name'        => 'Ratna Procurement',
                'email'       => 'RatnaProcurement@telunas.com',
                'role'        => 'department',
                'department'  => 'Procurement',
                'subdivision' => 'Procurement',
                'staff_name'  => 'Ratna Procurement',
            ],
            [
                'name'        => 'Budi Procurement',
                'email'       => 'BudiProcurement@telunas.com',
                'role'        => 'department',
                'department'  => 'Procurement',
                'subdivision' => 'Procurement',
                'staff_name'  => 'Budi Procurement',
            ],

            // ── 8. FINANCE ─────────────────────────────────────────────────────
            [
                'name'        => 'Iwan Finance',
                'email'       => 'IwanFinance@telunas.com',
                'role'        => 'department',
                'department'  => 'Finance',
                'subdivision' => 'Finance',
                'staff_name'  => 'Iwan Finance',
            ],
            [
                'name'        => 'Ratna Finance',
                'email'       => 'RatnaFinance@telunas.com',
                'role'        => 'department',
                'department'  => 'Finance',
                'subdivision' => 'Finance',
                'staff_name'  => 'Ratna Finance',
            ],

            // ── 9. RESERVASI (Subdivisions: Reservasi, Sales, Marketing) ───────
            [
                'name'        => 'Maya Reservasi',
                'email'       => 'MayaReservasi@telunas.com',
                'role'        => 'department',
                'department'  => 'Reservasi',
                'subdivision' => 'Reservasi',
                'staff_name'  => 'Maya Reservasi',
            ],
            [
                'name'        => 'Clarissa Sales',
                'email'       => 'ClarissaSales@telunas.com',
                'role'        => 'department',
                'department'  => 'Reservasi',
                'subdivision' => 'Sales',
                'staff_name'  => 'Clarissa Sales',
            ],
            [
                'name'        => 'Ana Marketing',
                'email'       => 'AnaMarketing@telunas.com',
                'role'        => 'department',
                'department'  => 'Reservasi',
                'subdivision' => 'Marketing',
                'staff_name'  => 'Ana Marketing',
            ],
            [
                'name'        => 'Ana Marketing',
                'email'       => 'AnaSales@telunas.com',
                'role'        => 'department',
                'department'  => 'Reservasi',
                'subdivision' => 'Marketing',
                'staff_name'  => 'Ana Marketing',
            ],

            // ── 10. ENGINEER ───────────────────────────────────────────────────
            [
                'name'        => 'Dimas Engineer',
                'email'       => 'DimasEngineer@telunas.com',
                'role'        => 'department',
                'department'  => 'Engineer',
                'subdivision' => 'Engineer',
                'staff_name'  => 'Dimas Engineer',
            ],
            [
                'name'        => 'Budi Engineer',
                'email'       => 'BudiEngineer@telunas.com',
                'role'        => 'department',
                'department'  => 'Engineer',
                'subdivision' => 'Engineer',
                'staff_name'  => 'Budi Engineer',
            ],

            // ── 11. FASILITAS (Subdivisions: Fasilitas, Security) ──────────────
            [
                'name'        => 'Anto Fasilitas',
                'email'       => 'AntoFasilitas@telunas.com',
                'role'        => 'department',
                'department'  => 'Fasilitas',
                'subdivision' => 'Fasilitas',
                'staff_name'  => 'Anto Fasilitas',
            ],
            [
                'name'        => 'Joko Security',
                'email'       => 'JokoSecurity@telunas.com',
                'role'        => 'department',
                'department'  => 'Fasilitas',
                'subdivision' => 'Security',
                'staff_name'  => 'Joko Security',
            ],
        ];

        foreach ($accounts as $account) {
            User::updateOrCreate(
                ['email' => $account['email']],
                array_merge($account, [
                    'password'     => $password,
                    'raw_password' => 'telunas123',
                ])
            );
        }

        $this->command->info('✅ ' . count($accounts) . ' department accounts seeded successfully.');
    }
}
