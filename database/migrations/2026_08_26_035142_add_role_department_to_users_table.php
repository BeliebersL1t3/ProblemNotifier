<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // 'admin' or 'department'
            $table->string('role')->default('department')->after('email');
            // Consolidated parent department e.g. 'HR', 'GR', 'HK', 'Fasilitas'
            $table->string('department')->nullable()->after('role');
            // Sub-division e.g. 'Legal', 'Bar', 'Pest Control' (null for standalone depts)
            $table->string('subdivision')->nullable()->after('department');
            // Display name used in claim/report forms e.g. 'Hendro Legal'
            $table->string('staff_name')->nullable()->after('subdivision');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['role', 'department', 'subdivision', 'staff_name']);
        });
    }
};
