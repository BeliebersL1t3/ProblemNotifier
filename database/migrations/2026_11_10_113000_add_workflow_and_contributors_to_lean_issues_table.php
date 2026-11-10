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
        if (Schema::hasTable('lean_issues')) {
            Schema::table('lean_issues', function (Blueprint $table) {
                if (!Schema::hasColumn('lean_issues', 'initial_workers')) {
                    $table->json('initial_workers')->nullable()->after('claimed_at');
                }
                if (!Schema::hasColumn('lean_issues', 'progress_workers')) {
                    $table->json('progress_workers')->nullable()->after('initial_workers');
                }
                if (!Schema::hasColumn('lean_issues', 'active_workers')) {
                    $table->json('active_workers')->nullable()->after('progress_workers');
                }
                if (!Schema::hasColumn('lean_issues', 'contributors')) {
                    $table->json('contributors')->nullable()->after('active_workers');
                }
                if (!Schema::hasColumn('lean_issues', 'progress_logs')) {
                    $table->json('progress_logs')->nullable()->after('contributors');
                }
                if (!Schema::hasColumn('lean_issues', 'pending_reason')) {
                    $table->text('pending_reason')->nullable()->after('progress_logs');
                }
                if (!Schema::hasColumn('lean_issues', 'pending_since')) {
                    $table->timestamp('pending_since')->nullable()->after('pending_reason');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('lean_issues')) {
            Schema::table('lean_issues', function (Blueprint $table) {
                $cols = [
                    'pending_since',
                    'pending_reason',
                    'progress_logs',
                    'contributors',
                    'active_workers',
                    'progress_workers',
                    'initial_workers',
                ];
                foreach ($cols as $col) {
                    if (Schema::hasColumn('lean_issues', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }
    }
};

