<?php

namespace Database\Seeders;

use App\Models\ApprovalTicket;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class ApprovalTicketSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $admin = User::where('role', 'admin')->first();
        $adminId = $admin ? $admin->id : 1;

        $hodGR = User::where('department', 'GR')->where('is_hod', true)->first();
        $hodHR = User::where('department', 'HR')->where('is_hod', true)->first();
        $hodIT = User::where('department', 'IT')->where('is_hod', true)->first();
        $hodProc = User::where('department', 'Procurement')->where('is_hod', true)->first();

        $userDani = User::where('name', 'Dani IT')->first();
        $userLia = User::where('name', 'Lia Bar')->first();
        $userBudiProc = User::where('name', 'Budi Procurement')->first();
        $userSitiHK = User::where('name', 'Siti HK')->first();
        $userRickyKitchen = User::where('name', 'Ricky Kitchen')->first();
        $userIwanFin = User::where('name', 'Iwan Finance')->first();
        $userSariSpa = User::where('name', 'Sari Spa')->first();

        $tickets = [
            // 1. Pending HOD - Account Registration (GR)
            [
                'ticket_number' => 'REG-20260914-0101',
                'type' => 'account_registration',
                'status' => 'pending_hod',
                'user_id' => null,
                'department' => 'GR',
                'subdivision' => 'Service',
                'staff_name' => 'Rian Pratama',
                'email' => 'rian.service@telunasresorts.com',
                'current_value' => null,
                'requested_value' => '6281234567801',
                'reason' => 'Pendaftaran staf baru Food & Beverage / Guest Relations Telunas Private Island.',
                'created_at' => now()->subHours(4),
                'updated_at' => now()->subHours(4),
            ],

            // 2. Pending HOD - WhatsApp Change (IT)
            [
                'ticket_number' => 'WA-20260914-0102',
                'type' => 'whatsapp_change',
                'status' => 'pending_hod',
                'user_id' => $userDani ? $userDani->id : null,
                'department' => 'IT',
                'subdivision' => 'Network',
                'staff_name' => $userDani ? $userDani->name : 'Dani IT',
                'email' => $userDani ? $userDani->email : 'dani.it@telunasresorts.com',
                'current_value' => '6281298765432',
                'requested_value' => '6285211223344',
                'reason' => 'Nomor WhatsApp lama hilang bersama kartu SIM, mengajukan penggantian ke nomor operasional baru.',
                'created_at' => now()->subHours(6),
                'updated_at' => now()->subHours(6),
            ],

            // 3. Pending Admin - Account Registration (HR / Transportasi) - Approved by HOD
            [
                'ticket_number' => 'REG-20260914-0103',
                'type' => 'account_registration',
                'status' => 'pending_admin',
                'user_id' => null,
                'department' => 'HR',
                'subdivision' => 'Transportasi',
                'staff_name' => 'Doni Tekong',
                'email' => 'doni.tekong@telunasresorts.com',
                'current_value' => null,
                'requested_value' => '6281355443322',
                'reason' => 'Staf baru divisi Transportasi Laut (Boat Captain Telunas).',
                'hod_id' => $hodHR ? $hodHR->id : null,
                'hod_notes' => 'Data identitas dan sertifikat kecakapan kapal telah diverifikasi lengkap. Mohon ACC final admin.',
                'hod_reviewed_at' => now()->subHours(2),
                'created_at' => now()->subHours(10),
                'updated_at' => now()->subHours(2),
            ],

            // 4. Pending Admin - WhatsApp Unlink (GR / Bar) - Approved by HOD
            [
                'ticket_number' => 'WA-20260914-0104',
                'type' => 'whatsapp_unlink',
                'status' => 'pending_admin',
                'user_id' => $userLia ? $userLia->id : null,
                'department' => 'GR',
                'subdivision' => 'Bar',
                'staff_name' => $userLia ? $userLia->name : 'Lia Bar',
                'email' => $userLia ? $userLia->email : 'lia.bar@telunasresorts.com',
                'current_value' => '6281244332211',
                'requested_value' => null,
                'reason' => 'Ingin melepas nomor WhatsApp pribadi dari notifikasi bot sementara waktu.',
                'hod_id' => $hodGR ? $hodGR->id : null,
                'hod_notes' => 'Disetujui. Staf akan menggunakan Web Dashboard untuk pemantauan.',
                'hod_reviewed_at' => now()->subHours(1),
                'created_at' => now()->subHours(8),
                'updated_at' => now()->subHours(1),
            ],

            // 5. Pending Admin - Password Reset (Procurement) - Approved by HOD
            [
                'ticket_number' => 'PWD-20260914-0105',
                'type' => 'password_reset',
                'status' => 'pending_admin',
                'user_id' => $userBudiProc ? $userBudiProc->id : null,
                'department' => 'Procurement',
                'subdivision' => 'Purchasing',
                'staff_name' => $userBudiProc ? $userBudiProc->name : 'Budi Procurement',
                'email' => $userBudiProc ? $userBudiProc->email : 'budi.proc@telunasresorts.com',
                'current_value' => null,
                'requested_value' => Hash::make('Telunas2026!'),
                'reason' => 'Lupa kata sandi akun setelah pergantian laptop kantor.',
                'hod_id' => $hodProc ? $hodProc->id : null,
                'hod_notes' => 'Telah dikonfirmasi secara lisan dan fisik di kantor purchasing.',
                'hod_reviewed_at' => now()->subMinutes(45),
                'created_at' => now()->subHours(3),
                'updated_at' => now()->subMinutes(45),
            ],

            // 6. Approved - Account Registration (HK) - Fully ACC by HOD & Admin
            [
                'ticket_number' => 'REG-20260911-0106',
                'type' => 'account_registration',
                'status' => 'approved',
                'user_id' => $userSitiHK ? $userSitiHK->id : null,
                'department' => 'HK',
                'subdivision' => 'Housekeeping',
                'staff_name' => $userSitiHK ? $userSitiHK->name : 'Siti HK',
                'email' => $userSitiHK ? $userSitiHK->email : 'siti.hk@telunasresorts.com',
                'current_value' => null,
                'requested_value' => '6281122334455',
                'reason' => 'Registrasi staf Housekeeping Villa Overwater Telunas Resorts.',
                'hod_id' => $hodHR ? $hodHR->id : null,
                'hod_notes' => 'Verifikasi HOD disetujui.',
                'hod_reviewed_at' => now()->subDays(2),
                'admin_id' => $adminId,
                'admin_notes' => 'Akun telah diaktivasi dan nomor WhatsApp telah terhubung ke bot.',
                'admin_reviewed_at' => now()->subDays(2)->addHours(1),
                'created_at' => now()->subDays(3),
                'updated_at' => now()->subDays(2)->addHours(1),
            ],

            // 7. Approved - WhatsApp Change (Kitchen) - Fully ACC
            [
                'ticket_number' => 'WA-20260912-0107',
                'type' => 'whatsapp_change',
                'status' => 'approved',
                'user_id' => $userRickyKitchen ? $userRickyKitchen->id : null,
                'department' => 'Kitchen',
                'subdivision' => 'Hot Kitchen',
                'staff_name' => $userRickyKitchen ? $userRickyKitchen->name : 'Ricky Kitchen',
                'email' => $userRickyKitchen ? $userRickyKitchen->email : 'ricky.kitchen@telunasresorts.com',
                'current_value' => '6281988776655',
                'requested_value' => '6281911223344',
                'reason' => 'Upgrade nomor WhatsApp untuk koordinasi inventaris dapur.',
                'hod_id' => $hodHR ? $hodHR->id : null,
                'hod_notes' => 'Disetujui untuk kelancaran tugas Kitchen.',
                'hod_reviewed_at' => now()->subDay(),
                'admin_id' => $adminId,
                'admin_notes' => 'Nomor bot WhatsApp berhasil diperbarui.',
                'admin_reviewed_at' => now()->subDay()->addHours(2),
                'created_at' => now()->subDays(2),
                'updated_at' => now()->subDay()->addHours(2),
            ],

            // 8. Rejected - Account Registration (Kitchen) - Rejected by HOD
            [
                'ticket_number' => 'REG-20260912-0108',
                'type' => 'account_registration',
                'status' => 'rejected',
                'user_id' => null,
                'department' => 'Kitchen',
                'subdivision' => 'Pastry',
                'staff_name' => 'Agus Magang',
                'email' => 'agus.intern@telunasresorts.com',
                'current_value' => null,
                'requested_value' => '6289988776655',
                'reason' => 'Pendaftaran akun staf magang pastry.',
                'rejection_reason' => 'Masa magang belum dimulai secara resmi dan belum ada persetujuan Head of Kitchen.',
                'hod_id' => $hodHR ? $hodHR->id : null,
                'hod_notes' => 'Ditolak atas arahan Head Chef.',
                'hod_reviewed_at' => now()->subDays(1),
                'created_at' => now()->subDays(2),
                'updated_at' => now()->subDays(1),
            ],

            // 9. Rejected - WhatsApp Change (Finance) - Rejected by Admin
            [
                'ticket_number' => 'WA-20260913-0109',
                'type' => 'whatsapp_change',
                'status' => 'rejected',
                'user_id' => $userIwanFin ? $userIwanFin->id : null,
                'department' => 'Finance',
                'subdivision' => 'Accounting',
                'staff_name' => $userIwanFin ? $userIwanFin->name : 'Iwan Finance',
                'email' => $userIwanFin ? $userIwanFin->email : 'iwan.fin@telunasresorts.com',
                'current_value' => '6281177665544',
                'requested_value' => '6281233221100',
                'reason' => 'Ganti nomor telepon WhatsApp.',
                'rejection_reason' => 'Nomor WhatsApp yang diajukan terdaftar atas nama staf lain di database resort.',
                'admin_id' => $adminId,
                'admin_notes' => 'Silakan gunakan nomor kartu SIM pribadi milik Anda sendiri.',
                'admin_reviewed_at' => now()->subHours(12),
                'created_at' => now()->subDays(1),
                'updated_at' => now()->subHours(12),
            ],

            // 10. Pending HOD - Password Reset (GR / Spa)
            [
                'ticket_number' => 'PWD-20260914-0110',
                'type' => 'password_reset',
                'status' => 'pending_hod',
                'user_id' => $userSariSpa ? $userSariSpa->id : null,
                'department' => 'GR',
                'subdivision' => 'Spa',
                'staff_name' => $userSariSpa ? $userSariSpa->name : 'Sari Spa',
                'email' => $userSariSpa ? $userSariSpa->email : 'sari.spa@telunasresorts.com',
                'current_value' => null,
                'requested_value' => Hash::make('Telunas2026!'),
                'reason' => 'Akun terkunci setelah beberapa kali salah input kata sandi di tablet kasir Spa.',
                'created_at' => now()->subMinutes(30),
                'updated_at' => now()->subMinutes(30),
            ],
        ];

        foreach ($tickets as $t) {
            ApprovalTicket::updateOrCreate(
                ['ticket_number' => $t['ticket_number']],
                $t
            );
        }
    }
}
