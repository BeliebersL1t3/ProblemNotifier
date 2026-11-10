<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LeanIssue extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'lean_issues';

    protected $fillable = [
        'location',
        'title',
        'description',
        'target_departments',
        'reporter_name',
        'reporter_dept',
        'reporter_phone',
        'image_url',
        'status',
        'department_accs',
        'claimed_by_name',
        'claimed_by_dept',
        'claimed_at',
        'resolved_by_name',
        'resolved_by_dept',
        'resolved_at',
        'resolution_note',
        'resolution_image_url',
        'ai_status',
        'ai_category',
        'ai_sub_category',
        'ai_urgency',
        'ai_is_minimal',
        'ai_analysis',
        'ai_processed_at',
        'deleted_by_name',
        'transfer_history',
        'initial_workers',
        'progress_workers',
        'active_workers',
        'contributors',
        'progress_logs',
        'pending_reason',
        'pending_since',
        'needs_sheets_sync',
        'sheets_synced_at',
        'sheets_sync_error',
    ];

    protected $casts = [
        'target_departments' => 'array',
        'department_accs'    => 'array',
        'transfer_history'   => 'array',
        'initial_workers'    => 'array',
        'progress_workers'   => 'array',
        'active_workers'     => 'array',
        'contributors'       => 'array',
        'progress_logs'      => 'array',
        'ai_analysis'        => 'array',
        'ai_is_minimal'      => 'boolean',
        'needs_sheets_sync'  => 'boolean',
        'claimed_at'         => 'datetime',
        'resolved_at'        => 'datetime',
        'ai_processed_at'    => 'datetime',
        'pending_since'      => 'datetime',
        'sheets_synced_at'   => 'datetime',
    ];

    protected static function booted(): void
    {
        static::saving(function (LeanIssue $issue) {
            $syncColumns = ['needs_sheets_sync', 'sheets_synced_at', 'sheets_sync_error'];
            $dirtyNonSyncKeys = array_diff(array_keys($issue->getDirty()), $syncColumns);

            if (!$issue->exists || !empty($dirtyNonSyncKeys)) {
                $issue->needs_sheets_sync = true;
            }
        });

        static::deleted(function (LeanIssue $issue) {
            if ($issue->exists && !$issue->isForceDeleting()) {
                $issue->needs_sheets_sync = true;
                static::withTrashed()->where('id', $issue->id)->update([
                    'needs_sheets_sync' => true,
                ]);
            }
        });

        static::restored(function (LeanIssue $issue) {
            if ($issue->exists) {
                $issue->needs_sheets_sync = true;
                static::withTrashed()->where('id', $issue->id)->update([
                    'needs_sheets_sync' => true,
                ]);
            }
        });
    }

    public function markSheetsSynced(): void
    {
        $now = now();
        $this->needs_sheets_sync = false;
        $this->sheets_synced_at = $now;
        $this->sheets_sync_error = null;

        if ($this->exists) {
            static::withTrashed()->where('id', $this->id)->update([
                'needs_sheets_sync' => false,
                'sheets_synced_at'  => $now,
                'sheets_sync_error' => null,
            ]);
        }
    }

    public function markSheetsSyncFailed(string $error): void
    {
        $truncatedError = mb_substr($error, 0, 1000);
        $this->needs_sheets_sync = true;
        $this->sheets_sync_error = $truncatedError;

        if ($this->exists) {
            static::withTrashed()->where('id', $this->id)->update([
                'needs_sheets_sync' => true,
                'sheets_sync_error' => $truncatedError,
            ]);
        }
    }

    /**
     * Normalize incoming workers (array or comma-separated string) into deduplicated names.
     */
    public static function normalizeWorkerList($workers): array
    {
        if (is_string($workers)) {
            $workers = explode(',', $workers);
        }
        if (!is_array($workers)) {
            return [];
        }

        $result = [];
        $seen = [];
        foreach ($workers as $w) {
            $trimmed = trim((string) $w);
            if ($trimmed === '') {
                continue;
            }
            $lower = mb_strtolower($trimmed);
            if (!isset($seen[$lower])) {
                $seen[$lower] = true;
                $result[] = $trimmed;
            }
        }

        return $result;
    }

    /**
     * Merge incoming contributor names into an existing array without duplicates.
     */
    public static function mergeUniqueNames(?array $existing, array $incoming): array
    {
        return self::normalizeWorkerList(array_merge($existing ?? [], $incoming));
    }

    /**
     * Append a structured entry to the issue's activity & progress timeline.
     */
    public function addProgressLog(string $type, string $actor, ?string $actorDept = null, ?string $message = null, array $meta = []): void
    {
        $logs = $this->progress_logs ?? [];
        $logs[] = array_merge([
            'id'         => uniqid('log_', true),
            'type'       => $type, // claim | progress | pending | transfer | resolved
            'actor'      => $actor,
            'actor_dept' => $actorDept,
            'message'    => $message,
            'created_at' => now('Asia/Jakarta')->toIso8601String(),
        ], $meta);

        $this->progress_logs = $logs;
    }
}

