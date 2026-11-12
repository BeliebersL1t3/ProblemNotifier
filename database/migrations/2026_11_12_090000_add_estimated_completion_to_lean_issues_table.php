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
                if (!Schema::hasColumn('lean_issues', 'estimated_completion_at')) {
                    $table->timestamp('estimated_completion_at')->nullable()->after('pending_since');
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
                if (Schema::hasColumn('lean_issues', 'estimated_completion_at')) {
                    $table->dropColumn('estimated_completion_at');
                }
            });
        }
    }
};

