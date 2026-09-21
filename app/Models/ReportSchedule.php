<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportSchedule extends Model
{
    protected $fillable = [
        'is_enabled',
        'day_of_month',
        'dispatch_time',
        'send_to_all_hods',
        'send_to_admins',
        'additional_recipients',
        'include_delay_timeline',
        'last_dispatched_at',
        'last_dispatch_status',
        'last_dispatch_summary',
        'updated_by',
    ];

    protected $casts = [
        'is_enabled'             => 'boolean',
        'send_to_all_hods'       => 'boolean',
        'send_to_admins'         => 'boolean',
        'include_delay_timeline' => 'boolean',
        'additional_recipients'  => 'array',
        'last_dispatched_at'     => 'datetime',
    ];

    public function updatedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Get or create the singleton report schedule configuration.
     */
    public static function getOrCreateConfig(): self
    {
        return self::firstOrCreate(
            ['id' => 1],
            [
                'is_enabled'             => false,
                'day_of_month'           => 1,
                'dispatch_time'          => '08:00',
                'send_to_all_hods'       => true,
                'send_to_admins'         => true,
                'additional_recipients'  => [],
                'include_delay_timeline' => true,
            ]
        );
    }
}
