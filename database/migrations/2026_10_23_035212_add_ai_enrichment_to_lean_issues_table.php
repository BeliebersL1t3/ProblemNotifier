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
        Schema::table('lean_issues', function (Blueprint $table) {
            $table->string('ai_status', 30)->default('pending')->index()->after('status');
            $table->string('ai_category', 100)->nullable()->index()->after('ai_status');
            $table->string('ai_sub_category', 100)->nullable()->after('ai_category');
            $table->string('ai_urgency', 30)->nullable()->after('ai_sub_category');
            $table->boolean('ai_is_minimal')->default(false)->after('ai_urgency');
            $table->json('ai_analysis')->nullable()->after('ai_is_minimal');
            $table->timestamp('ai_processed_at')->nullable()->after('ai_analysis');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('lean_issues', function (Blueprint $table) {
            $table->dropIndex(['ai_status']);
            $table->dropIndex(['ai_category']);
            $table->dropColumn([
                'ai_status',
                'ai_category',
                'ai_sub_category',
                'ai_urgency',
                'ai_is_minimal',
                'ai_analysis',
                'ai_processed_at',
            ]);
        });
    }
};
