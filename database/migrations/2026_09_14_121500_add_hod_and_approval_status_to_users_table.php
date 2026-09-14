<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_hod')->default(false)->after('role');
            $table->string('hod_title', 100)->nullable()->after('is_hod');
            $table->string('approval_status', 30)->default('approved')->after('hod_title'); // 'pending_hod', 'pending_admin', 'approved', 'rejected'
            $table->boolean('is_active')->default(true)->after('approval_status');
            $table->text('rejection_reason')->nullable()->after('is_active');
            $table->string('rejected_by', 50)->nullable()->after('rejection_reason'); // 'HOD', 'Admin'
            $table->timestamp('rejected_at')->nullable()->after('rejected_by');
            $table->boolean('notify_whatsapp_tickets')->default(true)->after('rejected_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'is_hod',
                'hod_title',
                'approval_status',
                'is_active',
                'rejection_reason',
                'rejected_by',
                'rejected_at',
                'notify_whatsapp_tickets',
            ]);
        });
    }
};
