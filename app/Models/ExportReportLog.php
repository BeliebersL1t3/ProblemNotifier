<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExportReportLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'sender_name',
        'sender_email',
        'sender_department',
        'report_type',
        'recipients',
        'subject',
        'pdf_filename',
        'sent_via',
        'status',
        'error_message',
        'ip_address',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'recipients' => 'array',
            'meta'       => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
