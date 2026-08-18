import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/Components/ui/Dialog';

export default function DelayDetailModal({ open, onOpenChange, delayItem }) {
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
                        <div className="overflow-hidden rounded-md border border-border/50 bg-muted">
                            <img 
                                src={delayItem.image} 
                                alt="Delay Proof" 
                                className="w-full object-contain max-h-[300px]"
                            />
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
            </DialogContent>
        </Dialog>
    );
}
