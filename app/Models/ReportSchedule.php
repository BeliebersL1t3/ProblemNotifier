<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportSchedule extends Model
{
    protected $fillable = [
        'user_id',
        'is_enabled',
        'departments',
        'day_of_month',
        'dispatch_time',
        'include_delay_timeline',
        'last_dispatched_at',
        'last_dispatch_status',
        'last_dispatch_summary',
        'updated_by',
    ];

    protected $casts = [
        'is_enabled'             => 'boolean',
        'departments'            => 'array',
        'include_delay_timeline' => 'boolean',
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
                'is_enabled'             => false,
                'departments'            => $defaultDepartments,
                'day_of_month'           => 1,
                'dispatch_time'          => '08:00',
                'include_delay_timeline' => true,
                'updated_by'             => $user->id,
            ]
        );
    }
}
