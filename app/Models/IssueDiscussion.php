<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class IssueDiscussion extends Model
{
    use HasFactory;

    protected $fillable = [
        'issue_id',
        'user_id',
        'sender_name',
        'sender_role_badge',
        'message',
        'attachment_url',
        'is_whatsapp_dispatched',
        'is_system_event',
    ];

    protected $casts = [
        'is_whatsapp_dispatched' => 'boolean',
        'is_system_event' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
