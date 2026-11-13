<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Activate and approve all existing users
        DB::table('users')->whereNull('deleted_at')->update([
            'approval_status' => 'approved',
            'is_active'       => true,
            'is_hod'          => 0,
            'hod_title'       => null,
        ]);

        // 2. Resolve/approve all pending approval tickets so none are waiting
        if (Schema::hasTable('approval_tickets')) {
            DB::table('approval_tickets')->whereIn('status', ['pending_hod', 'pending_admin'])->update([
                'status' => 'approved',
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

