<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Hidden(['password', 'raw_password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'name',
        'email',
        'password',
        'raw_password',
        'role',
        'is_hod',
        'hod_title',
        'approval_status',
        'is_active',
        'rejection_reason',
        'rejected_by',
        'rejected_at',
        'notify_whatsapp_tickets',
        'department',
        'subdivision',
        'staff_name',
        'whatsapp_number',
        'permissions',
        'avatar',
    ];

    protected $appends = [
        'avatar_url',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at'       => 'datetime',
            'password'                => 'hashed',
            'permissions'             => 'array',
            'is_hod'                  => 'boolean',
            'is_active'               => 'boolean',
            'notify_whatsapp_tickets' => 'boolean',
            'rejected_at'             => 'datetime',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isHOD(): bool
    {
        return (bool)$this->is_hod;
    }

    public function isDepartmentUser(): bool
    {
        return $this->role === 'department';
    }

    public function isViewer(): bool
    {
        return $this->role === 'viewer';
    }

    public function isPendingApproval(): bool
    {
        return in_array($this->approval_status, ['pending_hod', 'pending_admin']);
    }

    public function isRejected(): bool
    {
        return $this->approval_status === 'rejected';
    }

    public function hasPermission(string $permission): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        $perms = $this->permissions ?? [];
        return !empty($perms[$permission]);
    }

    public function canViewDepartment(string $department): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        $perms = $this->permissions ?? [];
        if (!empty($perms['can_view_all_departments'])) {
            return true;
        }

        $myDept = strtolower(trim($this->department ?? ''));
        $targetDept = strtolower(trim($department));

        if ($myDept === $targetDept) {
            return true;
        }

        $allowed = $perms['allowed_departments'] ?? [];
        if (is_array($allowed)) {
            $allowedNorm = array_map('strtolower', array_map('trim', $allowed));
            return in_array($targetDept, $allowedNorm);
        }

        return false;
    }

    public function scopeWithPermission($query, string $permission)
    {
        return $query->where(function ($q) use ($permission) {
            $q->where('role', 'admin')
              ->orWhere('permissions->' . $permission, true);
        });
    }

    public function scopeHodsOfDepartment($query, string $dept)
    {
        return $query->where('is_hod', true)
            ->where('is_active', true)
            ->where(function ($q) use ($dept) {
                $q->whereRaw('LOWER(department) = ?', [strtolower(trim($dept))])
                  ->orWhere('department', 'like', "%{$dept}%");
            });
    }

    public function scopeActiveApproved($query)
    {
        return $query->where('is_active', true)
            ->where('approval_status', 'approved');
    }

    public function auditLogs()
    {
        return $this->hasMany(UserAuditLog::class, 'target_user_id');
    }

    public function getAvatarUrlAttribute(): ?string
    {
        if (empty($this->avatar)) {
            return null;
        }
        if (str_starts_with($this->avatar, 'http://') || str_starts_with($this->avatar, 'https://') || str_starts_with($this->avatar, 'data:')) {
            return $this->avatar;
        }
        return asset('uploads/avatars/' . ltrim($this->avatar, '/'));
    }
}
