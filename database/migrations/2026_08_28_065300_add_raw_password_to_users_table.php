<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('raw_password')->nullable()->default('telunas123')->after('password');
        });

        \App\Models\User::query()->update(['raw_password' => 'telunas123']);
        // Also reset their hash back to telunas123 if it was altered by the test
        \App\Models\User::query()->update(['password' => \Illuminate\Support\Facades\Hash::make('telunas123')]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('raw_password');
        });
    }
};
