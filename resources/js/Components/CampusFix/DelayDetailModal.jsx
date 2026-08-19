import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/Components/ui/Dialog';

import { ImageLightboxModal } from './ImageLightboxModal';
import { useState } from 'react';
import { ZoomIn } from 'lucide-react';

export default function DelayDetailModal({ open, onOpenChange, delayItem }) {
    const [previewImage, setPreviewImage] = useState(null);
    if (!delayItem) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Delay Details</DialogTitle>
                    <DialogDescription>
                        Full information for this delay event.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="flex flex-col gap-4 py-4">
                    {delayItem.image && (
                        <div className="overflow-hidden rounded-md border border-border/50 bg-muted group cursor-pointer relative" onClick={() => setPreviewImage(delayItem.image)}>
                            <img 
                                src={delayItem.image} 
                                alt="Delay Proof" 
                                className="w-full object-contain max-h-[300px] transition-transform duration-200 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="p-1.5 rounded-full bg-black/80 text-white border border-white/20">
                                    <ZoomIn className="w-4 h-4 text-[#C9AA71]" />
                                </span>
                            </div>
                        </div>
                    )}
                    
                    <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-semibold text-orange-600">
                            Delayed by {delayItem.by}
                        </span>
                        {delayItem.date && (
                            <span className="text-xs text-muted-foreground">
                                Date: {delayItem.date}
                            </span>
                        )}
                        
                        <div className="mt-2 rounded-md bg-orange-500/10 p-3 text-sm text-foreground/90 whitespace-pre-wrap border border-orange-500/20">
                            {delayItem.reason}
                        </div>
                    </div>
                </div>
            <ImageLightboxModal 
                    open={!!previewImage} 
                    onClose={() => setPreviewImage(null)} 
                    src={previewImage} 
                    title="Foto Penundaan / Delay" 
                    subtitle={delayItem?.by ? `Ditunda oleh ${delayItem.by}` : 'Bukti Penundaan'} 
                />
            </DialogContent>
        </Dialog>
    );
}
