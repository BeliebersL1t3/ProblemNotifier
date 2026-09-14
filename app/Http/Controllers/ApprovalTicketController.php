<?php

namespace App\Http\Controllers;

use App\Models\ApprovalTicket;
use App\Models\User;
use App\Services\TicketNotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class ApprovalTicketController extends Controller
{
    /**
     * Display ticket listing with role-based filtering
     */
    public function index(Request $request): Response
    {
        $user = Auth::user();
        $query = ApprovalTicket::with(['user', 'hod', 'admin'])->latest();

        // Role scoping
        if ($user->isAdmin()) {
            // Admin sees all tickets
        } elseif ($user->isHOD()) {
            // HOD sees tickets for their department or submitted by themselves
            $query->where(function ($q) use ($user) {
                $q->where('department', $user->department)
                  ->orWhere('user_id', $user->id);
            });
        } else {
            // Regular user only sees their own active operational tickets (exclude account_registration because their account is already verified & active)
            $query->where('user_id', $user->id)
                  ->where('type', '!=', 'account_registration');
        }

        // Department Filter (for Admin)
        if ($user->isAdmin() && $request->filled('department') && $request->department !== 'all') {
            $query->where('department', $request->department);
        }

        // Status Filter
        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        // Type Filter
        if ($request->filled('type') && $request->type !== 'all') {
            $query->where('type', $request->type);
        }

        // Search Filter
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('ticket_number', 'like', "%{$search}%")
                  ->orWhere('staff_name', 'like', "%{$search}%")
                  ->orWhere('department', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $tickets = $query->paginate(15)->withQueryString();

        // Calculate badges count
        $pendingHodCount = 0;
        $pendingAdminCount = 0;

        $myTicketsQuery = ApprovalTicket::where('user_id', $user->id);
        if (!$user->isAdmin() && !$user->isHOD()) {
            $myTicketsQuery->where('type', '!=', 'account_registration');
        }
        $myTicketsCount = (clone $myTicketsQuery)->count();
        $myPendingCount = (clone $myTicketsQuery)
            ->whereIn('status', ['pending_hod', 'pending_admin'])
            ->count();

        if ($user->isAdmin()) {
            $pendingAdminCount = ApprovalTicket::where('status', 'pending_admin')->count();
            $pendingHodCount = ApprovalTicket::where('status', 'pending_hod')->count();
        } elseif ($user->isHOD()) {
            $pendingHodCount = ApprovalTicket::where('status', 'pending_hod')
                ->where('department', $user->department)
                ->count();
        }

        return Inertia::render('Tickets/Index', [
            'tickets' => $tickets,
            'filters' => $request->only(['status', 'type', 'search', 'department']),
            'pendingHodCount' => $pendingHodCount,
            'pendingAdminCount' => $pendingAdminCount,
            'myTicketsCount' => $myTicketsCount,
            'myPendingCount' => $myPendingCount,
        ]);
    }

    /**
     * Submit a WhatsApp change/unlink ticket from Profile
     */
    public function storeWhatsappTicket(Request $request): RedirectResponse
    {
        $user = Auth::user();

        $request->validate([
            'is_unlink' => 'nullable|boolean',
            'whatsapp_number' => 'nullable|string|max:30',
            'reason' => 'nullable|string|max:500',
        ]);

        $isUnlink = $request->boolean('is_unlink');
        $rawPhone = trim($request->input('whatsapp_number', ''));
        $cleanPhone = $rawPhone ? preg_replace('/[^0-9]/', '', $rawPhone) : null;

        if (!$isUnlink && empty($cleanPhone)) {
            return back()->withErrors(['whatsapp_number' => 'Nomor WhatsApp baru wajib diisi.']);
        }

        // Validate conflict with active users
        if (!$isUnlink && $cleanPhone) {
            $conflict = User::where('whatsapp_number', $cleanPhone)
                ->where('id', '!=', $user->id)
                ->first();
            if ($conflict) {
                return back()->withErrors([
                    'whatsapp_number' => "Nomor WhatsApp ini sudah digunakan oleh akun {$conflict->name} ({$conflict->department})."
                ]);
            }
        }

        // If user is Admin, they can apply immediately without ticket
        if ($user->isAdmin()) {
            $user->whatsapp_number = $isUnlink ? null : $cleanPhone;
            if ($isUnlink) {
                $user->notify_whatsapp_tickets = false;
            }
            $user->save();
            try {
                Http::timeout(1)->post('http://localhost:3000/sync-staff');
            } catch (\Throwable $e) {}
            return back()->with('status', 'whatsapp-updated');
        }

        $type = $isUnlink ? 'whatsapp_unlink' : 'whatsapp_change';

        // Check for existing pending ticket
        $existing = ApprovalTicket::where('user_id', $user->id)
            ->whereIn('status', ['pending_hod', 'pending_admin'])
            ->whereIn('type', ['whatsapp_change', 'whatsapp_unlink'])
            ->first();

        if ($existing) {
            return back()->withErrors([
                'whatsapp_number' => "Anda masih memiliki tiket permohonan ({$existing->ticket_number}) yang sedang diproses."
            ]);
        }

        $ticket = ApprovalTicket::create([
            'ticket_number' => ApprovalTicket::generateTicketNumber($type),
            'type' => $type,
            'user_id' => $user->id,
            'department' => $user->department ?: 'General',
            'subdivision' => $user->subdivision,
            'staff_name' => $user->staff_name ?: $user->name,
            'email' => $user->email,
            'current_value' => $user->whatsapp_number,
            'requested_value' => $isUnlink ? null : $cleanPhone,
            'reason' => $request->input('reason'),
            'status' => 'pending_hod',
        ]);

        TicketNotificationService::notifyHods($ticket, $isUnlink ? 'Pelepasan Nomor WhatsApp' : 'Perubahan Nomor WhatsApp');

        return back()->with('status', 'whatsapp-ticket-submitted');
    }

    /**
     * Submit a password reset ticket from Profile
     */
    public function storePasswordResetTicket(Request $request): RedirectResponse
    {
        $user = Auth::user();

        $request->validate([
            'reason' => 'required|string|max:500',
            'new_password' => ['nullable', 'string', 'min:8', 'confirmed'],
        ]);

        // Check for existing pending ticket
        $existing = ApprovalTicket::where('user_id', $user->id)
            ->whereIn('status', ['pending_hod', 'pending_admin'])
            ->where('type', 'password_reset')
            ->first();

        if ($existing) {
            return back()->withErrors([
                'password' => "Anda sudah memiliki tiket reset password ({$existing->ticket_number}) yang sedang diproses."
            ]);
        }

        $hashedRequestedPassword = $request->filled('new_password')
            ? Hash::make($request->input('new_password'))
            : null;

        $ticket = ApprovalTicket::create([
            'ticket_number' => ApprovalTicket::generateTicketNumber('password_reset'),
            'type' => 'password_reset',
            'user_id' => $user->id,
            'department' => $user->department ?: 'General',
            'subdivision' => $user->subdivision,
            'staff_name' => $user->staff_name ?: $user->name,
            'email' => $user->email,
            'current_value' => null,
            'requested_value' => $hashedRequestedPassword,
            'reason' => $request->input('reason'),
            'status' => 'pending_hod',
        ]);

        TicketNotificationService::notifyHods($ticket, 'Permohonan Reset Password');

        return back()->with('status', 'password-ticket-submitted');
    }

    /**
     * HOD Review action (Approve to Admin or Reject with reason)
     */
    public function hodAction(Request $request, $id): RedirectResponse
    {
        $user = Auth::user();
        $ticket = ApprovalTicket::findOrFail($id);

        // Authorization check: User must be HOD of ticket's department OR Admin
        if (!$user->isAdmin() && (!$user->isHOD() || $user->department !== $ticket->department)) {
            abort(403, 'Hanya HOD dari departemen bersangkutan yang dapat meninjau tiket ini.');
        }

        if ($ticket->status !== 'pending_hod') {
            return back()->withErrors(['message' => 'Tiket ini sudah tidak berada pada tahap peninjauan HOD.']);
        }

        $request->validate([
            'action' => 'required|in:approve,reject',
            'notes' => 'nullable|string|max:500',
            'rejection_reason' => 'required_if:action,reject|nullable|string|max:500',
        ]);

        $action = $request->input('action');

        if ($action === 'approve') {
            $ticket->status = 'pending_admin';
            $ticket->hod_id = $user->id;
            $ticket->hod_notes = $request->input('notes');
            $ticket->hod_reviewed_at = now();
            $ticket->save();

            // Update user status if it's registration
            if ($ticket->type === 'account_registration' && $ticket->user) {
                $ticket->user->update(['approval_status' => 'pending_admin']);
            }

            // Notify Admins
            TicketNotificationService::notifyAdmins($ticket, $this->getTypeLabel($ticket->type));

            return back()->with('success', "Tiket {$ticket->ticket_number} berhasil disetujui HOD dan diteruskan ke Admin untuk ACC final.");
        } else {
            $rejectionReason = $request->input('rejection_reason');
            $ticket->status = 'rejected';
            $ticket->hod_id = $user->id;
            $ticket->hod_notes = $request->input('notes');
            $ticket->rejection_reason = $rejectionReason;
            $ticket->hod_reviewed_at = now();
            $ticket->save();

            // If account registration, update user record with rejection details
            if ($ticket->type === 'account_registration' && $ticket->user) {
                $ticket->user->update([
                    'approval_status' => 'rejected',
                    'is_active' => false,
                    'rejection_reason' => $rejectionReason,
                    'rejected_by' => $user->id,
                    'rejected_at' => now(),
                ]);
            }

            // Notify user
            TicketNotificationService::notifyUserResolution($ticket, false, $rejectionReason);

            return back()->with('success', "Tiket {$ticket->ticket_number} telah ditolak dengan alasan yang tercatat.");
        }
    }

    /**
     * Admin Review action (Final ACC or Reject with reason)
     */
    public function adminAction(Request $request, $id): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->isAdmin()) {
            abort(403, 'Hanya Admin yang dapat memberikan ACC Final pada tiket.');
        }

        $ticket = ApprovalTicket::findOrFail($id);

        if (!in_array($ticket->status, ['pending_admin', 'pending_hod'])) {
            return back()->withErrors(['message' => 'Tiket ini sudah selesai diproses.']);
        }

        $request->validate([
            'action' => 'required|in:approve,reject',
            'notes' => 'nullable|string|max:500',
            'rejection_reason' => 'required_if:action,reject|nullable|string|max:500',
        ]);

        $action = $request->input('action');

        if ($action === 'approve') {
            $ticket->status = 'approved';
            $ticket->admin_id = $user->id;
            $ticket->admin_notes = $request->input('notes');
            $ticket->admin_reviewed_at = now();
            $ticket->save();

            // Execute action based on ticket type
            switch ($ticket->type) {
                case 'account_registration':
                    if ($ticket->user) {
                        $ticket->user->update([
                            'approval_status' => 'approved',
                            'is_active' => true,
                            'rejection_reason' => null,
                        ]);
                    }
                    break;

                case 'whatsapp_change':
                    if ($ticket->user && $ticket->requested_value) {
                        $ticket->user->update([
                            'whatsapp_number' => $ticket->requested_value,
                        ]);
                    }
                    break;

                case 'whatsapp_unlink':
                    if ($ticket->user) {
                        $ticket->user->update([
                            'whatsapp_number' => null,
                            'notify_whatsapp_tickets' => false,
                        ]);
                    }
                    break;

                case 'password_reset':
                    if ($ticket->user) {
                        if ($ticket->requested_value) {
                            $ticket->user->password = $ticket->requested_value; // Already hashed
                        } else {
                            $randomPassword = Str::random(10);
                            $ticket->user->password = Hash::make($randomPassword);
                            $ticket->admin_notes = ($ticket->admin_notes ? $ticket->admin_notes . " | " : "") . "Temp Password: {$randomPassword}";
                            $ticket->save();
                        }
                        $ticket->user->save();
                    }
                    break;
            }

            // Sync WhatsApp bot memory in real-time
            try {
                Http::timeout(1)->post('http://localhost:3000/sync-staff');
            } catch (\Throwable $e) {}

            // Notify user
            TicketNotificationService::notifyUserResolution($ticket, true);

            return back()->with('success', "Tiket {$ticket->ticket_number} telah BERHASIL disetujui (ACC Final).");
        } else {
            $rejectionReason = $request->input('rejection_reason');
            $ticket->status = 'rejected';
            $ticket->admin_id = $user->id;
            $ticket->admin_notes = $request->input('notes');
            $ticket->rejection_reason = $rejectionReason;
            $ticket->admin_reviewed_at = now();
            $ticket->save();

            // If account registration, update user record with rejection reason
            if ($ticket->type === 'account_registration' && $ticket->user) {
                $ticket->user->update([
                    'approval_status' => 'rejected',
                    'is_active' => false,
                    'rejection_reason' => $rejectionReason,
                    'rejected_by' => $user->id,
                    'rejected_at' => now(),
                ]);
            }

            // Notify user
            TicketNotificationService::notifyUserResolution($ticket, false, $rejectionReason);

            return back()->with('success', "Tiket {$ticket->ticket_number} telah DITOLAK.");
        }
    }

    private function getTypeLabel(string $type): string
    {
        return match ($type) {
            'account_registration' => 'Pendaftaran Akun Baru',
            'whatsapp_change' => 'Perubahan Nomor WhatsApp',
            'whatsapp_unlink' => 'Pelepasan Nomor WhatsApp',
            'password_reset' => 'Reset Password',
            default => 'Permohonan Tiket',
        };
    }
}
