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
        Schema::table('lean_issues', function (Blueprint $table) {
            // Resort identifier for map canvas ('TPI' or 'TBR')
            if (!Schema::hasColumn('lean_issues', 'map_resort')) {
                $table->string('map_resort', 10)->nullable()->after('location');
            }

            // Percentage X coordinate on the resort map (0.00% to 100.00%)
            if (!Schema::hasColumn('lean_issues', 'map_x')) {
                $table->decimal('map_x', 5, 2)->nullable()->after('map_resort');
            }

            // Percentage Y coordinate on the resort map (0.00% to 100.00%)
            if (!Schema::hasColumn('lean_issues', 'map_y')) {
                $table->decimal('map_y', 5, 2)->nullable()->after('map_x');
            }

            // Optional custom location label on map
            if (!Schema::hasColumn('lean_issues', 'map_label')) {
                $table->string('map_label', 100)->nullable()->after('map_y');
            }
        });

        // Add index for fast spatial queries
        try {
            Schema::table('lean_issues', function (Blueprint $table) {
                $table->index(['map_resort', 'status'], 'lean_issues_map_resort_status_idx');
            });
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::info('Skipping map_resort index creation: ' . $e->getMessage());
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('lean_issues', function (Blueprint $table) {
            try {
                $table->dropIndex('lean_issues_map_resort_status_idx');
            } catch (\Throwable $e) {
                // Ignore
            }

            $cols = array_filter([
                Schema::hasColumn('lean_issues', 'map_label') ? 'map_label' : null,
                Schema::hasColumn('lean_issues', 'map_y') ? 'map_y' : null,
                Schema::hasColumn('lean_issues', 'map_x') ? 'map_x' : null,
                Schema::hasColumn('lean_issues', 'map_resort') ? 'map_resort' : null,
            ]);

            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};
