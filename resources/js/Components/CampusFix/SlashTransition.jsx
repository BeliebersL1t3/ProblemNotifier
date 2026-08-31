import React, { useState, createContext, useContext, useEffect, useRef } from 'react';
import { router } from '@inertiajs/react';
import anime from 'animejs';

const SlashContext = createContext({
    navigateWithSlash: (href, title) => {}
});

export const useSlashTransition = () => useContext(SlashContext);

export function SlashProvider({ children }) {
    const [phase, setPhase] = useState('idle'); // 'idle', 'active', 'fading'
    const [destTitle, setDestTitle] = useState('');
    const textContainerRef = useRef(null);
    const animRef = useRef(null);
    const isNavigatingRef = useRef(false);

    const getTitleFromHref = (href, explicitTitle) => {
        if (explicitTitle) return explicitTitle.toUpperCase();
        if (typeof href === 'string') {
            if (href.includes('analytics')) return 'ANALYTICS';
            if (href.includes('dashboard')) return 'DASHBOARD';
            const clean = href.replace(/^\//, '').split('/')[0];
            if (clean) return clean.toUpperCase();
        }
        return 'TELUNAS';
    };

    const navigateWithSlash = (href, title) => {
        if (phase !== 'idle' || isNavigatingRef.current) return;
        isNavigatingRef.current = true;

        const targetTitle = getTitleFromHref(href, title);
        setDestTitle(targetTitle);

        // 1. Immediately cover screen with theater layer and start slash animation
        setPhase('active');

        // 2. Start background Inertia visit immediately behind the dark layer
        router.visit(href, {
            preserveScroll: false,
            preserveState: false,
        });

        // 3. Allow animation to play its full dramatic performance, then fade overlay away smoothly
        setTimeout(() => {
            setPhase('fading');
        }, 1250);

        // 4. Return to idle after fade completes
        setTimeout(() => {
            setPhase('idle');
            setDestTitle('');
            isNavigatingRef.current = false;
        }, 1850);
    };

    // Fail-safe router listeners and maximum timeout to ensure overlay never blocks the screen
    useEffect(() => {
        const removeError = router.on('error', () => {
            setPhase('idle');
            setDestTitle('');
            isNavigatingRef.current = false;
        });
        const removeCancel = router.on('cancel', () => {
            setPhase('idle');
            setDestTitle('');
            isNavigatingRef.current = false;
        });

        // Fail-safe auto reset if transition somehow hangs
        let failSafeTimer;
        if (phase !== 'idle') {
            failSafeTimer = setTimeout(() => {
                setPhase('idle');
                setDestTitle('');
                isNavigatingRef.current = false;
            }, 2500);
        }

        return () => {
            removeError();
            removeCancel();
            if (failSafeTimer) clearTimeout(failSafeTimer);
        };
    }, [phase]);

    // Trigger anime.js kinetic typography when entering transition
    useEffect(() => {
        if (phase === 'active' && textContainerRef.current) {
            if (animRef.current) {
                animRef.current.pause();
            }

            const letters = textContainerRef.current.querySelectorAll('.anime-char');
            const headerTag = textContainerRef.current.querySelector('.anime-header-tag');
            const line = textContainerRef.current.querySelector('.anime-line');
            const badge = textContainerRef.current.querySelector('.anime-badge');

            const tl = anime.timeline({
                easing: 'easeOutExpo',
            });

            // 1. Tagline fades and slides down
            tl.add({
                targets: headerTag,
                opacity: [0, 0.85],
                translateY: [-12, 0],
                duration: 350,
                delay: 100,
            })
            // 2. Letters stagger explode in with pure GPU transforms
            .add({
                targets: letters,
                opacity: [0, 1],
                translateY: [45, 0],
                scale: [0.25, 1],
                rotateZ: [-15, 0],
                delay: anime.stagger(40, { start: 50 }),
                duration: 650,
                easing: 'easeOutElastic(1, .7)',
            }, '-=250')
            // 3. Golden accent line draws out from center
            .add({
                targets: line,
                scaleX: [0, 1],
                opacity: [0, 1],
                duration: 400,
                easing: 'easeInOutCubic',
            }, '-=400')
            // 4. Switching badge appears
            .add({
                targets: badge,
                opacity: [0, 1],
                translateY: [8, 0],
                duration: 300,
            }, '-=250')
            // 5. Letter subtle floating rhythm while holding
            .add({
                targets: letters,
                translateY: [0, -5, 0],
                delay: anime.stagger(25),
                duration: 500,
                easing: 'easeInOutSine',
            }, '+=50');

            animRef.current = tl;
        }

        return () => {
            if (animRef.current) {
                animRef.current.pause();
            }
        };
    }, [phase]);

    return (
        <SlashContext.Provider value={{ navigateWithSlash }}>
            {children}

            {/* FULL-SCREEN THEATER OVERLAY PLAYING ABOVE THE PAGE */}
            {phase !== 'idle' && (
                <div
                    className={`fixed inset-0 z-[99999] bg-[#14130B] flex items-center justify-center overflow-hidden transition-all duration-600 ease-out select-none ${
                        phase === 'fading'
                            ? 'opacity-0 pointer-events-none scale-105'
                            : 'opacity-100 pointer-events-auto scale-100'
                    }`}
                    style={{ transform: 'translateZ(0)', willChange: 'opacity, transform' }}
                >
                    {/* Katana Slash Laser Beam on entrance */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div 
                            className="w-[200vw] h-[8px] bg-gradient-to-r from-transparent via-amber-200 to-transparent shadow-[0_0_50px_#f59e0b,0_0_100px_#ffffff] -rotate-[22deg] animate-slash-line z-10"
                        />
                    </div>

                    {/* Katana Seam Flash Glow when fading/opening */}
                    {phase === 'fading' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                            <div 
                                className="w-[200vw] h-[6px] bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_50px_#f59e0b] -rotate-[22deg] animate-seam-flash"
                            />
                        </div>
                    )}

                    {/* Kinetic Typography Container */}
                    {destTitle && (
                        <div 
                            ref={textContainerRef}
                            className="relative z-20 flex flex-col items-center justify-center px-4"
                        >
                            {/* Brand header tagline */}
                            <div className="anime-header-tag opacity-0 text-[10px] sm:text-xs font-black tracking-[0.3em] uppercase text-amber-300/80 mb-2">
                                ✦ TELUNAS RESORTS ✦
                            </div>

                            {/* Main kinetic destination typography */}
                            <div className="flex items-center justify-center flex-wrap gap-x-1 gap-y-0 text-center my-1">
                                {destTitle.split('').map((char, index) => (
                                    <span
                                        key={index}
                                        className="anime-char inline-block font-extrabold tracking-wider text-4xl sm:text-6xl md:text-7xl uppercase bg-gradient-to-b from-white via-amber-100 to-[#C9AA71] bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(201,170,113,0.5)] opacity-0"
                                        style={{
                                            fontFamily: 'Resort, serif',
                                            transformOrigin: '50% 50%',
                                            willChange: 'transform, opacity',
                                            transform: 'translateZ(0)',
                                        }}
                                    >
                                        {char === ' ' ? '\u00A0' : char}
                                    </span>
                                ))}
                            </div>

                            {/* Glowing gold line separator */}
                            <div 
                                className="anime-line opacity-0 h-[2px] w-36 sm:w-56 bg-gradient-to-r from-transparent via-[#C9AA71] to-transparent shadow-[0_0_15px_#f59e0b] my-3 origin-center scale-x-0" 
                                style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
                            />

                            {/* Destination Mode Indicator */}
                            <div className="anime-badge opacity-0 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3.5 py-1 text-[11px] font-semibold text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                                <span>OPENING VIEW</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </SlashContext.Provider>
    );
}
