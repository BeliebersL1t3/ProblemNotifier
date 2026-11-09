/**
 * Client-Side Image Compressor for Telunas Mobile & PWA
 * Reduces camera photos (5-12 MB) to ~200-400 KB before saving to IndexedDB or uploading.
 */

export async function compressImage(file, options = {}) {
    const {
        maxWidth = 1600,
        maxHeight = 1600,
        quality = 0.75,
        mimeType = 'image/jpeg'
    } = options;

    if (!file || !file.type.startsWith('image/')) {
        return {
            file,
            blob: file,
            dataUrl: null,
            originalSize: file ? file.size : 0,
            compressedSize: file ? file.size : 0,
            wasCompressed: false
        };
    }

    const originalSize = file.size;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;

                if (width > maxWidth || height > maxHeight) {
                    if (width / height > maxWidth / maxHeight) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    console.warn('[ImageCompressor] Canvas 2D context unavailable, using original file.');
                    resolve({
                        file,
                        blob: file,
                        dataUrl: event.target.result,
                        originalSize,
                        compressedSize: originalSize,
                        wasCompressed: false
                    });
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            console.warn('[ImageCompressor] toBlob conversion failed, using original file.');
                            resolve({
                                file,
                                blob: file,
                                dataUrl: event.target.result,
                                originalSize,
                                compressedSize: originalSize,
                                wasCompressed: false
                            });
                            return;
                        }

                        // Convert blob to File with original or jpeg extension
                        const originalName = file.name || 'photo.jpg';
                        const dotIndex = originalName.lastIndexOf('.');
                        const baseName = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
                        const compressedFileName = `${baseName}.jpg`;

                        const compressedFile = new File([blob], compressedFileName, {
                            type: mimeType,
                            lastModified: Date.now()
                        });

                        const dataUrl = canvas.toDataURL(mimeType, quality);

                        resolve({
                            file: compressedFile,
                            blob,
                            dataUrl,
                            originalSize,
                            compressedSize: blob.size,
                            wasCompressed: true
                        });
                    },
                    mimeType,
                    quality
                );
            };

            img.onerror = (err) => {
                console.error('[ImageCompressor] Image loading failed:', err);
                reject(new Error(`Gagal memuat gambar untuk kompresi: ${err?.message || 'Format tidak valid'}`));
            };

            img.src = event.target.result;
        };

        reader.onerror = (err) => {
            console.error('[ImageCompressor] FileReader error:', err);
            reject(new Error(`Gagal membaca file gambar: ${err?.message || 'Akses ditolak'}`));
        };

        reader.readAsDataURL(file);
    });
}
