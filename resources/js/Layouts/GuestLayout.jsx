import { Link } from '@inertiajs/react';
import { useLanguage } from '@/context/LanguageContext';

export default function GuestLayout({ children, leftBottomAction = null }) {
    const { lang, setLang } = useLanguage();
    const isEn = lang === 'en';

    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
            {/* Background Image with blur and darken */}
            <div 
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
                style={{ 
                    backgroundImage: "url('/header-bg.jpg')",
                    filter: "blur(6px) brightness(0.45)",
                    transform: "scale(1.05)" // prevents white borders from the blur
                }}
            />

            {/* Content Container */}
            <div className="relative z-10 flex w-full max-w-4xl flex-col md:flex-row overflow-hidden rounded-2xl bg-white/95 text-gray-900 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-md">
                {/* Language Switcher (ID | EN) */}
                <div
                    className="absolute top-3.5 right-3.5 z-30 flex items-center rounded-lg border border-gray-200 bg-white/90 p-0.5 text-[11px] font-bold shadow-sm backdrop-blur-sm"
                    role="group"
                    aria-label={isEn ? 'Language switcher' : 'Pilih bahasa'}
                >
                    <button
                        type="button"
                        onClick={() => setLang('id')}
                        className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                            lang === 'id'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        ID
                    </button>
                    <button
                        type="button"
                        onClick={() => setLang('en')}
                        className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                            lang === 'en'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        EN
                    </button>
                </div>

                {/* Left Side: Branding */}
                <div className="relative flex flex-col items-center justify-center bg-gray-50/50 p-10 md:w-1/2 border-b md:border-b-0 md:border-r border-gray-200">
                    <img 
                        src="/logo.png" 
                        alt="Telunas Resorts" 
                        className="w-56 object-contain drop-shadow-sm transition-transform duration-300 hover:scale-105" 
                    />
                    <h2 className="mt-8 text-3xl font-bold text-gray-800 tracking-tight">Issue Tracker</h2>
                    <p className="mt-3 text-center text-sm text-gray-500 leading-relaxed">
                        {isEn
                            ? 'Welcome to the official Telunas Resorts maintenance and issue management system.'
                            : 'Selamat datang di sistem resmi pemeliharaan dan manajemen isu Telunas Resorts.'}
                    </p>

                    {leftBottomAction && (
                        <div className="mt-6 self-start md:mt-0 md:absolute md:bottom-3.5 md:left-3.5 z-20">
                            {leftBottomAction}
                        </div>
                    )}
                </div>

                {/* Right Side: Form Content */}
                <div className="flex w-full flex-col justify-center p-8 pt-12 md:pt-12 md:w-1/2 md:p-12">
                    {children}
                </div>
            </div>
        </div>
    );
}
