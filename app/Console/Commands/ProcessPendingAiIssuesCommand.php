<?php

namespace App\Console\Commands;

use App\Models\LeanIssue;
use App\Services\GeminiIssueService;
use Illuminate\Console\Command;

class ProcessPendingAiIssuesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'ai:process-pending {--id= : Specific LeanIssue ID to analyze} {--limit=20 : Max number of pending issues to process}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Process pending lean issues for AI enrichment (Gemini Flash) with offline failsafe queue';

    /**
     * Execute the console command.
     */
    public function handle(GeminiIssueService $service): int
    {
        $specificId = $this->option('id');

        if ($specificId) {
            $issue = LeanIssue::find($specificId);
            if (!$issue) {
                $this->error("LeanIssue #{$specificId} not found.");
                return 1;
            }

            $this->info("Analyzing issue #{$issue->id} ('{$issue->title}')...");
            $success = $service->analyzeIssue($issue);

            if ($success) {
                $fresh = $issue->fresh();
                $this->info("✓ Success! Category: {$fresh->ai_category} | Sub: {$fresh->ai_sub_category} | Urgency: {$fresh->ai_urgency}");
                $this->line(json_encode($fresh->ai_analysis, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
                return 0;
            } else {
                $this->warn("⚠ Failed to analyze issue #{$issue->id}. Retained as pending for failsafe retry.");
                return 1;
            }
        }

        $limit = (int) $this->option('limit') ?: 20;
        $pendingCount = $service->getPendingCount();

        if ($pendingCount === 0) {
            $this->info("No pending issues in the AI queue. All up to date!");
            return 0;
        }

        $this->info("Found {$pendingCount} pending issues. Processing up to {$limit}...");
        $processed = $service->processPendingQueue($limit);

        $this->info("Completed processing {$processed} issues.");
        $remaining = $service->getPendingCount();

        if ($remaining > 0) {
            $this->warn("{$remaining} issues still pending in queue.");
        }

        return 0;
    }
}
