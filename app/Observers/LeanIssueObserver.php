<?php

namespace App\Observers;

use App\Models\LeanIssue;
use App\Services\GoogleSheetsSyncService;
use Illuminate\Support\Facades\Log;

class LeanIssueObserver
{
    /**
     * Flag to prevent recursion or disable during bulk migrations/seeders.
     */
    public static bool $disabled = false;

    /**
     * Handle the LeanIssue "saved" event (created or updated).
     */
    public function saved(LeanIssue $issue): void
    {
        if (static::$disabled) {
            return;
        }

        // Avoid duplicate sync if soft-deleted (deleted event handles it)
        if ($issue->trashed()) {
            return;
        }

        $issueId = $issue->id;
        $this->dispatchSync($issueId, false, null);
    }

    /**
     * Handle the LeanIssue "deleted" event (soft delete).
     */
    public function deleted(LeanIssue $issue): void
    {
        if (static::$disabled) {
            return;
        }

        $issueId = $issue->id;
        $deletedBy = $issue->deleted_by_name ?? 'Supervisor';

        $this->dispatchSync($issueId, true, $deletedBy);
    }

    /**
     * Handle the LeanIssue "restored" event.
     */
    public function restored(LeanIssue $issue): void
    {
        if (static::$disabled) {
            return;
        }

        $issueId = $issue->id;
        $this->dispatchSync($issueId, false, null);
    }

    /**
     * Dispatch sync non-blocking after HTTP response is returned to user.
     */
    protected function dispatchSync(int $issueId, bool $isDeleted, ?string $deletedBy): void
    {
        dispatch(function () use ($issueId, $isDeleted, $deletedBy) {
            try {
                $target = LeanIssue::withTrashed()->find($issueId);
                if ($target) {
                    app(GoogleSheetsSyncService::class)->syncIssue($target, $isDeleted, $deletedBy);
                }
            } catch (\Throwable $e) {
                Log::warning("LeanIssueObserver: Auto-sync to Google Sheets failed for issue #{$issueId}: " . $e->getMessage());
            }
        })->afterResponse();
    }
}
