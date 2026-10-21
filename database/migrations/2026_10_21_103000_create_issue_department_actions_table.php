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
        Schema::create('issue_department_actions', function (Blueprint $table) {
            $table->id();
            $table->string('issue_id', 64)->index();
            $table->string('department', 100);
            $table->foreignId('ready_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('ready_by_name')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->foreignId('solved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('solved_by_name')->nullable();
            $table->timestamp('solved_at')->nullable();
            $table->text('action_note')->nullable();
            $table->text('proof_image')->nullable();
            $table->foreignId('pending_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('pending_by_name')->nullable();
            $table->text('pending_reason')->nullable();
            $table->timestamp('pending_at')->nullable();
            $table->timestamps();

            $table->index(['issue_id', 'department']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('issue_department_actions');
    }
};
