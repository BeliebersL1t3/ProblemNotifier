<?php

namespace App\Http\Requests\Auth;

use App\Models\User;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LoginRequest extends FormRequest
{
    /**
     * Dummy bcrypt hash used to normalize response timing when email does not exist.
     */
    protected const DUMMY_BCRYPT_HASH = '$2y$12$invalidhashpaddingtopreventtimingattack000000000000000';

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ];
    }

    /**
     * Validate credentials and account status WITHOUT creating an authenticated session.
     *
     * @throws ValidationException
     */
    public function validateCredentialsWithoutLogin(): User
    {
        $this->ensureIsNotRateLimited();

        $normalizedEmail = mb_strtolower(trim((string) $this->input('email')));
        $plainPassword = (string) $this->input('password');

        $user = User::whereRaw('LOWER(email) = ?', [$normalizedEmail])->first();

        $passwordMatches = $user
            ? Hash::check($plainPassword, (string) $user->password)
            : Hash::check($plainPassword, self::DUMMY_BCRYPT_HASH);

        if (! $user || ! $passwordMatches) {
            RateLimiter::hit($this->throttleKey());

            throw ValidationException::withMessages([
                'email' => trans('auth.failed'),
            ]);
        }

        if ($user->isRejected()) {
            $reason = $user->rejection_reason ? ": \"{$user->rejection_reason}\"" : ". Silakan hubungi Admin atau HOD departemen Anda.";
            throw ValidationException::withMessages([
                'email' => "Akun Anda ditolak{$reason}",
            ]);
        }

        if ($user->isPendingApproval()) {
            $stage = $user->approval_status === 'pending_hod'
                ? 'menunggu persetujuan HOD Departemen'
                : 'menunggu persetujuan final dari Admin';
            throw ValidationException::withMessages([
                'email' => "Akun Anda belum aktif ({$stage}). Silakan tunggu konfirmasi.",
            ]);
        }

        if (!$user->is_active) {
            throw ValidationException::withMessages([
                'email' => "Akun Anda saat ini dinonaktifkan. Silakan hubungi Admin.",
            ]);
        }

        RateLimiter::clear($this->throttleKey());

        return $user;
    }

    /**
     * Attempt to authenticate the request's credentials.
     *
     * @throws ValidationException
     */
    public function authenticate(): void
    {
        $user = $this->validateCredentialsWithoutLogin();
        Auth::login($user, $this->boolean('remember'));
    }

    /**
     * Ensure the login request is not rate limited.
     *
     * @throws ValidationException
     */
    public function ensureIsNotRateLimited(): void
    {
        if (! RateLimiter::tooManyAttempts($this->throttleKey(), 5)) {
            return;
        }

        event(new Lockout($this));

        $seconds = RateLimiter::availableIn($this->throttleKey());

        throw ValidationException::withMessages([
            'email' => trans('auth.throttle', [
                'seconds' => $seconds,
                'minutes' => ceil($seconds / 60),
            ]),
        ]);
    }

    /**
     * Get the rate limiting throttle key for the request.
     */
    public function throttleKey(): string
    {
        return Str::transliterate(Str::lower($this->string('email')).'|'.$this->ip());
    }
}
