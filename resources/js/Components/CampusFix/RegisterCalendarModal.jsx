import React from 'react';
import {
    Calendar as CalendarIcon, X, CheckCircle2, AlertTriangle,
    ExternalLink, Loader2, ShieldCheck, Mail, ArrowRight, User
} from 'lucide-react';

export default function RegisterCalendarModal({
    isOpen,
    onClose,
    calAccess,
    onRegister,
    registering,
    user,
    lang = 'id',
}) {
    if (!isOpen) return null;

    const isDummy = calAccess?.isDummyEmail;
    const hasAccess = calAccess?.hasAccess;
    const email = calAccess?.email || user?.email || '';

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div 
                className="w-full max-w-md bg-[#1C1B0E] border border-[#3B3929] rounded-3xl shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200"
                style={{
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 30px rgba(201, 170, 113, 0.15)',
                }}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-[#3B3929] flex items-center justify-between bg-gradient-to-r from-[#2A281E] to-[#1C1B0E]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-[#C9AA71]/15 border border-[#C9AA71]/40 flex items-center justify-center text-[#C9AA71]">
                            <CalendarIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-extrabold text-[#FAFAFA]">
                                {lang === 'id' ? 'Akses Google Calendar' : 'Google Calendar Access'}
                            </h3>
                            <p className="text-[11px] text-[#A19F8D]">
                                {lang === 'id' ? 'Kalender Operasional Resort' : 'Resort Operations Calendar'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-xl hover:bg-white/10 text-[#A19F8D] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs">
                    {/* Security Notice */}
                    <div className="p-3.5 rounded-2xl bg-[#2A281E]/80 border border-[#3B3929] flex items-start gap-3">
                        <ShieldCheck className="h-5 w-5 text-[#C9AA71] shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <span className="font-extrabold text-[#FAFAFA] block">
                                {lang === 'id' ? 'Akses Privat & Terkendali' : 'Private & Controlled Access'}
                            </span>
                            <p className="text-[#A19F8D] leading-relaxed">
                                {lang === 'id'
                                    ? 'Kalender jadwal ini tidak dibuka untuk publik. Izin melihat (Reader) hanya diberikan spesifik kepada akun staf yang telah terverifikasi.'
                                    : 'This calendar is strictly private. Reader permissions are granted exclusively to verified staff accounts.'}
                            </p>
                        </div>
                    </div>

                    {/* Account Identity Details */}
                    <div className="p-4 rounded-2xl bg-[#14130A] border border-[#3B3929] space-y-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#A19F8D] block">
                            {lang === 'id' ? 'Identitas Akun Pemohon' : 'Requesting Account Identity'}
                        </span>

                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#2A281E] border border-white/10 flex items-center justify-center text-[#E3D1AA]">
                                <User className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <span className="font-extrabold text-[#FAFAFA] block truncate">
                                    {user?.staff_name || user?.name || 'Staf Telunas'}
                                </span>
                                <span className="text-[10px] text-[#C9AA71] uppercase font-bold tracking-wider">
                                    {user?.department ? `Dept: ${user.department}` : (user?.role || 'User')}
                                </span>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-[#3B3929]/70 flex items-center gap-2">
                            <Mail className="h-4 w-4 text-[#A19F8D] shrink-0" />
                            <div className="min-w-0 flex-1">
                                <span className="text-[10px] text-[#A19F8D] block">
                                    {lang === 'id' ? 'Email yang Didaftarkan:' : 'Email to Register:'}
                                </span>
                                <span className="font-bold text-[#FAFAFA] break-all">
                                    {email}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* State: Dummy Email */}
                    {isDummy && (
                        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 text-amber-200 space-y-3">
                            <div className="flex items-start gap-2.5">
                                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <span className="font-extrabold text-amber-300 block">
                                        {lang === 'id' ? 'Email Placeholder / Belum Valid' : 'Placeholder Email Detected'}
                                    </span>
                                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                                        {lang === 'id'
                                            ? `Akun Anda saat ini menggunakan email sementara (${email}). Google Calendar memerlukan akun Google / Gmail aktif agar dapat menerima undangan jadwal.`
                                            : `Your account uses a placeholder email (${email}). Google Calendar requires an active Google / Gmail account.`}
                                    </p>
                                </div>
                            </div>
                            <a
                                href="/profile"
                                className="w-full py-2.5 px-4 rounded-xl font-extrabold bg-amber-500 text-[#1C1B0E] hover:bg-amber-400 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer text-xs"
                            >
                                <span>{lang === 'id' ? 'Perbarui Email di Profil' : 'Update Email in Profile'}</span>
                                <ArrowRight className="h-3.5 w-3.5" />
                            </a>
                        </div>
                    )}

                    {/* State: Has Access Already */}
                    {hasAccess && (
                        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 space-y-3">
                            <div className="flex items-center gap-2.5">
                                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                                <div>
                                    <span className="font-extrabold text-emerald-300 block">
                                        {lang === 'id' ? 'Akses Sudah Aktif!' : 'Access is Active!'}
                                    </span>
                                    <p className="text-[11px] text-emerald-200/90 mt-0.5">
                                        {lang === 'id'
                                            ? `Email akun Anda (${email}) telah terdaftar dengan hak akses pembaca (Reader).`
                                            : `Your email (${email}) is registered as a Reader.`}
                                    </p>
                                </div>
                            </div>
                            {calAccess?.calendarUrl && (
                                <a
                                    href={calAccess.calendarUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-2.5 px-4 rounded-xl font-extrabold bg-emerald-500 text-[#064E3B] hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer text-xs"
                                >
                                    <span>{lang === 'id' ? 'Buka di Google Calendar' : 'Open in Google Calendar'}</span>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            )}
                        </div>
                    )}

                    {/* State: Valid Email but Not Registered Yet */}
                    {!isDummy && !hasAccess && (
                        <div className="space-y-3 pt-1">
                            <p className="text-[#A19F8D] leading-relaxed">
                                {lang === 'id'
                                    ? `Dengan menekan tombol di bawah, email akun Anda (${email}) akan otomatis didaftarkan ke Google Calendar operasional dengan hak akses pembaca (Reader).`
                                    : `By clicking below, your account email (${email}) will be granted Reader access to the Google Calendar.`}
                            </p>
                            <button
                                type="button"
                                disabled={registering}
                                onClick={onRegister}
                                className="w-full py-3 px-4 rounded-xl font-extrabold bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#D4B883] transition-all flex items-center justify-center gap-2 shadow-lg hover:scale-[1.01] active:scale-95 cursor-pointer disabled:opacity-50 text-xs"
                            >
                                {registering ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>{lang === 'id' ? 'Mendaftarkan Akun...' : 'Registering Account...'}</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="h-4 w-4" />
                                        <span>{lang === 'id' ? 'Daftarkan Akun Saya Sekarang' : 'Register My Account Now'}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 bg-[#14130A] border-t border-[#3B3929] flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-white/5 transition-colors cursor-pointer"
                    >
                        {lang === 'id' ? 'Tutup' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );
}
