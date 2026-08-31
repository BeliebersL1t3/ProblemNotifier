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
                'staff_name'  => null,
            ],

            // ── GR GROUP (subdivisions: GR, Service, Bar, Spa, TiRek) ──────────
            [
                'name'        => 'Wawan GR',
                'email'       => 'WawanGR@telunas.com',
                'role'        => 'department',
                'department'  => 'GR',
                'subdivision' => 'GR',
                'staff_name'  => 'Wawan GR',
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
                'subdivision' => 'TiRek',
                'staff_name'  => 'Fajar TiRek',
            ],

            // ── HR GROUP (subdivisions: HR, Legal, Tekong) ─────────────────────
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
                'name'        => 'Arif Tekong',
                'email'       => 'ArifTekong@telunas.com',
                'role'        => 'department',
                'department'  => 'HR',
                'subdivision' => 'Tekong',
                'staff_name'  => 'Arif Tekong',
            ],

            // ── HK GROUP (subdivisions: HK, Pest Control) ──────────────────────
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

            // ── FASILITAS GROUP (subdivisions: Fasilitas, Security) ────────────
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

            // ── ENGINEER (2 accounts) ─────────────────────────────────────────
            [
                'name'        => 'Dimas Engineer',
                'email'       => 'DimasEngineer@telunas.com',
                'role'        => 'department',
                'department'  => 'Engineer',
                'subdivision' => null,
                'staff_name'  => 'Dimas Engineer',
            ],
            [
                'name'        => 'Budi Engineer',
                'email'       => 'BudiEngineer@telunas.com',
                'role'        => 'department',
                'department'  => 'Engineer',
                'subdivision' => null,
                'staff_name'  => 'Budi Engineer',
            ],

            // ── F&B (2 accounts) ──────────────────────────────────────────────
            [
                'name'        => 'Ricky FnB',
                'email'       => 'RickyFnB@telunas.com',
                'role'        => 'department',
                'department'  => 'F&B',
                'subdivision' => null,
                'staff_name'  => 'Ricky FnB',
            ],
            [
                'name'        => 'Bayu FnB',
                'email'       => 'BayuFnB@telunas.com',
                'role'        => 'department',
                'department'  => 'F&B',
                'subdivision' => null,
                'staff_name'  => 'Bayu FnB',
            ],

            // ── IT (2 accounts) ───────────────────────────────────────────────
            [
                'name'        => 'Reza IT',
                'email'       => 'RezaIT@telunas.com',
                'role'        => 'department',
                'department'  => 'IT',
                'subdivision' => null,
                'staff_name'  => 'Reza IT',
            ],
            [
                'name'        => 'Dani IT',
                'email'       => 'DaniIT@telunas.com',
                'role'        => 'department',
                'department'  => 'IT',
                'subdivision' => null,
                'staff_name'  => 'Dani IT',
            ],

            // ── OE (2 accounts) ───────────────────────────────────────────────
            [
                'name'        => 'Dimas OE',
                'email'       => 'DimasOE@telunas.com',
                'role'        => 'department',
                'department'  => 'OE',
                'subdivision' => null,
                'staff_name'  => 'Dimas OE',
            ],
            [
                'name'        => 'Taufik OE',
                'email'       => 'TaufikOE@telunas.com',
                'role'        => 'department',
                'department'  => 'OE',
                'subdivision' => null,
                'staff_name'  => 'Taufik OE',
            ],

            // ── PROCUREMENT (2 accounts) ──────────────────────────────────────
            [
                'name'        => 'Ratna Procurement',
                'email'       => 'RatnaProcurement@telunas.com',
                'role'        => 'department',
                'department'  => 'Procurement',
                'subdivision' => null,
                'staff_name'  => 'Ratna Procurement',
            ],
            [
                'name'        => 'Budi Procurement',
                'email'       => 'BudiProcurement@telunas.com',
                'role'        => 'department',
                'department'  => 'Procurement',
                'subdivision' => null,
                'staff_name'  => 'Budi Procurement',
            ],

            // ── SALES/MARKETING (2 accounts) ─────────────────────────────────
            [
                'name'        => 'Clarissa Sales',
                'email'       => 'ClarissaSales@telunas.com',
                'role'        => 'department',
                'department'  => 'Sales/Marketing',
                'subdivision' => null,
                'staff_name'  => 'Clarissa Sales',
            ],
            [
                'name'        => 'Ana Sales',
                'email'       => 'AnaSales@telunas.com',
                'role'        => 'department',
                'department'  => 'Sales/Marketing',
                'subdivision' => null,
                'staff_name'  => 'Ana Sales',
            ],

            // ── RESERVASI (2 accounts) ────────────────────────────────────────
            [
                'name'        => 'Maya Reservasi',
                'email'       => 'MayaReservasi@telunas.com',
                'role'        => 'department',
                'department'  => 'Reservasi',
                'subdivision' => null,
                'staff_name'  => 'Maya Reservasi',
            ],
            [
                'name'        => 'Res Reservasi',
                'email'       => 'ResReservasi@telunas.com',
                'role'        => 'department',
                'department'  => 'Reservasi',
                'subdivision' => null,
                'staff_name'  => 'Res Reservasi',
            ],

            // ── FINANCE (2 accounts) ──────────────────────────────────────────
            [
                'name'        => 'Iwan Finance',
                'email'       => 'IwanFinance@telunas.com',
                'role'        => 'department',
                'department'  => 'Finance',
                'subdivision' => null,
                'staff_name'  => 'Iwan Finance',
            ],
            [
                'name'        => 'Ratna Finance',
                'email'       => 'RatnaFinance@telunas.com',
                'role'        => 'department',
                'department'  => 'Finance',
                'subdivision' => null,
                'staff_name'  => 'Ratna Finance',
            ],
        ];

        foreach ($accounts as $account) {
            User::updateOrCreate(
                ['email' => $account['email']],
                array_merge($account, ['password' => $password])
            );
        }

        $this->command->info('✅ ' . count($accounts) . ' department accounts seeded successfully.');
    }
}
