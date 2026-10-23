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
            $table->string('deleted_by_name', 100)->nullable()->after('deleted_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('lean_issues', function (Blueprint $table) {
            $table->dropColumn('deleted_by_name');
        });
    }
};
