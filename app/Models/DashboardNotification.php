<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DashboardNotification extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'department',
        'role_target',
        'type',
        'title',
        'message',
        'link',
        'is_read',
    ];

    protected $casts = [
        'is_read' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }

    public function scopeForUser($query, User $user)
    {
        return $query->where(function ($q) use ($user) {
            // Directly targeted to this user
            $q->where('user_id', $user->id);

            // Targeted to Admin
            if ($user->isAdmin()) {
                $q->orWhere('role_target', 'admin');
            }

            // Targeted to HOD of this department
            if ($user->isHOD()) {
                $q->orWhere(function ($hodQ) use ($user) {
                    $hodQ->where('role_target', 'hod')
                         ->where('department', $user->department);
                });
            }

            // Targeted to Department users
            if ($user->department) {
                $q->orWhere(function ($deptQ) use ($user) {
                    $deptQ->where('role_target', 'department_user')
                          ->where('department', $user->department);
                });
            }
        });
    }
}
