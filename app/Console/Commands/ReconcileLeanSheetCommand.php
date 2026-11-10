<?php

namespace App\Console\Commands;

use App\Services\LeanSheetDirectService;
use Illuminate\Console\Command;

class ReconcileLeanSheetCommand extends Command
{
    protected $signature = 'lean:reconcile-sheets {--limit=50 : Max pending rows to reconcile per run}';
    protected $description = 'Self-healing reconciliation for pending SQL-to-Sheets changes in Lean Issue Tracker';

    public function handle(LeanSheetDirectService $service): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $result = $service->reconcilePendingIssues($limit);

        if (!empty($result['skipped'])) {
            $this->line('Skipped: ' . ($result['reason'] ?? 'Already running'));
            return Command::SUCCESS;
        }

        $this->info("Lean Sheets Reconcile: synced={$result['synced']}, failed={$result['failed']}, remaining={$result['remaining']}");

        return ($result['failed'] === 0) ? Command::SUCCESS : Command::FAILURE;
    }
}
