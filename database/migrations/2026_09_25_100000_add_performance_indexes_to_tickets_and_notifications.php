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
        Schema::table('approval_tickets', function (Blueprint $table) {
            $table->index(['status', 'department'], 'idx_tickets_status_dept');
            $table->index(['user_id', 'status'], 'idx_tickets_user_status');
            $table->index('type', 'idx_tickets_type');
        });

        Schema::table('dashboard_notifications', function (Blueprint $table) {
            $table->index(['user_id', 'is_read'], 'idx_notifs_user_is_read');
            $table->index(['department', 'role_target', 'is_read'], 'idx_notifs_dept_role_is_read');
            $table->index('created_at', 'idx_notifs_created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('approval_tickets', function (Blueprint $table) {
            $table->dropIndex('idx_tickets_status_dept');
            $table->dropIndex('idx_tickets_user_status');
            $table->dropIndex('idx_tickets_type');
        });

        Schema::table('dashboard_notifications', function (Blueprint $table) {
            $table->dropIndex('idx_notifs_user_is_read');
            $table->dropIndex('idx_notifs_dept_role_is_read');
            $table->dropIndex('idx_notifs_created_at');
        });
    }
};
