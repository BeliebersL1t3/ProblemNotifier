import { useRef, useState } from 'react';
import { ImageIcon, Camera, Upload, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Client-side canvas compression to downscale massive smartphone camera photos
 * (e.g. 12MB 4000x3000 -> ~350KB 1600px JPEG) for fast upload on island Wi-Fi.
 */
const compressImage = async (file, maxDimension = 1600, quality = 0.82) => {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
            resolve({ file, dataUrl: null });
            return;
        }

        // If file is already small (< 400KB), keep as is
        if (file.size < 400 * 1024) {
            const reader = new FileReader();
            reader.onload = (e) => resolve({ file, dataUrl: e.target.result });
            reader.onerror = () => resolve({ file, dataUrl: null });
            reader.readAsDataURL(file);
            return;
        }

        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve({ file, dataUrl: e.target.result });
                        reader.readAsDataURL(file);
                        return;
                    }
                    const cleanName = (file.name || 'photo').replace(/\.[^/.]+$/, '') + '.jpg';
                    const compressedFile = new File([blob], cleanName, { type: 'image/jpeg' });
                    const reader = new FileReader();
                    reader.onload = (e) => resolve({ file: compressedFile, dataUrl: e.target.result });
                    reader.readAsDataURL(blob);
                },
                'image/jpeg',
                quality
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            const reader = new FileReader();
            reader.onload = (e) => resolve({ file, dataUrl: e.target.result });
            reader.readAsDataURL(file);
        };
        img.src = url;
    });
};

export function ImageDropzone({ previewUrl, onChange, label = 'Upload a photo', className, maxMb = 5 }) {
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [error, setError] = useState(null);

    const handleFile = async (file) => {
        if (!file) return;
        setError(null);

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (!allowedTypes.includes(file.type.toLowerCase())) {
            setError('Hanya format JPG, PNG, dan WebP yang didukung.');
            return;
        }

        setIsOptimizing(true);
        try {
            // Compress and downscale automatically
            const { file: optimizedFile, dataUrl } = await compressImage(file, 1600, 0.82);

            const maxBytes = maxMb * 1024 * 1024;
            if (optimizedFile.size > maxBytes) {
                setError(`Ukuran gambar melebihi ${maxMb}MB.`);
                return;
            }

            onChange(optimizedFile, dataUrl);
        } catch (err) {
            console.error('Image compression error:', err);
            setError('Gagal memproses gambar.');
        } finally {
            setIsOptimizing(false);
        }
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        handleFile(file);
    };

    return (
        <div className={cn('relative space-y-1.5', className)}>
            {previewUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-[#3B3929] bg-black/40 shadow-inner group">
                    <img
                        src={previewUrl}
                        alt="Preview"
                        className="h-44 w-full object-cover rounded-xl"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                    <button
                        type="button"
                        onClick={() => {
                            setError(null);
                            onChange(null, null);
                        }}
                        className="absolute right-2.5 top-2.5 rounded-full bg-black/70 p-1.5 text-white hover:bg-red-600 transition-colors cursor-pointer shadow-md"
                        title="Hapus Foto"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className={cn(
                        'relative flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed transition-all duration-200 bg-[#2A281E]/40',
                        dragging
                            ? 'border-[#C9AA71] bg-[#C9AA71]/10 scale-[0.99]'
                            : 'border-[#3B3929] hover:border-[#C9AA71]/50 hover:bg-[#2A281E]/80',
                        error && 'border-red-500/80 bg-red-950/20'
                    )}
                >
                    {isOptimizing ? (
                        <div className="flex flex-col items-center justify-center py-6 gap-2 text-[#C9AA71]">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <span className="text-xs font-semibold">Mengoptimalkan gambar...</span>
                        </div>
                    ) : (
                        <>
                            <div className="p-3 rounded-full bg-[#3B3929]/50 text-[#C9AA71] mb-2 shadow-xs">
                                <ImageIcon className="h-6 w-6" />
                            </div>
                            <p className="text-xs sm:text-sm font-bold text-[#FAFAFA] text-center mb-1">
                                {label}
                            </p>
                            <p className="text-[11px] text-[#A19F8D] text-center mb-3">
                                Format JPG, PNG, atau WebP (Otomatis dikompresi)
                            </p>

                            {/* Dual Mobile Action Buttons: Camera & Gallery */}
                            <div className="flex items-center gap-2 w-full max-w-xs justify-center">
                                <button
                                    type="button"
                                    onClick={() => cameraInputRef.current?.click()}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold bg-[#C9AA71] text-[#1C1B0E] hover:bg-[#D8BE8A] active:scale-95 transition-all shadow-md cursor-pointer"
                                >
                                    <Camera className="h-3.5 w-3.5 shrink-0" />
                                    <span>Kamera</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-[#3B3929] text-[#FAFAFA] hover:bg-[#4A4736] active:scale-95 transition-all border border-[#C9AA71]/20 cursor-pointer"
                                >
                                    <Upload className="h-3.5 w-3.5 shrink-0" />
                                    <span>Galeri</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {error && (
                <p className="text-xs font-medium text-red-400 pl-1">{error}</p>
            )}

            {/* Standard File Browser Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                className="hidden"
                onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = '';
                }}
            />

            {/* Native Mobile Camera Direct Input */}
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = '';
                }}
            />
        </div>
    );
}
