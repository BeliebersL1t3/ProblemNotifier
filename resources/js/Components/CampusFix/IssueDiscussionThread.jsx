import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
    Send, 
    Paperclip, 
    Loader2, 
    Lock, 
    MessageSquare, 
    Check, 
    Share2, 
    User, 
    RefreshCw, 
    AlertCircle, 
    Image as ImageIcon,
    ExternalLink
} from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import { DepartmentReadinessBar } from './DepartmentReadinessBar';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';

export function IssueDiscussionThread({ issueId, issueTitle, issueLocation, onClose }) {
    const { user } = useAuth();
    const { lang } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    
    // Discussion data
    const [discussionData, setDiscussionData] = useState(null);
    const [messages, setMessages] = useState([]);
    
    // Input state
    const [inputMessage, setInputMessage] = useState('');
    const [attachment, setAttachment] = useState(null);
    const [dispatchToWa, setDispatchToWa] = useState(false);

    const messagesEndRef = useRef(null);

    const fetchDiscussion = async (isBackground = false) => {
        if (!issueId) return;
        if (!isBackground) setLoading(true);

        try {
            const res = await axios.get(`/api/issues/${issueId}/discussion`);
            if (res.data.success) {
                setDiscussionData(res.data);
                setMessages(res.data.messages || []);
                setErrorMsg('');
            }
        } catch (err) {
            if (!isBackground) {
                setErrorMsg(err.response?.data?.message || 'Gagal memuat diskusi.');
            }
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    // Initial load + polling every 7 seconds
    useEffect(() => {
        fetchDiscussion(false);

        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchDiscussion(true);
            }
        }, 7000);

        return () => clearInterval(interval);
    }, [issueId]);

    // Auto-scroll to bottom on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if ((!inputMessage.trim() && !attachment) || sending || !issueId) return;

        setSending(true);
        setErrorMsg('');

        try {
            const formData = new FormData();
            formData.append('message', inputMessage.trim());
            if (attachment) {
                formData.append('attachment', attachment);
            }
            if (dispatchToWa) {
                formData.append('dispatch_to_whatsapp', '1');
            }

            const res = await axios.post(`/api/issues/${issueId}/discussion`, formData);
            if (res.data.success) {
                setInputMessage('');
                setAttachment(null);
                setDispatchToWa(false);
                await fetchDiscussion(true);
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Gagal mengirim pesan.');
        } finally {
            setSending(false);
        }
    };

    const getBadgeStyle = (badge = '') => {
        const lower = badge.toLowerCase();
        if (lower.startsWith('pelapor')) {
            return 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300';
        }
        if (lower.startsWith('hod')) {
            return 'bg-purple-950/70 border-purple-500/50 text-purple-300';
        }
        if (lower.startsWith('admin') || lower.startsWith('superadmin')) {
            return 'bg-amber-950/70 border-amber-500/50 text-amber-300';
        }
        return 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300';
    };

    return (
        <div className="flex flex-col h-full bg-[#181711] text-[#FAFAFA] rounded-xl overflow-hidden">
            {/* Header / Info bar */}
            <div className="px-5 py-3.5 bg-[#211F17] border-b border-[#3B3929] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[#2A281E] rounded-lg border border-[#3B3929] text-[#C9AA71]">
                        <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-[#C9AA71] bg-[#2A281E] px-2 py-0.5 rounded border border-[#3B3929]">
                                #{issueId}
                            </span>
                            <span className="text-sm font-bold text-white line-clamp-1">
                                {issueTitle || discussionData?.title || 'Diskusi Isu'}
                            </span>
                        </div>
                        {issueLocation && (
                            <span className="text-[11px] text-stone-400">
                                📍 {issueLocation}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => fetchDiscussion(false)} 
                        title="Segarkan Diskusi"
                        className="p-1.5 text-stone-400 hover:text-white rounded-md hover:bg-stone-800 transition"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    {onClose && (
                        <button 
                            onClick={onClose} 
                            className="text-stone-400 hover:text-white text-xs px-2 py-1 rounded bg-[#2A281E] hover:bg-[#3B3929]"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Department Progressive Readiness Bar */}
            <div className="px-4 pt-3">
                <DepartmentReadinessBar
                    issueId={issueId}
                    departmentReadiness={discussionData?.department_readiness || []}
                    targetDepartments={discussionData?.target_departments || []}
                    isLocked={discussionData?.is_locked || false}
                    onRefresh={() => fetchDiscussion(true)}
                />
            </div>

            {/* Error banner */}
            {errorMsg && (
                <div className="mx-4 mb-2 p-2.5 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[280px] max-h-[460px]">
                {loading && messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-stone-400">
                        <Loader2 className="w-6 h-6 animate-spin text-[#C9AA71] mb-2" />
                        <span className="text-xs">{lang === 'id' ? 'Memuat diskusi & kronologi...' : 'Loading discussion...'}</span>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center py-12 text-stone-400 text-xs">
                        <p>{lang === 'id' ? 'Belum ada pesan obrolan atau catatan.' : 'No messages yet.'}</p>
                        <p className="text-[11px] text-stone-500 mt-1">
                            {lang === 'id' ? 'Gunakan kolom di bawah untuk berkoordinasi langsung dengan tim terkait.' : 'Start the conversation below.'}
                        </p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        // System event styling
                        if (msg.is_system_event) {
                            return (
                                <div key={msg.id} className="flex justify-center my-2">
                                    <div className="max-w-[85%] bg-[#211F17]/90 border border-[#3B3929] rounded-lg px-3.5 py-2 text-center shadow-xs">
                                        <p className="text-xs text-stone-200 leading-relaxed font-medium">
                                            {msg.message}
                                        </p>
                                        {msg.attachment_url && (
                                            <a 
                                                href={msg.attachment_url} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-[#C9AA71] hover:underline"
                                            >
                                                <ImageIcon className="w-3 h-3" />
                                                <span>{lang === 'id' ? 'Lihat Foto Bukti' : 'View Proof Photo'}</span>
                                            </a>
                                        )}
                                        <span className="block text-[10px] text-stone-500 mt-1">
                                            {msg.created_at_human}
                                        </span>
                                    </div>
                                </div>
                            );
                        }

                        // User message styling
                        const isMe = msg.user_id === user?.id;

                        return (
                            <div 
                                key={msg.id} 
                                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} my-2`}
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-2xs ${getBadgeStyle(msg.sender_role_badge)}`}>
                                        {msg.sender_role_badge || msg.sender_name}
                                    </span>
                                    {msg.is_whatsapp_dispatched && (
                                        <span 
                                            title="Pesan ini juga diteruskan ke Grup WhatsApp Departemen"
                                            className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded"
                                        >
                                            <span>📢</span>
                                            <span>WA</span>
                                        </span>
                                    )}
                                </div>

                                <div className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed shadow-md ${
                                    isMe 
                                        ? 'bg-[#2A281E] border border-[#3B3929] text-white rounded-tr-none' 
                                        : 'bg-[#1E1D15] border border-[#3B3929]/70 text-stone-200 rounded-tl-none'
                                }`}>
                                    <p className="whitespace-pre-wrap break-words">{msg.message}</p>

                                    {msg.attachment_url && (
                                        <div className="mt-2 pt-2 border-t border-stone-700/50">
                                            <a 
                                                href={msg.attachment_url} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="block overflow-hidden rounded-lg border border-stone-700/60 max-h-48 group relative"
                                            >
                                                <img 
                                                    src={msg.attachment_url} 
                                                    alt="Lampiran chat" 
                                                    className="w-full h-auto object-cover group-hover:scale-105 transition duration-200" 
                                                />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                                    <ExternalLink className="w-4 h-4 text-white" />
                                                </div>
                                            </a>
                                        </div>
                                    )}

                                    <div className={`mt-1 text-[10px] text-stone-400 flex items-center justify-end gap-1 ${isMe ? 'text-stone-400' : 'text-stone-500'}`}>
                                        <span>{msg.created_at_human}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Form or Locked Banner */}
            <div className="p-3 bg-[#211F17] border-t border-[#3B3929]">
                {discussionData?.is_locked ? (
                    <div className="flex items-center justify-center gap-2 py-2 text-stone-400 text-xs bg-[#181711] rounded-lg border border-[#3B3929]">
                        <Lock className="w-3.5 h-3.5 text-stone-500" />
                        <span>{lang === 'id' ? 'Ruang diskusi dikunci (Tiket Selesai / Diarsipkan).' : 'Discussion locked (Ticket Solved/Archived).'}</span>
                    </div>
                ) : (
                    <form onSubmit={handleSendMessage} className="space-y-2">
                        {attachment && (
                            <div className="flex items-center justify-between text-xs bg-[#2A281E] border border-[#3B3929] px-2.5 py-1 rounded-md text-[#C9AA71]">
                                <span className="truncate max-w-[240px]">📎 {attachment.name}</span>
                                <button 
                                    type="button" 
                                    onClick={() => setAttachment(null)} 
                                    className="text-stone-400 hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>
                        )}

                        <div className="flex items-end gap-2">
                            <label 
                                title={lang === 'id' ? 'Lampirkan Foto' : 'Attach Photo'}
                                className="cursor-pointer p-2 rounded-lg bg-[#2A281E] hover:bg-[#3B3929] border border-[#3B3929] text-stone-300 hover:text-white transition"
                            >
                                <Paperclip className="w-4 h-4 text-[#C9AA71]" />
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => setAttachment(e.target.files?.[0] || null)} 
                                />
                            </label>

                            <textarea
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage(e);
                                    }
                                }}
                                rows={2}
                                placeholder={lang === 'id' ? 'Ketik pesan atau koordinasi... (Enter untuk kirim)' : 'Type a message...'}
                                className="flex-1 bg-[#181711] border border-[#3B3929] rounded-lg p-2.5 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-[#C9AA71] resize-none"
                            />

                            <Button
                                type="submit"
                                size="sm"
                                disabled={sending || (!inputMessage.trim() && !attachment)}
                                className="bg-[#C9AA71] hover:bg-[#b0935d] text-black font-bold h-10 px-3.5 gap-1.5"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </Button>
                        </div>

                        {/* WhatsApp Checkbox Option */}
                        <div className="flex items-center justify-between text-[11px] text-stone-300 px-1 pt-1">
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={dispatchToWa}
                                    onChange={(e) => setDispatchToWa(e.target.checked)}
                                    className="rounded border-stone-600 bg-stone-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 w-3.5 h-3.5"
                                />
                                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                                    <span>📢</span>
                                    <span>{lang === 'id' ? 'Kirim juga ke Grup WhatsApp Departemen' : 'Also forward to Dept WhatsApp Groups'}</span>
                                </span>
                            </label>

                            <span className="text-[10px] text-stone-500">
                                {lang === 'id' ? 'Shift+Enter untuk baris baru' : 'Shift+Enter for newline'}
                            </span>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
