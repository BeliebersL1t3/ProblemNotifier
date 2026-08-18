import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export function ScrollToTop() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const toggleVisibility = () => {
            if (window.scrollY > 250) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        window.addEventListener('scroll', toggleVisibility);
        return () => window.removeEventListener('scroll', toggleVisibility);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    };

    if (!isVisible) return null;

    return (
        <button
            onClick={scrollToTop}
            aria-label="Scroll to top"
            className="fixed bottom-6 left-6 z-50 flex items-center justify-center p-3 rounded-full bg-[#1C1B0E] text-[#E3D1AA] border border-[#C9AA71]/40 shadow-xl hover:bg-[#C9AA71] hover:text-[#1C1B0E] hover:scale-110 active:scale-95 transition-all duration-300 group"
            title="Scroll to top"
        >
            <ArrowUp className="h-5 w-5 transition-transform group-hover:-translate-y-0.5" />
        </button>
    );
}
