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
        Schema::create('report_schedules', function (Blueprint $table) {
            $table->id();
            $table->boolean('is_enabled')->default(false);
            $table->unsignedTinyInteger('day_of_month')->default(1); // 1 to 28/31
            $table->string('dispatch_time', 10)->default('08:00'); // e.g. "08:00"
            $table->boolean('send_to_all_hods')->default(true);
            $table->boolean('send_to_admins')->default(true);
            $table->json('additional_recipients')->nullable();
            $table->boolean('include_delay_timeline')->default(true);
            $table->timestamp('last_dispatched_at')->nullable();
            $table->string('last_dispatch_status')->nullable(); // 'success', 'failed', 'partial'
            $table->text('last_dispatch_summary')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('report_schedules');
    }
};
