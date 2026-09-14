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
        Schema::create('dashboard_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('department', 100)->nullable();
            $table->string('role_target', 50)->nullable(); // 'hod', 'admin', 'department_user'
            $table->string('type', 50); // 'ticket_request', 'ticket_approved', 'ticket_rejected', 'issue_progress'
            $table->string('title', 255);
            $table->text('message');
            $table->string('link', 255)->nullable();
            $table->boolean('is_read')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('dashboard_notifications');
    }
};
