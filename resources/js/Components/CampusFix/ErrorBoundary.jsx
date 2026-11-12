import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { readStoredLeanTheme } from '@/hooks/useLeanTheme';

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
            const isDark = readStoredLeanTheme() === 'dark';

            return (
                <div className={`min-h-screen flex flex-col items-center justify-center p-6 text-center ${
                    isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
                }`}>
                    <div className={`max-w-lg w-full border rounded-2xl p-8 shadow-2xl space-y-5 ${
                        isDark ? 'bg-slate-900 border-rose-500/30' : 'bg-white border-rose-200'
                    }`}>
                        <div className={`w-14 h-14 mx-auto rounded-2xl border flex items-center justify-center ${
                            isDark
                                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                                : 'bg-rose-50 border-rose-200 text-rose-600'
                        }`}>
                            <AlertTriangle className="w-7 h-7" />
                        </div>
                        <div>
                            <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                Tampilan Terganggu / Render Error
                            </h2>
                            <p className={`text-xs mt-1.5 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                Terjadi kendala saat memuat antarmuka. Silakan muat ulang atau kembali ke dashboard.
                            </p>
                        </div>
                        {this.state.error?.message && (
                            <div className={`text-left border rounded-xl p-3.5 text-xs font-mono overflow-x-auto max-h-32 ${
                                isDark
                                    ? 'bg-slate-950 border-slate-800 text-rose-300'
                                    : 'bg-rose-50/70 border-rose-200 text-rose-700'
                            }`}>
                                {this.state.error.message}
                            </div>
                        )}
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => this.setState({ hasError: false, error: null })}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                    isDark
                                        ? 'border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                                        : 'border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Coba Lagi
                            </button>
                            <button
                                type="button"
                                onClick={() => { window.location.href = '/'; }}
                                className="flex-1 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
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
