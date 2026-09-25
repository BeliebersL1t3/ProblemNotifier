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
        Schema::create('export_report_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('sender_name');
            $table->string('sender_email');
            $table->string('sender_department')->nullable();
            $table->string('report_type')->default('calendar'); // 'calendar', 'issues', etc.
            $table->json('recipients');
            $table->string('subject');
            $table->string('pdf_filename');
            $table->string('sent_via')->default('smtp'); // 'smtp', 'gmail_api'
            $table->string('status')->default('queued'); // 'queued', 'sent', 'failed'
            $table->text('error_message')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['status', 'created_at']);
            $table->index('report_type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('export_report_logs');
    }
};
