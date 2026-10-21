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
        Schema::create('issue_discussions', function (Blueprint $table) {
            $table->id();
            $table->string('issue_id', 64)->index();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('sender_name', 255);
            $table->string('sender_role_badge', 100);
            $table->text('message');
            $table->text('attachment_url')->nullable();
            $table->boolean('is_whatsapp_dispatched')->default(false);
            $table->boolean('is_system_event')->default(false);
            $table->timestamps();

            $table->index(['issue_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('issue_discussions');
    }
};
