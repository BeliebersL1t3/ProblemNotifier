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
                if (!Schema::hasColumn('lean_issues', 'needs_sheets_sync')) {
                    $table->boolean('needs_sheets_sync')->default(true)->after('deleted_by_name');
                    $table->index('needs_sheets_sync', 'lean_issues_needs_sheets_sync_idx');
                }
                if (!Schema::hasColumn('lean_issues', 'sheets_synced_at')) {
                    $table->timestamp('sheets_synced_at')->nullable()->after('needs_sheets_sync');
                }
                if (!Schema::hasColumn('lean_issues', 'sheets_sync_error')) {
                    $table->text('sheets_sync_error')->nullable()->after('sheets_synced_at');
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
                if (Schema::hasColumn('lean_issues', 'sheets_sync_error')) {
                    $table->dropColumn('sheets_sync_error');
                }
                if (Schema::hasColumn('lean_issues', 'sheets_synced_at')) {
                    $table->dropColumn('sheets_synced_at');
                }
                if (Schema::hasColumn('lean_issues', 'needs_sheets_sync')) {
                    $table->dropIndex('lean_issues_needs_sheets_sync_idx');
                    $table->dropColumn('needs_sheets_sync');
                }
            });
        }
    }
};
