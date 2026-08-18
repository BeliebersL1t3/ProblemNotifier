import React, { useState, createContext, useContext } from 'react';
import { router } from '@inertiajs/react';

const SlashContext = createContext({
    navigateWithSlash: (href) => {}
});

export const useSlashTransition = () => useContext(SlashContext);

export function SlashProvider({ children }) {
    const [phase, setPhase] = useState('idle'); // 'idle', 'slash', 'black-hold', 'combine'

    const navigateWithSlash = (href) => {
        if (phase !== 'idle') return;

        // Phase 1: Slow Katana Slash & Fall to Pure Black (0ms - 850ms)
        setPhase('slash');

        // Phase 2: Hold Pitch Black Screen & Navigate in Background (850ms - 1350ms)
        setTimeout(() => {
            setPhase('black-hold');
            router.visit(href, {
                preserveScroll: false,
                preserveState: false,
            });
        }, 850);

        // Phase 3: Combine Slices Reveal from Pure Black (1350ms - 2250ms)
        setTimeout(() => {
            setPhase('combine');
        }, 1350);

        // Finish transition at 2250ms
        setTimeout(() => {
            setPhase('idle');
        }, 2250);
    };

    return (
        <SlashContext.Provider value={{ navigateWithSlash }}>
            {children}

            {/* PHASE 1: Slow Katana Slash & Fall to Pure Pitch Black */}
            {phase === 'slash' && (
                <div className="fixed inset-0 z-[99999] pointer-events-none overflow-hidden bg-black">
                    {/* Glowing Katana Slash Laser Beam */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div 
                            className="w-[200vw] h-[8px] bg-gradient-to-r from-transparent via-amber-200 to-transparent shadow-[0_0_50px_#f59e0b,0_0_100px_#ffffff] -rotate-[22deg] animate-slash-line z-30"
                        />
                    </div>

                    {/* Top-Right Falling Pure Black Slice */}
                    <div 
                        className="absolute inset-0 bg-black border-b-4 border-amber-400 shadow-[0_10px_30px_rgba(245,158,11,0.5)] animate-fall-top-right z-20"
                        style={{
                            clipPath: 'polygon(0 0, 100% 0, 100% 80%, 0 20%)',
                        }}
                    />

                    {/* Bottom-Left Falling Pure Black Slice */}
                    <div 
                        className="absolute inset-0 bg-black border-t-4 border-amber-400 shadow-[0_-10px_30px_rgba(245,158,11,0.5)] animate-fall-bottom-left z-20"
                        style={{
                            clipPath: 'polygon(0 20%, 100% 80%, 100% 100%, 0 100%)',
                        }}
                    />
                </div>
            )}

            {/* PHASE 2: HOLD PURE PITCH BLACK WHILE PAGE CHANGES */}
            {phase === 'black-hold' && (
                <div className="fixed inset-0 z-[99999] pointer-events-none bg-black flex items-center justify-center">
                    <div className="w-[200vw] h-[2px] bg-amber-400/20 -rotate-[22deg]" />
                </div>
            )}

            {/* PHASE 3: COMBINING REVEAL FROM PURE BLACK */}
            {phase === 'combine' && (
                <div className="fixed inset-0 z-[99999] pointer-events-none overflow-hidden">
                    {/* Top-Right Slice Combining In */}
                    <div 
                        className="absolute inset-0 bg-black border-b-2 border-amber-400/60 animate-combine-top-right z-20"
                        style={{
                            clipPath: 'polygon(0 0, 100% 0, 100% 80%, 0 20%)',
                        }}
                    />

                    {/* Bottom-Left Slice Combining In */}
                    <div 
                        className="absolute inset-0 bg-black border-t-2 border-amber-400/60 animate-combine-bottom-left z-20"
                        style={{
                            clipPath: 'polygon(0 20%, 100% 80%, 100% 100%, 0 100%)',
                        }}
                    />

                    {/* Seam Flash Glow when halves lock together */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div 
                            className="w-[200vw] h-[4px] bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_40px_#f59e0b] -rotate-[22deg] animate-seam-flash z-30"
                        />
                    </div>
                </div>
            )}
        </SlashContext.Provider>
    );
}
