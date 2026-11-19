<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lean_issues', function (Blueprint $table) {
            if (!Schema::hasColumn('lean_issues', 'last_progress_at')) {
                $table->timestamp('last_progress_at')->nullable()->after('pending_since');
            }
            if (!Schema::hasColumn('lean_issues', 'group_escalated_at')) {
                $table->timestamp('group_escalated_at')->nullable()->after('last_progress_at');
            }
            if (!Schema::hasColumn('lean_issues', 'owner_escalated_at')) {
                $table->timestamp('owner_escalated_at')->nullable()->after('group_escalated_at');
            }
            if (!Schema::hasColumn('lean_issues', 'escalation_group_count')) {
                $table->unsignedInteger('escalation_group_count')->default(0)->after('owner_escalated_at');
            }
            if (!Schema::hasColumn('lean_issues', 'escalation_owner_count')) {
                $table->unsignedInteger('escalation_owner_count')->default(0)->after('escalation_group_count');
            }
        });

        // Index for fast per-minute scheduler escalation queries
        try {
            Schema::table('lean_issues', function (Blueprint $table) {
                $table->index(['status', 'last_progress_at'], 'lean_issues_status_last_progress_idx');
            });
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::info('Skipping lean_issues_status_last_progress_idx creation: ' . $e->getMessage());
        }

        // Backfill existing rows cleanly and mark legacy stale tickets as already escalated
        // so enabling the scheduler never floods WhatsApp with alerts for old tickets.
        $now = Carbon::now();
        $oneHourAgo = $now->copy()->subMinutes(60);
        $threeHoursAgo = $now->copy()->subMinutes(180);

        DB::table('lean_issues')
            ->select(['id', 'status', 'created_at', 'updated_at', 'claimed_at', 'pending_since', 'resolved_at'])
            ->orderBy('id')
            ->chunkById(200, function ($rows) use ($now, $oneHourAgo, $threeHoursAgo) {
                foreach ($rows as $row) {
                    $anchorRaw = $row->resolved_at
                        ?: ($row->pending_since
                            ?: ($row->claimed_at
                                ?: ($row->updated_at ?: $row->created_at)));

                    $anchor = $anchorRaw ? Carbon::parse($anchorRaw) : $now->copy();
                    $update = [
                        'last_progress_at' => $anchor,
                    ];

                    if (in_array($row->status, ['open', 'in_progress'], true)) {
                        if ($anchor->lte($oneHourAgo)) {
                            $update['group_escalated_at'] = $now;
                        }
                        if ($anchor->lte($threeHoursAgo)) {
                            $update['owner_escalated_at'] = $now;
                        }
                    }

                    DB::table('lean_issues')->where('id', $row->id)->update($update);
                }
            });
    }

    public function down(): void
    {
        try {
            Schema::table('lean_issues', function (Blueprint $table) {
                $table->dropIndex('lean_issues_status_last_progress_idx');
            });
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::info('Skipping lean_issues_status_last_progress_idx drop: ' . $e->getMessage());
        }

        Schema::table('lean_issues', function (Blueprint $table) {
            $cols = array_filter([
                'last_progress_at',
                'group_escalated_at',
                'owner_escalated_at',
                'escalation_group_count',
                'escalation_owner_count',
            ], fn (string $col) => Schema::hasColumn('lean_issues', $col));

            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};
