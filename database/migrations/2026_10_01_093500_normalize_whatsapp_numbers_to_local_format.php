<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            DB::statement("UPDATE users SET whatsapp_number = '0' || SUBSTR(whatsapp_number, 3) WHERE whatsapp_number LIKE '62%'");
            DB::statement("UPDATE approval_tickets SET requested_value = '0' || SUBSTR(requested_value, 3) WHERE type IN ('whatsapp_change', 'account_registration') AND requested_value LIKE '62%'");
            DB::statement("UPDATE approval_tickets SET current_value = '0' || SUBSTR(current_value, 3) WHERE type IN ('whatsapp_change', 'whatsapp_unlink') AND current_value LIKE '62%'");
        } else {
            DB::statement("UPDATE users SET whatsapp_number = CONCAT('0', SUBSTRING(whatsapp_number, 3)) WHERE whatsapp_number LIKE '62%'");
            DB::statement("UPDATE approval_tickets SET requested_value = CONCAT('0', SUBSTRING(requested_value, 3)) WHERE type IN ('whatsapp_change', 'account_registration') AND requested_value LIKE '62%'");
            DB::statement("UPDATE approval_tickets SET current_value = CONCAT('0', SUBSTRING(current_value, 3)) WHERE type IN ('whatsapp_change', 'whatsapp_unlink') AND current_value LIKE '62%'");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'sqlite') {
            DB::statement("UPDATE users SET whatsapp_number = '62' || SUBSTR(whatsapp_number, 2) WHERE whatsapp_number LIKE '0%'");
            DB::statement("UPDATE approval_tickets SET requested_value = '62' || SUBSTR(requested_value, 2) WHERE type IN ('whatsapp_change', 'account_registration') AND requested_value LIKE '0%'");
            DB::statement("UPDATE approval_tickets SET current_value = '62' || SUBSTR(current_value, 2) WHERE type IN ('whatsapp_change', 'whatsapp_unlink') AND current_value LIKE '0%'");
        } else {
            DB::statement("UPDATE users SET whatsapp_number = CONCAT('62', SUBSTRING(whatsapp_number, 2)) WHERE whatsapp_number LIKE '0%'");
            DB::statement("UPDATE approval_tickets SET requested_value = CONCAT('62', SUBSTRING(requested_value, 2)) WHERE type IN ('whatsapp_change', 'account_registration') AND requested_value LIKE '0%'");
            DB::statement("UPDATE approval_tickets SET current_value = CONCAT('62', SUBSTRING(current_value, 2)) WHERE type IN ('whatsapp_change', 'whatsapp_unlink') AND current_value LIKE '0%'");
        }
    }
};
