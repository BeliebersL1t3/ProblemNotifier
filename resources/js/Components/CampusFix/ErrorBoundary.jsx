import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/Components/UI/Button';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('CampusFix ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#1C1B0E] text-[#FAFAFA] flex flex-col items-center justify-center p-6 text-center">
                    <div className="max-w-lg w-full bg-[#2A281E] border border-red-500/30 rounded-2xl p-8 shadow-2xl space-y-5">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                            <AlertTriangle className="w-7 h-7" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[#FAFAFA]">Tampilan Terganggu / Render Error</h2>
                            <p className="text-xs text-[#A19F8D] mt-1.5 leading-relaxed">
                                Terjadi kendala saat memuat antarmuka. Silakan muat ulang atau kembali ke dashboard.
                            </p>
                        </div>
                        {this.state.error?.message && (
                            <div className="text-left bg-[#1C1B0E] border border-[#3B3929] rounded-xl p-3.5 text-xs text-red-300 font-mono overflow-x-auto max-h-32">
                                {this.state.error.message}
                            </div>
                        )}
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => this.setState({ hasError: false, error: null })}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-[#3B3929] text-[#A19F8D] hover:text-[#FAFAFA] hover:bg-[#3B3929]/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Coba Lagi
                            </button>
                            <button
                                type="button"
                                onClick={() => { window.location.href = '/dashboard'; }}
                                className="flex-1 py-2.5 rounded-xl text-xs font-extrabold bg-[#C9AA71] text-[#1C1B0E] hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                            >
                                Ke Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
