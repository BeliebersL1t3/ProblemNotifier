<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class IssueDepartmentAction extends Model
{
    use HasFactory;

    protected $fillable = [
        'issue_id',
        'department',
        'ready_by_user_id',
        'ready_by_name',
        'ready_at',
        'solved_by_user_id',
        'solved_by_name',
        'solved_at',
        'action_note',
        'proof_image',
        'pending_by_user_id',
        'pending_by_name',
        'pending_reason',
        'pending_at',
    ];

    protected $casts = [
        'ready_at' => 'datetime',
        'solved_at' => 'datetime',
        'pending_at' => 'datetime',
    ];

    public function readyByUser()
    {
        return $this->belongsTo(User::class, 'ready_by_user_id');
    }

    public function solvedByUser()
    {
        return $this->belongsTo(User::class, 'solved_by_user_id');
    }

    public function pendingByUser()
    {
        return $this->belongsTo(User::class, 'pending_by_user_id');
    }
}
