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
        Schema::create('approval_tickets', function (Blueprint $table) {
            $table->id();
            $table->string('ticket_number', 50)->unique();
            $table->string('type', 40); // 'account_registration', 'whatsapp_change', 'whatsapp_unlink', 'password_reset'
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('department', 100);
            $table->string('subdivision', 100)->nullable();
            $table->string('staff_name', 255);
            $table->string('email', 255)->nullable();
            $table->string('current_value', 255)->nullable();   // e.g. old whatsapp number
            $table->string('requested_value', 255)->nullable(); // e.g. new whatsapp number or temp new password hash
            $table->text('reason')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->string('status', 30)->default('pending_hod'); // 'pending_hod', 'pending_admin', 'approved', 'rejected', 'cancelled'
            
            // HOD Review
            $table->foreignId('hod_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('hod_notes')->nullable();
            $table->timestamp('hod_reviewed_at')->nullable();

            // Admin Review
            $table->foreignId('admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('admin_notes')->nullable();
            $table->timestamp('admin_reviewed_at')->nullable();

            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('approval_tickets');
    }
};
