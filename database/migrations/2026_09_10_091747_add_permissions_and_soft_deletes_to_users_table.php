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
        Schema::table('users', function (Blueprint $table) {
            $table->json('permissions')->nullable()->after('whatsapp_number');
            $table->softDeletes()->after('updated_at');
        });

        // Seed default permissions for existing users
        $adminPermissions = [
            'can_view_all_departments' => true,
            'can_manage_issues'        => true,
            'can_delete_issues'        => true,
            'can_access_analytics'     => true,
            'can_access_calendar'      => true,
            'can_export_reports'       => true,
            'can_manage_categories'    => true,
        ];

        $deptPermissions = [
            'can_view_all_departments' => true,
            'can_manage_issues'        => true,
            'can_delete_issues'        => false,
            'can_access_analytics'     => true,
            'can_access_calendar'      => true,
            'can_export_reports'       => true,
            'can_manage_categories'    => false,
        ];

        \App\Models\User::where('role', 'admin')->update(['permissions' => json_encode($adminPermissions)]);
        \App\Models\User::where('role', '!=', 'admin')->update(['permissions' => json_encode($deptPermissions)]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('permissions');
            $table->dropSoftDeletes();
        });
    }
};
