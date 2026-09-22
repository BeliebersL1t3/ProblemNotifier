<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportSchedule extends Model
{
    protected $fillable = [
        'user_id',
        'is_enabled',
        'report_format',
        'departments',
        'selected_statuses',
        'include_kpi_summary',
        'include_delay_timeline',
        'include_solution_notes',
        'include_audit_trail',
        'day_of_month',
        'dispatch_time',
        'last_dispatched_at',
        'last_dispatch_status',
        'last_dispatch_summary',
        'updated_by',
    ];

    protected $casts = [
        'is_enabled'             => 'boolean',
        'departments'            => 'array',
        'selected_statuses'      => 'array',
        'include_kpi_summary'    => 'boolean',
        'include_delay_timeline' => 'boolean',
        'include_solution_notes' => 'boolean',
        'include_audit_trail'    => 'boolean',
        'last_dispatched_at'     => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function updatedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Get or create a personal report schedule configuration for a specific user.
     */
    public static function getOrCreateForUser(User $user): self
    {
        $isAdmin = ($user->role === 'admin');
        $defaultDepartments = $isAdmin ? ['ALL'] : array_filter([$user->department ?: 'General']);

        return self::firstOrCreate(
            ['user_id' => $user->id],
            [
                'is_enabled'             => false, // Always default to OFF unless explicitly toggled ON by user
                'report_format'          => 'both', // 'pdf', 'excel', 'both'
                'departments'            => $defaultDepartments,
                'selected_statuses'      => ['solved', 'pending', 'progress', 'open'],
                'include_kpi_summary'    => true,
                'include_delay_timeline' => true,
                'include_solution_notes' => true,
                'include_audit_trail'    => false,
                'day_of_month'           => 1,
                'dispatch_time'          => '08:00',
                'updated_by'             => $user->id,
            ]
        );
    }
}
