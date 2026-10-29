<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LeanIssue extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'lean_issues';

    protected $fillable = [
        'location',
        'title',
        'description',
        'target_departments',
        'reporter_name',
        'reporter_dept',
        'image_url',
        'status',
        'department_accs',
        'claimed_by_name',
        'claimed_by_dept',
        'claimed_at',
        'resolved_by_name',
        'resolved_by_dept',
        'resolved_at',
        'resolution_note',
        'resolution_image_url',
        'ai_status',
        'ai_category',
        'ai_sub_category',
        'ai_urgency',
        'ai_is_minimal',
        'ai_analysis',
        'ai_processed_at',
        'deleted_by_name',
        'transfer_history',
    ];

    protected $casts = [
        'target_departments' => 'array',
        'department_accs'    => 'array',
        'transfer_history'   => 'array',
        'ai_analysis'        => 'array',
        'ai_is_minimal'      => 'boolean',
        'claimed_at'         => 'datetime',
        'resolved_at'        => 'datetime',
        'ai_processed_at'    => 'datetime',
    ];
}
