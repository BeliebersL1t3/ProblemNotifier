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
        Schema::create('lean_issues', function (Blueprint $table) {
            $table->id();
            $table->string('location', 100);
            $table->string('title', 255);
            $table->text('description')->nullable();
            $table->json('target_departments')->nullable(); // e.g. ["Engineer", "HK"]
            $table->string('reporter_name', 100);
            $table->string('reporter_dept', 100)->nullable();
            $table->string('image_url', 500)->nullable();
            
            // Status: open | in_progress | resolved
            $table->string('status', 30)->default('open');
            
            // Per-department ACC / readiness tracking (non-blocking)
            // e.g. {"Engineer": {"is_acc": true, "acc_by": "Budi", "acc_at": "..."}, "HK": {"is_acc": false}}
            $table->json('department_accs')->nullable();

            // Claim / In Progress
            $table->string('claimed_by_name', 100)->nullable();
            $table->string('claimed_by_dept', 100)->nullable();
            $table->timestamp('claimed_at')->nullable();

            // Resolution / Done
            $table->string('resolved_by_name', 100)->nullable();
            $table->string('resolved_by_dept', 100)->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->text('resolution_note')->nullable();
            $table->string('resolution_image_url', 500)->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lean_issues');
    }
};
