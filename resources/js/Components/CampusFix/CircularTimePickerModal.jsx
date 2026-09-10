import React, { useState, useEffect, useRef } from 'react';
import { Clock, Keyboard, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader } from '@/Components/UI/Dialog';

/**
 * InlineAnalogClockPicker
 * A rich, interactive analog clock widget embedded directly in the view (no popup modal).
 * Supports Hour/Minute dial touch & drag, 12h AM/PM, quick preset buttons,
 * manual keyboard input, and enforces a strict Max 24-Hour limit.
 */
export function InlineAnalogClockPicker({
    valueMs,
    onChange,
    lang = 'en',
    className = '',
}) {
    const parseMs = (ms) => {
        const d = ms && !isNaN(parseInt(ms, 10))
            ? new Date(parseInt(ms, 10))
            : new Date(Date.now() + 15 * 60 * 1000);
        let h = d.getHours();
        const m = Math.round(d.getMinutes() / 5) * 5 % 60;
        const ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return { h, m, ap };
    };

    const initial = parseMs(valueMs);
    const [hour, setHour] = useState(initial.h);
    const [minute, setMinute] = useState(initial.m);
    const [ampm, setAmpm] = useState(initial.ap);
    const [mode, setMode] = useState('hour'); // 'hour' | 'minute'
    const [inputMode, setInputMode] = useState('clock'); // 'clock' | 'text'

    const clockRef = useRef(null);
    const isDragging = useRef(false);

    useEffect(() => {
        if (valueMs) {
            const parsed = parseMs(valueMs);
            setHour(parsed.h);
            setMinute(parsed.m);
            setAmpm(parsed.ap);
        }
    }, [valueMs]);

    // Calculate deadline timestamp for selected hour:minute AM/PM (Max 24h from now)
    const calculateDeadline = (hVal, mVal, apVal) => {
        let h24 = hVal % 12;
        if (apVal === 'PM') h24 += 12;

        const target = new Date();
        target.setHours(h24, mVal, 0, 0);

        // If target time is earlier or within 1 minute of current time today, assume tomorrow
        if (target.getTime() <= Date.now() + 60 * 1000) {
            target.setDate(target.getDate() + 1);
        }

        // Cap at 24 hours from right now
        const maxTime = Date.now() + 24 * 60 * 60 * 1000;
        if (target.getTime() > maxTime) {
            return maxTime;
        }

        return target.getTime();
    };

    const currentDeadlineMs = valueMs || calculateDeadline(hour, minute, ampm);
    const diffMs = Math.max(0, currentDeadlineMs - Date.now());
    const totalMinutes = Math.round(diffMs / 60000);
    const diffHours = Math.floor(totalMinutes / 60);
    const diffMins = totalMinutes % 60;

    // Clean human-friendly relative time string
    const formattedRelativeTime = (() => {
        if (diffHours > 0 && diffMins > 0) {
            return lang === 'id' ? `${diffHours}j ${diffMins}m lagi` : `${diffHours}h ${diffMins}m from now`;
        }
        if (diffHours > 0) {
            if (lang === 'id') return `${diffHours} jam lagi`;
            return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} from now`;
        }
        return lang === 'id' ? `${Math.max(1, diffMins)}m lagi` : `${Math.max(1, diffMins)}m from now`;
    })();

    // Clock dial geometry
    const CENTER_X = 110;
    const CENTER_Y = 110;
    const DIAL_RADIUS = 82;

    const handleDialInteraction = (e) => {
        if (!clockRef.current) return;
        const rect = clockRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const dx = clientX - (rect.left + rect.width / 2);
        const dy = clientY - (rect.top + rect.height / 2);

        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += 2 * Math.PI;

        if (mode === 'hour') {
            let h = Math.round((angle / (2 * Math.PI)) * 12);
            if (h === 0) h = 12;
            setHour(h);
            const newMs = calculateDeadline(h, minute, ampm);
            onChange?.(newMs);
        } else {
            let m = Math.round((angle / (2 * Math.PI)) * 60);
            m = Math.round(m / 5) * 5;
            if (m === 60) m = 0;
            setMinute(m);
            const newMs = calculateDeadline(hour, m, ampm);
            onChange?.(newMs);
        }
    };

    const handleMouseDown = (e) => {
        isDragging.current = true;
        handleDialInteraction(e);
    };

    const handleMouseMove = (e) => {
        if (!isDragging.current) return;
        handleDialInteraction(e);
    };

    const handleMouseUp = () => {
        if (isDragging.current) {
            isDragging.current = false;
            if (mode === 'hour') {
                setMode('minute');
            }
        }
    };

    const handlePreset = (minutesToAdd) => {
        const target = new Date(Date.now() + minutesToAdd * 60 * 1000);
        let h = target.getHours();
        const m = Math.round(target.getMinutes() / 5) * 5 % 60;
        const ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;

        setHour(h);
        setMinute(m);
        setAmpm(ap);
        onChange?.(target.getTime());
    };

    const handleAmpmToggle = (newAp) => {
        setAmpm(newAp);
        const newMs = calculateDeadline(hour, minute, newAp);
        onChange?.(newMs);
    };

    const pad = (n) => String(n).padStart(2, '0');
    const displayHour = pad(hour);
    const displayMinute = pad(minute);

    const currentAngle = mode === 'hour'
        ? ((hour % 12) * 30 - 90) * (Math.PI / 180)
        : ((minute / 60) * 360 - 90) * (Math.PI / 180);

    const pointerX = CENTER_X + DIAL_RADIUS * Math.cos(currentAngle);
    const pointerY = CENTER_Y + DIAL_RADIUS * Math.sin(currentAngle);

    const hourNumbers = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const minuteNumbers = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    return (
        <div className={`p-4 rounded-xl bg-[#181711] border border-[#3B3929] text-[#FAFAFA] shadow-lg space-y-3.5 ${className}`}>
            {/* Header / Title Bar */}
            <div className="flex items-center justify-between border-b border-[#3B3929]/70 pb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-[#C9AA71] uppercase">
                    <Clock className="w-4 h-4 text-[#C9AA71] animate-pulse" />
                    <span>{lang === 'id' ? 'Batas Waktu Target' : 'Target Time Limit'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-500/30">
                        MAX 24H
                    </span>
                    <button
                        type="button"
                        onClick={() => setInputMode(inputMode === 'clock' ? 'text' : 'clock')}
                        className="p-1 rounded bg-[#2A281E] hover:bg-[#343126] text-[#C9AA71] border border-[#3B3929] transition-colors cursor-pointer"
                        title={inputMode === 'clock' ? 'Switch to text input' : 'Switch to clock dial'}
                    >
                        {inputMode === 'clock' ? <Keyboard className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* Digital Display & AM/PM */}
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[#13120D] rounded-xl border border-[#2A281E]">
                <div className="flex items-center gap-1">
                    {/* Hour Box */}
                    <button
                        type="button"
                        onClick={() => setMode('hour')}
                        className={`w-14 h-12 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                            mode === 'hour'
                                ? 'bg-[#C9AA71] text-[#13120D] shadow-md ring-2 ring-[#C9AA71]/50 font-black'
                                : 'bg-[#2A281E] text-foreground hover:bg-[#343126]'
                        }`}
                    >
                        <span className="text-2xl font-mono leading-none">{displayHour}</span>
                        <span className="text-[9px] uppercase tracking-wider opacity-70">
                            {lang === 'id' ? 'Jam' : 'Hour'}
                        </span>
                    </button>

                    <span className="text-2xl font-bold font-mono text-[#C9AA71] px-0.5">:</span>

                    {/* Minute Box */}
                    <button
                        type="button"
                        onClick={() => setMode('minute')}
                        className={`w-14 h-12 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                            mode === 'minute'
                                ? 'bg-[#C9AA71] text-[#13120D] shadow-md ring-2 ring-[#C9AA71]/50 font-black'
                                : 'bg-[#2A281E] text-foreground hover:bg-[#343126]'
                        }`}
                    >
                        <span className="text-2xl font-mono leading-none">{displayMinute}</span>
                        <span className="text-[9px] uppercase tracking-wider opacity-70">
                            {lang === 'id' ? 'Mnt' : 'Min'}
                        </span>
                    </button>

                    {/* AM / PM Toggle */}
                    <div className="flex flex-col rounded-lg overflow-hidden border border-[#3B3929] bg-[#2A281E] ml-2">
                        <button
                            type="button"
                            onClick={() => handleAmpmToggle('AM')}
                            className={`px-2.5 py-1 text-[11px] font-black font-mono transition-colors cursor-pointer ${
                                ampm === 'AM'
                                    ? 'bg-[#C9AA71] text-[#13120D]'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-[#343126]'
                            }`}
                        >
                            AM
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAmpmToggle('PM')}
                            className={`px-2.5 py-1 text-[11px] font-black font-mono transition-colors cursor-pointer border-t border-[#3B3929] ${
                                ampm === 'PM'
                                    ? 'bg-[#C9AA71] text-[#13120D]'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-[#343126]'
                            }`}
                        >
                            PM
                        </button>
                    </div>
                </div>

                {/* Relative Countdown Badge */}
                <div className="text-right flex flex-col items-end">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        {lang === 'id' ? 'Selesai dalam:' : 'Resolves in:'}
                    </span>
                    <span className="font-mono text-xs sm:text-sm font-black text-amber-400">
                        {formattedRelativeTime}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                        {new Date(currentDeadlineMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </div>

            {/* Interactive Dial or Direct Text Mode */}
            {inputMode === 'clock' ? (
                <div className="flex justify-center py-1 select-none">
                    <div
                        ref={clockRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onTouchStart={handleMouseDown}
                        onTouchMove={handleMouseMove}
                        onTouchEnd={handleMouseUp}
                        className="relative w-[220px] h-[220px] rounded-full bg-[#201E17] border-2 border-[#3B3929] shadow-inner cursor-pointer"
                    >
                        {/* Dial Sub-ring styling */}
                        <div className="absolute inset-2 rounded-full border border-dashed border-[#3B3929]/50 pointer-events-none" />

                        {/* Center Pivot Point */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#C9AA71] shadow-md z-20" />

                        {/* Pointer Arm / Hand */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                            <line
                                x1={CENTER_X}
                                y1={CENTER_Y}
                                x2={pointerX}
                                y2={pointerY}
                                stroke="#C9AA71"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                            />
                            <circle
                                cx={pointerX}
                                cy={pointerY}
                                r="14"
                                fill="#C9AA71"
                            />
                        </svg>

                        {/* Dial Numbers */}
                        {(mode === 'hour' ? hourNumbers : minuteNumbers).map((num, i) => {
                            const angle = ((i * 30 - 90) * Math.PI) / 180;
                            const x = CENTER_X + DIAL_RADIUS * Math.cos(angle);
                            const y = CENTER_Y + DIAL_RADIUS * Math.sin(angle);
                            const isSelected = mode === 'hour'
                                ? (num === 12 ? hour === 12 : hour === num)
                                : minute === num;

                            return (
                                <div
                                    key={num}
                                    style={{
                                        left: `${x}px`,
                                        top: `${y}px`,
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                    className={`absolute w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-mono font-bold z-10 pointer-events-none transition-colors ${
                                        isSelected ? 'text-[#13120D] font-black' : 'text-[#D5CCA6]'
                                    }`}
                                >
                                    {mode === 'minute' ? pad(num) : num}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                /* Keyboard Input Mode */
                <div className="py-4 flex flex-col items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        {lang === 'id' ? 'Ketik langsung jam dan menit:' : 'Enter hours and minutes directly:'}
                    </span>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min="1"
                            max="12"
                            value={hour}
                            onChange={(e) => {
                                const val = Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1));
                                setHour(val);
                                const newMs = calculateDeadline(val, minute, ampm);
                                onChange?.(newMs);
                            }}
                            className="w-14 h-10 text-center text-lg font-mono font-bold bg-[#2A281E] border border-[#3B3929] rounded-lg text-foreground"
                        />
                        <span className="text-lg font-bold font-mono text-[#C9AA71]">:</span>
                        <input
                            type="number"
                            min="0"
                            max="59"
                            step="5"
                            value={minute}
                            onChange={(e) => {
                                const val = Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0));
                                setMinute(val);
                                const newMs = calculateDeadline(hour, val, ampm);
                                onChange?.(newMs);
                            }}
                            className="w-14 h-10 text-center text-lg font-mono font-bold bg-[#2A281E] border border-[#3B3929] rounded-lg text-foreground"
                        />
                    </div>
                </div>
            )}

            {/* Quick Presets Bar */}
            <div className="space-y-1.5 pt-0.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                    {lang === 'id' ? 'Preset Cepat:' : 'Quick Presets:'}
                </span>
                <div className="grid grid-cols-4 gap-1.5 sm:flex sm:items-center sm:gap-1.5 sm:flex-wrap">
                    {[
                        { label: '15m', mins: 15 },
                        { label: '30m', mins: 30 },
                        { label: '1h', mins: 60 },
                        { label: '2h', mins: 120 },
                        { label: '4h', mins: 240 },
                        { label: '8h', mins: 480 },
                        { label: '12h', mins: 720 },
                        { label: '24h', mins: 1440 },
                    ].map((p) => (
                        <button
                            key={p.label}
                            type="button"
                            onClick={() => handlePreset(p.mins)}
                            className="px-2 py-1.5 rounded-md text-[11px] font-mono font-semibold bg-[#2A281E] hover:bg-[#343126] text-[#C9AA71] border border-[#3B3929] hover:border-[#C9AA71]/60 transition-all cursor-pointer text-center"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * Backwards compatibility wrapper if modal dialog usage is ever requested
 */
export function CircularTimePickerModal({
    open,
    onClose,
    onSelectTime,
    initialDeadlineMs = null,
    lang = 'en',
}) {
    const [selectedMs, setSelectedMs] = useState(initialDeadlineMs);

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="max-w-[340px] sm:max-w-[360px] p-4 bg-[#181711] border border-[#3B3929] text-[#FAFAFA] shadow-2xl rounded-2xl">
                <InlineAnalogClockPicker
                    valueMs={selectedMs}
                    onChange={(ms) => {
                        setSelectedMs(ms);
                        onSelectTime?.(ms);
                    }}
                    lang={lang}
                />
            </DialogContent>
        </Dialog>
    );
}
