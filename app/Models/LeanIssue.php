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
        'needs_sheets_sync',
        'sheets_synced_at',
        'sheets_sync_error',
    ];

    protected $casts = [
        'target_departments' => 'array',
        'department_accs'    => 'array',
        'transfer_history'   => 'array',
        'ai_analysis'        => 'array',
        'ai_is_minimal'      => 'boolean',
        'needs_sheets_sync'  => 'boolean',
        'claimed_at'         => 'datetime',
        'resolved_at'        => 'datetime',
        'ai_processed_at'    => 'datetime',
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
}
