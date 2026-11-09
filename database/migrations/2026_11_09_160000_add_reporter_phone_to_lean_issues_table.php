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
        if (Schema::hasTable('lean_issues') && !Schema::hasColumn('lean_issues', 'reporter_phone')) {
            Schema::table('lean_issues', function (Blueprint $table) {
                $table->string('reporter_phone', 30)->nullable()->after('reporter_dept');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('lean_issues') && Schema::hasColumn('lean_issues', 'reporter_phone')) {
            Schema::table('lean_issues', function (Blueprint $table) {
                $table->dropColumn('reporter_phone');
            });
        }
    }
};
