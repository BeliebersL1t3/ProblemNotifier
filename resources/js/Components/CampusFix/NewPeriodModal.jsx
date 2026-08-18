import { useState } from 'react';
import { CalendarPlus, Loader2, Trash2, AlertTriangle, CheckCircle2, Check, Calendar } from 'lucide-react';
import { Button } from '@/Components/UI/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { Input } from '@/Components/UI/Input';
import { Label } from '@/Components/UI/Label';
import { useIssues } from '@/context/IssuesContext';

export function NewPeriodModal({ open, onOpenChange, mode = 'dashboard' }) {
    const { createNewPeriod, deletePeriod, availableSheets, currentSheet, setCurrentSheet } = useIssues();
    const [name, setName] = useState(() => String(new Date().getFullYear()));
    const [isCreating, setIsCreating] = useState(false);
    const [deletingSheet, setDeletingSheet] = useState(null); // sheet name being deleted
    const [confirmDelete, setConfirmDelete] = useState(null); // sheet name awaiting confirmation
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setIsCreating(true);
        setError('');
        setSuccessMsg('');
        try {
            await createNewPeriod(trimmed);
            setSuccessMsg(`Period "${trimmed}" created and selected!`);
            setTimeout(() => {
                onOpenChange(false);
                setSuccessMsg('');
            }, 800);
        } catch (err) {
            setError(err.message || 'Failed to create new period.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (sheetName) => {
        setDeletingSheet(sheetName);
        setError('');
        setSuccessMsg('');
        try {
            await deletePeriod(sheetName);
            setConfirmDelete(null);
            setSuccessMsg(`Period "${sheetName}" deleted successfully.`);
        } catch (err) {
            setError(err.message || 'Failed to delete period.');
        } finally {
            setDeletingSheet(null);
        }
    };

    const handleSelectSheet = (sheetName) => {
        setCurrentSheet(sheetName);
        setSuccessMsg(`Switched to period "${sheetName === 'all' ? 'All Sheets' : sheetName}"`);
        setTimeout(() => {
            onOpenChange(false);
            setSuccessMsg('');
        }, 500);
    };

    const alreadyExists = availableSheets.includes(name.trim());

    // Build selectable sheets list (include 'all' option if in analytics mode)
    const displaySheets = mode === 'analytics' 
        ? [...availableSheets, 'all'] 
        : availableSheets;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!isCreating && !deletingSheet) onOpenChange(o); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        Manage Periods & Sheets
                    </DialogTitle>
                    <DialogDescription>
                        Create a new period or select/manage your active Google Sheet tabs.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-5 py-2">
                    {error && (
                        <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">
                            {error}
                        </div>
                    )}

                    {successMsg && (
                        <div className="rounded-md bg-emerald-500/15 p-3 text-sm font-medium text-emerald-500 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            {successMsg}
                        </div>
                    )}

                    {/* Section 1 (TOP): Create New Period */}
                    <div className="grid gap-2 bg-muted/20 p-4 rounded-xl border border-border/50">
                        <Label htmlFor="periodName" className="font-bold text-sm">Create New Period</Label>
                        <div className="flex gap-2">
                            <Input
                                id="periodName"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={String(new Date().getFullYear())}
                                disabled={isCreating || !!deletingSheet}
                                onKeyDown={(e) => e.key === 'Enter' && !alreadyExists && handleCreate()}
                                className="h-9"
                            />
                            <Button 
                                onClick={handleCreate} 
                                disabled={isCreating || !!deletingSheet || !name.trim() || alreadyExists} 
                                size="sm"
                                className="gap-1.5 shrink-0"
                            >
                                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                                {isCreating ? 'Creating…' : 'Create'}
                            </Button>
                        </div>
                        {alreadyExists && (
                            <p className="text-xs text-destructive">A period named "{name.trim()}" already exists.</p>
                        )}
                    </div>

                    {/* Section 2 (BELOW): Select / Manage Existing Sheets */}
                    <div className="space-y-2">
                        <Label className="font-bold text-sm">Select Active Period</Label>
                        
                        <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                            {displaySheets.map((sheet) => {
                                const isAll = sheet === 'all';
                                const isActive = isAll ? currentSheet === 'all' : currentSheet === sheet;
                                const isOnlySheet = availableSheets.length <= 1;
                                const isDeletingThis = deletingSheet === sheet;
                                const isConfirmingThis = confirmDelete === sheet;

                                return (
                                    <div 
                                        key={sheet} 
                                        className={`flex flex-col gap-2 p-3 rounded-xl border text-sm transition-all duration-200 ${
                                            isActive 
                                                ? 'border-primary bg-primary/10 shadow-sm' 
                                                : 'border-border/60 bg-muted/10 hover:border-primary/40 hover:bg-muted/20'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => handleSelectSheet(sheet)}
                                                className="flex items-center gap-2 font-semibold text-left flex-1 cursor-pointer"
                                            >
                                                <span>{isAll ? '📊 All Sheets (Historical)' : `📅 Period: ${sheet}`}</span>
                                                {isActive ? (
                                                    <span className="flex items-center gap-1 text-[11px] bg-primary text-primary-foreground font-bold px-2 py-0.5 rounded-full shadow-xs">
                                                        <Check className="h-3 w-3" /> Active
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-muted-foreground hover:text-foreground underline">
                                                        Select
                                                    </span>
                                                )}
                                            </button>

                                            {!isAll && !isConfirmingThis && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={isOnlySheet || !!deletingSheet}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmDelete(sheet);
                                                    }}
                                                    className="h-8 w-8 p-0 text-destructive/80 hover:bg-destructive/10 hover:text-destructive shrink-0"
                                                    title={isOnlySheet ? "Cannot delete the only remaining sheet" : `Delete sheet ${sheet}`}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>

                                        {/* Confirmation box when delete icon is clicked */}
                                        {isConfirmingThis && (
                                            <div className="mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2 text-xs">
                                                <div className="flex items-start gap-1.5 text-destructive font-medium">
                                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                                    <span>Delete sheet <strong>"{sheet}"</strong> from Google Sheets? Existing data will be permanently removed.</span>
                                                </div>
                                                <div className="flex justify-end gap-2 pt-1">
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        className="h-7 text-xs"
                                                        onClick={() => setConfirmDelete(null)}
                                                        disabled={isDeletingThis}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        variant="destructive" 
                                                        className="h-7 text-xs gap-1"
                                                        onClick={() => handleDelete(sheet)}
                                                        disabled={isDeletingThis}
                                                    >
                                                        {isDeletingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                                        {isDeletingThis ? 'Deleting...' : 'Confirm Delete'}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating || !!deletingSheet}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
