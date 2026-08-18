import { Link } from '@inertiajs/react';

export default function GuestLayout({ children }) {
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
            <div className="relative z-10 flex w-full max-w-4xl flex-col md:flex-row overflow-hidden rounded-2xl bg-white/95 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-md">
                
                {/* Left Side: Branding */}
                <div className="flex flex-col items-center justify-center bg-gray-50/50 p-10 md:w-1/2 border-b md:border-b-0 md:border-r border-gray-200">
                    <img 
                        src="/logo.png" 
                        alt="Telunas Resorts" 
                        className="w-56 object-contain drop-shadow-sm transition-transform duration-300 hover:scale-105" 
                    />
                    <h2 className="mt-8 text-3xl font-bold text-gray-800 tracking-tight">Issue Tracker</h2>
                    <p className="mt-3 text-center text-sm text-gray-500 leading-relaxed">
                        Welcome to the official Telunas Resorts maintenance and issue management system.
                    </p>
                </div>

                {/* Right Side: Form Content */}
                <div className="flex w-full flex-col justify-center p-8 md:w-1/2 md:p-12">
                    {children}
                </div>
            </div>
        </div>
    );
}
