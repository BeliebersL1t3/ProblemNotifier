<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CalendarSyncLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'action',
        'performed_by',
        'department',
        'task_id',
        'task_title',
        'status',
        'details',
        'message',
    ];

    protected function casts(): array
    {
        return [
            'details' => 'array',
        ];
    }

    /**
     * Helper to record calendar sync event.
     */
    public static function record(
        string $action,
        string $performedBy = 'System',
        string $status = 'success',
        ?string $department = null,
        ?string $taskId = null,
        ?string $taskTitle = null,
        ?array $details = null,
        ?string $message = null
    ): self {
        return self::create([
            'action'       => $action,
            'performed_by' => $performedBy,
            'status'       => $status,
            'department'   => $department,
            'task_id'      => $taskId,
            'task_title'   => $taskTitle,
            'details'      => $details,
            'message'      => $message,
        ]);
    }
}
