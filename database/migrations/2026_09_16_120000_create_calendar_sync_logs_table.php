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
        Schema::create('calendar_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->string('action'); // AUTO_SYNC, MANUAL_PULL, MANUAL_PUSH, RESTORE_TASK
            $table->string('performed_by')->default('System');
            $table->string('department')->nullable()->index();
            $table->string('task_id')->nullable();
            $table->string('task_title')->nullable();
            $table->string('status')->default('success'); // success, warning, failed
            $table->json('details')->nullable();
            $table->text('message')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('calendar_sync_logs');
    }
};
