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
            if (!Schema::hasColumn('lean_issues', 'transfer_history')) {
                $table->json('transfer_history')->nullable()->after('department_accs');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('lean_issues', function (Blueprint $table) {
            if (Schema::hasColumn('lean_issues', 'transfer_history')) {
                $table->dropColumn('transfer_history');
            }
        });
    }
};
