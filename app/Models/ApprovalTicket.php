<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApprovalTicket extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'ticket_number',
        'type',
        'user_id',
        'department',
        'subdivision',
        'staff_name',
        'email',
        'current_value',
        'requested_value',
        'reason',
        'rejection_reason',
        'status',
        'hod_id',
        'hod_notes',
        'hod_reviewed_at',
        'admin_id',
        'admin_notes',
        'admin_reviewed_at',
    ];

    protected $casts = [
        'hod_reviewed_at' => 'datetime',
        'admin_reviewed_at' => 'datetime',
    ];

    protected static function booted()
    {
        static::saved(function (ApprovalTicket $ticket) {
            try {
                app(\App\Services\TicketSheetService::class)->syncTicket($ticket);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error("Failed to auto-sync ticket {$ticket->ticket_number} to Google Sheet: " . $e->getMessage());
            }
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function hod()
    {
        return $this->belongsTo(User::class, 'hod_id');
    }

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    public static function generateTicketNumber(string $type): string
    {
        $prefix = match ($type) {
            'account_registration' => 'REG',
            'whatsapp_change', 'whatsapp_unlink' => 'WA',
            'password_reset' => 'PWD',
            'department_transfer' => 'TRF',
            default => 'TCK',
        };

        $date = now()->format('Ymd');
        $random = strtoupper(substr(uniqid(), -4));
        return "{$prefix}-{$date}-{$random}";
    }

    public function scopePendingHod($query)
    {
        return $query->where('status', 'pending_hod');
    }

    public function scopePendingAdmin($query)
    {
        return $query->where('status', 'pending_admin');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopeRejected($query)
    {
        return $query->where('status', 'rejected');
    }
}
