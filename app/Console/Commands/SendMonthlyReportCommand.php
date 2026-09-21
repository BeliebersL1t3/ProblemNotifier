<?php

namespace App\Console\Commands;

use App\Models\ReportSchedule;
use App\Models\User;
use App\Services\MonthlyReportService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SendMonthlyReportCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'report:send-monthly 
                            {--force : Bypass schedule date and is_enabled checks}
                            {--user= : User ID or email to dispatch test report to}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Generate and dispatch scheduled monthly PDF operations report to Admins and HODs.';

    /**
     * Execute the console command.
     */
    public function handle(MonthlyReportService $reportService): int
    {
        $this->info('Checking monthly report dispatch schedule...');

        $schedule = ReportSchedule::getOrCreateConfig();
        $isForce = (bool) $this->option('force');
        $targetUserParam = $this->option('user');

        $testUser = null;
        if ($targetUserParam) {
            $testUser = is_numeric($targetUserParam)
                ? User::find($targetUserParam)
                : User::where('email', $targetUserParam)->first();

            if (!$testUser) {
                $this->error("User [{$targetUserParam}] not found.");
                return self::FAILURE;
            }
        }

        // Verify scheduled day of month if not forced and not a test run
        if (!$isForce && !$testUser) {
            if (!$schedule->is_enabled) {
                $this->line('Automated monthly reports are disabled.');
                return self::SUCCESS;
            }

            $currentDay = (int) Carbon::now()->day;
            if ($currentDay !== (int) $schedule->day_of_month) {
                $this->line("Today is day {$currentDay}, but schedule is set for day {$schedule->day_of_month}. Skipping.");
                return self::SUCCESS;
            }
        }

        $this->info('Starting monthly report generation and dispatch...');
        $results = $reportService->runMonthlyDispatch(force: $isForce, testUser: $testUser);

        if (!empty($results['errors'])) {
            foreach ($results['errors'] as $err) {
                $this->warn("Warning: {$err}");
            }
        }

        $this->info("Completed. Total reports dispatched: {$results['dispatched_count']}");

        return self::SUCCESS;
    }
}
