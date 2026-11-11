<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\TicketNotificationService;
use Illuminate\Console\Command;

class TelunasSetWhatsappCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'telunas:set-whatsapp
                            {email : Email akun user yang akan didaftarkan nomor WhatsApp-nya}
                            {phone? : Nomor WhatsApp (08xx / 628xx), gunakan --clear untuk menghapus}
                            {--clear : Kosongkan nomor WhatsApp dari akun ini}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Daftarkan atau perbarui nomor WhatsApp akun untuk login OTP 2-tahap dan tagging isu';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $email = mb_strtolower(trim((string) $this->argument('email')));
        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();

        if (!$user) {
            $this->error("Akun dengan email '{$email}' tidak ditemukan.");
            return self::FAILURE;
        }

        if ($this->option('clear')) {
            $user->whatsapp_number = null;
            $user->save();

            $this->warn("Nomor WhatsApp untuk {$user->name} ({$user->email}) telah dikosongkan.");
            return self::SUCCESS;
        }

        $rawPhone = trim((string) $this->argument('phone'));
        if ($rawPhone === '') {
            $this->error('Parameter nomor WhatsApp wajib diisi (kecuali memakai opsi --clear).');
            return self::FAILURE;
        }

        $digits = preg_replace('/[^0-9]/', '', $rawPhone);
        if (str_starts_with($digits, '62')) {
            $localPhone = '0' . substr($digits, 2);
        } elseif (str_starts_with($digits, '8')) {
            $localPhone = '0' . $digits;
        } else {
            $localPhone = $digits;
        }

        if (!TicketNotificationService::isValidIndonesianMobile($localPhone)) {
            $this->error("Format nomor '{$rawPhone}' tidak valid. Gunakan nomor seluler Indonesia 08xx (10-13 digit).");
            return self::FAILURE;
        }

        $canonical62 = '62' . substr($localPhone, 1);
        $conflict = User::where('id', '!=', $user->id)
            ->whereIn('whatsapp_number', [$localPhone, $canonical62])
            ->first();

        if ($conflict) {
            $this->error("Nomor WhatsApp {$localPhone} sudah digunakan oleh akun lain ({$conflict->email}).");
            return self::FAILURE;
        }

        $user->whatsapp_number = $localPhone;
        $user->save();

        $this->info("Nomor WhatsApp untuk {$user->name} ({$user->email}) berhasil diatur ke: {$localPhone}");
        return self::SUCCESS;
    }
}

