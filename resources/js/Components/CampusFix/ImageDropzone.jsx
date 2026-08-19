import { useRef, useState } from 'react';
import { ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ImageDropzone({ previewUrl, onChange, label = 'Upload a photo', className, maxMb = 5 }) {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState(null);

    const handleFile = (file) => {
        if (!file) return;
        setError(null);

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (!allowedTypes.includes(file.type.toLowerCase())) {
            setError('Only JPG, PNG, and WebP images are allowed.');
            return;
        }

        const maxBytes = maxMb * 1024 * 1024;
        if (file.size > maxBytes) {
            setError(`Image size must be smaller than ${maxMb}MB.`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            onChange(file, e.target.result);
        };
        reader.readAsDataURL(file);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        handleFile(file);
    };

    return (
        <div className={cn('relative space-y-1', className)}>
            {previewUrl ? (
                <div className="relative overflow-hidden rounded-lg border border-border">
                    <img
                        src={previewUrl}
                        alt="Preview"
                        className="h-40 w-full object-cover"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            setError(null);
                            onChange(null, null);
                        }}
                        className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className={cn(
                        'flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors',
                        dragging
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50',
                        error && 'border-destructive bg-destructive/5'
                    )}
                >
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">Drag & drop or click to browse (Max {maxMb}MB)</p>
                </button>
            )}
            {error && (
                <p className="text-xs font-medium text-destructive">{error}</p>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
            />
        </div>
    );
}

