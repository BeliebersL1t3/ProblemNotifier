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
        DB::table('users')->where('is_hod', 1)->update([
            'is_hod'    => 0,
            'hod_title' => null,
        ]);

        DB::table('users')->where('approval_status', 'pending_hod')->update([
            'approval_status' => 'pending_admin',
        ]);

        if (\Illuminate\Support\Facades\Schema::hasTable('approval_tickets')) {
            DB::table('approval_tickets')->where('status', 'pending_hod')->update([
                'status' => 'pending_admin',
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op for safety
    }
};

