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
        Schema::table('report_schedules', function (Blueprint $table) {
            $table->string('report_format', 20)->default('both')->after('is_enabled'); // 'pdf', 'excel', 'both'
            $table->json('selected_statuses')->nullable()->after('departments'); // ['solved', 'pending', 'progress', 'open']
            $table->boolean('include_kpi_summary')->default(true)->after('selected_statuses');
            $table->boolean('include_solution_notes')->default(true)->after('include_delay_timeline');
            $table->boolean('include_audit_trail')->default(false)->after('include_solution_notes');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('report_schedules', function (Blueprint $table) {
            $table->dropColumn([
                'report_format',
                'selected_statuses',
                'include_kpi_summary',
                'include_solution_notes',
                'include_audit_trail',
            ]);
        });
    }
};
