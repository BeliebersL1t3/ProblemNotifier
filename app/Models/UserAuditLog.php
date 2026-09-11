<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class UserAuditLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'admin_id',
        'admin_name',
        'target_user_id',
        'target_user_name',
        'action',
        'changes',
        'ip_address',
        'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'changes' => 'array',
        ];
    }

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id')->withTrashed();
    }

    public function targetUser()
    {
        return $this->belongsTo(User::class, 'target_user_id')->withTrashed();
    }

    /**
     * Helper to log an audit event cleanly.
     */
    public static function record(
        ?User $admin,
        ?User $targetUser,
        string $action,
        array $changes = [],
        ?string $ipAddress = null,
        ?string $userAgent = null,
        ?string $customTargetName = null
    ): self {
        $targetName = $customTargetName ?? ($targetUser?->staff_name ?: ($targetUser?->name ?: ($targetUser ? 'User #' . $targetUser->id : 'Multi Akun')));
        return self::create([
            'admin_id'         => $admin?->id,
            'admin_name'       => $admin?->staff_name ?: ($admin?->name ?: 'System'),
            'target_user_id'   => $targetUser?->id,
            'target_user_name' => $targetName,
            'action'           => $action,
            'changes'          => $changes,
            'ip_address'       => $ipAddress ?? request()?->ip(),
            'user_agent'       => $userAgent ?? request()?->userAgent(),
        ]);
    }
}
