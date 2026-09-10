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
        Schema::create('user_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('admin_name')->nullable();
            $table->unsignedBigInteger('target_user_id')->nullable()->index();
            $table->string('target_user_name')->nullable();
            $table->string('action'); // USER_CREATED, PERMISSIONS_UPDATED, ROLE_CHANGED, PASSWORD_RESET, USER_ARCHIVED, USER_RESTORED
            $table->json('changes')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_audit_logs');
    }
};
