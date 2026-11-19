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
            if (!Schema::hasColumn('lean_issues', 'client_uuid')) {
                $table->string('client_uuid', 64)->nullable()->unique()->after('id');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('lean_issues', function (Blueprint $table) {
            if (Schema::hasColumn('lean_issues', 'client_uuid')) {
                $table->dropUnique(['client_uuid']);
                $table->dropColumn('client_uuid');
            }
        });
    }
};
