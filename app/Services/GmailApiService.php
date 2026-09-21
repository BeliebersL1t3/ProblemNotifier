<?php

namespace App\Services;

use App\Models\User;
use Google\Client;
use Google\Service\Gmail;
use Google\Service\Gmail\Message;
use Google\Service\Oauth2;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\Part\DataPart;
use Symfony\Component\Mime\Part\File;

class GmailApiService
{
    /**
     * Build base Google Client configured for OAuth.
     */
    public function getOAuthClient(): Client
    {
        $client = new Client();
        $client->setClientId(config('services.google.client_id'));
        $client->setClientSecret(config('services.google.client_secret'));
        $client->setRedirectUri(config('services.google.redirect_uri'));

        $client->addScope([
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/gmail.send',
        ]);

        $client->setAccessType('offline');
        $client->setPrompt('consent');

        return $client;
    }

    /**
     * Generate the Google OAuth authorization URL.
     */
    public function getAuthUrl(?string $state = null, ?string $loginHint = null): string
    {
        $client = $this->getOAuthClient();
        if ($state) {
            $client->setState($state);
        }
        if ($loginHint && filter_var($loginHint, FILTER_VALIDATE_EMAIL)) {
            $client->setLoginHint($loginHint);
        }
        return $client->createAuthUrl();
    }

    /**
     * Handle OAuth callback: exchange code for tokens and save to user.
     */
    public function handleCallback(string $code, User $user): array
    {
        $client = $this->getOAuthClient();
        $token = $client->fetchAccessTokenWithAuthCode($code);

        if (isset($token['error'])) {
            throw new \Exception('Google OAuth Error: ' . ($token['error_description'] ?? $token['error']));
        }

        $client->setAccessToken($token);

        // Fetch user profile from Google to get real Google email & ID
        $oauth2 = new Oauth2($client);
        $userInfo = $oauth2->userinfo->get();

        // Strict Check: Google email MUST match registered user email
        $googleEmail = strtolower(trim((string) $userInfo->email));
        $registeredEmail = strtolower(trim((string) $user->email));

        if ($googleEmail !== $registeredEmail) {
            // Revoke token immediately if mismatched
            try {
                $client->revokeToken();
            } catch (\Throwable $e) {
                // Ignore revoke errors
            }

            throw new \Exception(
                "Email Google yang dipilih ({$userInfo->email}) tidak sesuai dengan email akun terdaftar Anda ({$user->email}). " .
                "Silakan gunakan akun Google yang sama, atau perbarui alamat email pada profil akun Anda terlebih dahulu."
            );
        }

        $expiresAt = null;
        if (!empty($token['expires_in'])) {
            $expiresAt = now()->addSeconds((int) $token['expires_in']);
        }

        $user->google_id = $userInfo->id;
        $user->google_email = $userInfo->email;
        $user->google_access_token = $token['access_token'] ?? null;
        if (!empty($token['refresh_token'])) {
            $user->google_refresh_token = $token['refresh_token'];
        }
        $user->google_token_expires_at = $expiresAt;
        $user->save();

        return [
            'google_email' => $userInfo->email,
            'google_name'  => $userInfo->name,
        ];
    }

    /**
     * Retrieve an authenticated Google Client for a specific user, refreshing token if expired.
     */
    public function getAuthenticatedClient(User $user): Client
    {
        $client = $this->getOAuthClient();

        if (empty($user->google_access_token) && empty($user->google_refresh_token)) {
            throw new \Exception('Akun Google belum terhubung untuk pengguna ini.');
        }

        $accessToken = [
            'access_token' => $user->google_access_token,
            'expires_in'   => $user->google_token_expires_at ? max(0, $user->google_token_expires_at->diffInSeconds(now(), false) * -1) : 0,
            'created'      => time(),
        ];

        if ($user->google_refresh_token) {
            $accessToken['refresh_token'] = $user->google_refresh_token;
        }

        $client->setAccessToken($accessToken);

        // Auto refresh if expired
        if ($client->isAccessTokenExpired()) {
            if ($user->google_refresh_token) {
                $newToken = $client->fetchAccessTokenWithRefreshToken($user->google_refresh_token);
                if (isset($newToken['error'])) {
                    throw new \Exception('Sesi Google telah berakhir. Silakan hubungkan ulang akun Google Anda: ' . ($newToken['error_description'] ?? $newToken['error']));
                }

                $user->google_access_token = $newToken['access_token'] ?? $user->google_access_token;
                if (!empty($newToken['expires_in'])) {
                    $user->google_token_expires_at = now()->addSeconds((int) $newToken['expires_in']);
                }
                $user->save();
            } else {
                throw new \Exception('Token Google telah kadaluarsa dan tidak ada refresh token. Silakan hubungkan ulang akun Google Anda.');
            }
        }

        return $client;
    }

    /**
     * Send email directly through the user's personal Gmail account via Gmail API.
     */
    public function sendEmail(
        User $user,
        array $recipients,
        string $subject,
        string $htmlBody,
        $pdfFile,
        string $pdfFilename = 'Telunas_Report.pdf'
    ): Message {
        $client = $this->getAuthenticatedClient($user);
        $gmail = new Gmail($client);

        $senderAddress = new Address($user->google_email ?: $user->email, $user->name);

        $email = (new Email())
            ->from($senderAddress)
            ->subject($subject);

        // Embed logo as inline CID attachment so it displays seamlessly in Gmail without external URL dependency
        $logoPath = public_path('logo.png');
        if (file_exists($logoPath)) {
            $email->embedFromPath($logoPath, 'telunas-logo', 'image/png');
        }

        $email->html($htmlBody);

        foreach ($recipients as $recipient) {
            $email->addTo($recipient);
        }

        // Attach PDF
        if ($pdfFile) {
            if (is_string($pdfFile) && file_exists($pdfFile)) {
                $email->addPart(new DataPart(new File($pdfFile), $pdfFilename, 'application/pdf'));
            } elseif (is_object($pdfFile) && method_exists($pdfFile, 'getRealPath')) {
                $email->addPart(new DataPart(new File($pdfFile->getRealPath()), $pdfFilename, 'application/pdf'));
            } elseif (is_string($pdfFile)) {
                $email->addPart(new DataPart($pdfFile, $pdfFilename, 'application/pdf'));
            }
        }

        // Convert Symfony Email to base64url-encoded RFC 2822 string
        $rawMessage = $email->toString();
        $encodedMessage = rtrim(strtr(base64_encode($rawMessage), '+/', '-_'), '=');

        $message = new Message();
        $message->setRaw($encodedMessage);

        return $gmail->users_messages->send('me', $message);
    }
}
