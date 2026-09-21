<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Clear legacy singleton row if any
        DB::table('report_schedules')->delete();

        Schema::table('report_schedules', function (Blueprint $table) {
            $table->foreignId('user_id')->after('id')->constrained('users')->cascadeOnDelete();
            $table->json('departments')->nullable()->after('is_enabled');
            $table->unique('user_id');
        });

        Schema::table('report_schedules', function (Blueprint $table) {
            $columnsToDrop = [];
            if (Schema::hasColumn('report_schedules', 'send_to_all_hods')) {
                $columnsToDrop[] = 'send_to_all_hods';
            }
            if (Schema::hasColumn('report_schedules', 'send_to_admins')) {
                $columnsToDrop[] = 'send_to_admins';
            }
            if (Schema::hasColumn('report_schedules', 'additional_recipients')) {
                $columnsToDrop[] = 'additional_recipients';
            }
            if (!empty($columnsToDrop)) {
                $table->dropColumn($columnsToDrop);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('report_schedules', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->dropUnique(['user_id']);
            $table->dropColumn(['user_id', 'departments']);
            $table->boolean('send_to_all_hods')->default(true);
            $table->boolean('send_to_admins')->default(true);
            $table->json('additional_recipients')->nullable();
        });
    }
};
