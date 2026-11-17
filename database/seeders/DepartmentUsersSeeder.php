<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DepartmentUsersSeeder extends Seeder
{
    /**
     * Run the database seeds to sync active users:
     * - Preserves users with real emails and numbers
     * - Purges obsolete dummy accounts without phone numbers
     * - Creates active roster of staff accounts for all Telunas departments
     */
    public function run(): void
    {
        $defaultPassword = Hash::make('telunas123');

        // 1. Whitelist of real accounts to preserve
        $preservedEmails = [
            'pilipbiyik@gmail.com',
            'humaspmkv@gmail.com',
            'recruitment@telunasbeach.com',
            'dedy@telunas.com',
            'noobmastermc@student.ub.ac.id',
            'noobmastermc@gmail.com',
            'phillipus.zerah.s@gmail.com',
            'akusayangortu64@gmail.com',
            'gacor123@gmail.com',
        ];

        // 2. Ensure all preserved accounts are active, approved, and non-HOD
        User::whereIn('email', $preservedEmails)->update([
            'is_active' => true,
            'approval_status' => 'approved',
            'is_hod' => false,
            'hod_title' => null,
        ]);

        // 3. Delete old obsolete dummy accounts
        User::whereNotIn('email', $preservedEmails)->delete();

        // 4. New active staff accounts roster (covering all Telunas departments & subdivisions)
        $newStaffAccounts = [
            // ── ENGINEER / MAINTENANCE ──────────────────────────────────────────
            [
                'name'            => 'Budi Engineer',
                'staff_name'      => 'Budi Engineer',
                'email'           => 'budi.eng@telunas.com',
                'role'            => 'department',
                'department'      => 'Engineer',
                'subdivision'     => 'Engineer',
                'whatsapp_number' => '081234567101',
            ],
            [
                'name'            => 'Wawan Engineer',
                'staff_name'      => 'Wawan Engineer',
                'email'           => 'wawan.eng@telunas.com',
                'role'            => 'department',
                'department'      => 'Engineer',
                'subdivision'     => 'Engineer',
                'whatsapp_number' => '081234567117',
            ],

            // ── HOUSEKEEPING (HK + PEST CONTROL) ───────────────────────────────
            [
                'name'            => 'Siti Housekeeping',
                'staff_name'      => 'Siti HK',
                'email'           => 'siti.hk@telunas.com',
                'role'            => 'department',
                'department'      => 'HK',
                'subdivision'     => 'HK',
                'whatsapp_number' => '081234567102',
            ],
            [
                'name'            => 'Wahyu PestControl',
                'staff_name'      => 'Wahyu PestControl',
                'email'           => 'wahyu.pest@telunas.com',
                'role'            => 'department',
                'department'      => 'HK',
                'subdivision'     => 'Pest Control',
                'whatsapp_number' => '081234567103',
            ],

            // ── KITCHEN ────────────────────────────────────────────────────────
            [
                'name'            => 'Chef Ricky Kitchen',
                'staff_name'      => 'Chef Ricky',
                'email'           => 'ricky.kitchen@telunas.com',
                'role'            => 'department',
                'department'      => 'Kitchen',
                'subdivision'     => 'Kitchen',
                'whatsapp_number' => '081234567104',
            ],

            // ── IT & TECHNOLOGY ────────────────────────────────────────────────
            [
                'name'            => 'Rian IT',
                'staff_name'      => 'Rian IT',
                'email'           => 'rian.it@telunas.com',
                'role'            => 'department',
                'department'      => 'IT',
                'subdivision'     => 'IT',
                'whatsapp_number' => '081234567105',
            ],

            // ── PROCUREMENT ────────────────────────────────────────────────────
            [
                'name'            => 'Doni Procurement',
                'staff_name'      => 'Doni Procurement',
                'email'           => 'doni.proc@telunas.com',
                'role'            => 'department',
                'department'      => 'Procurement',
                'subdivision'     => 'Procurement',
                'whatsapp_number' => '081234567106',
            ],

            // ── FINANCE ────────────────────────────────────────────────────────
            [
                'name'            => 'Dewi Finance',
                'staff_name'      => 'Dewi Finance',
                'email'           => 'dewi.fin@telunas.com',
                'role'            => 'department',
                'department'      => 'Finance',
                'subdivision'     => 'Finance',
                'whatsapp_number' => '081234567107',
            ],

            // ── RESERVASI & MARKETING ──────────────────────────────────────────
            [
                'name'            => 'Maya Reservasi',
                'staff_name'      => 'Maya Reservasi',
                'email'           => 'maya.res@telunas.com',
                'role'            => 'department',
                'department'      => 'Reservasi',
                'subdivision'     => 'Reservasi',
                'whatsapp_number' => '081234567108',
            ],
            [
                'name'            => 'Sarah Marketing',
                'staff_name'      => 'Sarah Marketing',
                'email'           => 'sarah.mkt@telunas.com',
                'role'            => 'department',
                'department'      => 'Reservasi',
                'subdivision'     => 'Marketing',
                'whatsapp_number' => '081234567109',
            ],

            // ── GUEST RELATIONS (GR) ───────────────────────────────────────────
            [
                'name'            => 'Wayan GRE',
                'staff_name'      => 'Wayan GRE',
                'email'           => 'wayan.gre@telunas.com',
                'role'            => 'department',
                'department'      => 'GR',
                'subdivision'     => 'GRE',
                'whatsapp_number' => '081234567110',
            ],
            [
                'name'            => 'Anto Service',
                'staff_name'      => 'Anto Service',
                'email'           => 'anto.service@telunas.com',
                'role'            => 'department',
                'department'      => 'GR',
                'subdivision'     => 'Service',
                'whatsapp_number' => '081234567111',
            ],
            [
                'name'            => 'Lia Bar',
                'staff_name'      => 'Lia Bar',
                'email'           => 'lia.bar@telunas.com',
                'role'            => 'department',
                'department'      => 'GR',
                'subdivision'     => 'Bar',
                'whatsapp_number' => '081234567118',
            ],
            [
                'name'            => 'Sari Spa',
                'staff_name'      => 'Sari Spa',
                'email'           => 'sari.spa@telunas.com',
                'role'            => 'department',
                'department'      => 'GR',
                'subdivision'     => 'Spa',
                'whatsapp_number' => '081234567119',
            ],

            // ── HR SUBDIVISIONS (LEGAL, LND, TRANSPORTASI) ─────────────────────
            [
                'name'            => 'Hendro Legal',
                'staff_name'      => 'Hendro Legal',
                'email'           => 'hendro.legal@telunas.com',
                'role'            => 'department',
                'department'      => 'HR',
                'subdivision'     => 'Legal',
                'whatsapp_number' => '081234567115',
            ],
            [
                'name'            => 'Putri LnD',
                'staff_name'      => 'Putri LnD',
                'email'           => 'putri.lnd@telunas.com',
                'role'            => 'department',
                'department'      => 'HR',
                'subdivision'     => 'LnD',
                'whatsapp_number' => '081234567116',
            ],
            [
                'name'            => 'Captain Taufik',
                'staff_name'      => 'Captain Taufik',
                'email'           => 'taufik.boat@telunas.com',
                'role'            => 'department',
                'department'      => 'HR',
                'subdivision'     => 'Transportasi',
                'whatsapp_number' => '081234567112',
            ],

            // ── FASILITAS & SECURITY ───────────────────────────────────────────
            [
                'name'            => 'Joko Security',
                'staff_name'      => 'Joko Security',
                'email'           => 'joko.sec@telunas.com',
                'role'            => 'department',
                'department'      => 'Fasilitas',
                'subdivision'     => 'Security',
                'whatsapp_number' => '081234567113',
            ],

            // ── OE (OPERATIONAL EXCELLENCE) ────────────────────────────────────
            [
                'name'            => 'Hendra OE',
                'staff_name'      => 'Hendra OE',
                'email'           => 'hendra.oe@telunas.com',
                'role'            => 'department',
                'department'      => 'OE',
                'subdivision'     => 'OE',
                'whatsapp_number' => '081234567114',
            ],
        ];

        foreach ($newStaffAccounts as $account) {
            User::updateOrCreate(
                ['email' => $account['email']],
                array_merge($account, [
                    'password'        => $defaultPassword,
                    'is_active'       => true,
                    'approval_status' => 'approved',
                    'is_hod'          => false,
                    'hod_title'       => null,
                    'permissions'     => [
                        'can_view_all_departments' => false,
                        'can_manage_issues'        => true,
                        'can_export_reports'       => true,
                    ],
                ])
            );
        }
    }
}
