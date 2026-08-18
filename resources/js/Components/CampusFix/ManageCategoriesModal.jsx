import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/Components/UI/Dialog';
import { Button } from '@/Components/UI/Button';
import { Input } from '@/Components/UI/Input';
import { Label } from '@/Components/UI/Label';
import { Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useIssues, DEFAULT_CATEGORIES } from '@/context/IssuesContext';

export function ManageCategoriesModal({ open, onOpenChange }) {
    const { categories, addCategory, deleteCategory, issues } = useIssues();
    
    const [newCategoryLabel, setNewCategoryLabel] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Reallocation state
    const [deletingCategory, setDeletingCategory] = useState(null);
    const [affectedCount, setAffectedCount] = useState(0);
    const [replacementId, setReplacementId] = useState('');

    const defaultIds = DEFAULT_CATEGORIES.map(c => c.id);
    const customCategories = categories.filter(c => !defaultIds.includes(c.id));

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newCategoryLabel.trim()) return;

        setIsSubmitting(true);
        setError(null);
        try {
            await addCategory(newCategoryLabel);
            setNewCategoryLabel('');
        } catch (err) {
            setError(err.message || 'Failed to add category');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInitDelete = (cat) => {
        // Count how many current issues use this category
        const count = issues.filter(i => i.category === cat.id).length;
        setDeletingCategory(cat);
        setAffectedCount(count);
        setReplacementId(''); // Reset selection
        setError(null);
    };

    const handleConfirmDelete = async () => {
        if (affectedCount > 0 && !replacementId) {
            setError('Please select a replacement category.');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            await deleteCategory(deletingCategory.id, affectedCount > 0 ? replacementId : null);
            setDeletingCategory(null);
        } catch (err) {
            setError(err.message || 'Failed to delete category');
        } finally {
            setIsSubmitting(false);
        }
    };

    const cancelDelete = () => {
        setDeletingCategory(null);
        setError(null);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!val && isSubmitting) return; // Prevent closing while submitting
            if (!val) {
                setDeletingCategory(null);
                setNewCategoryLabel('');
                setError(null);
            }
            onOpenChange(val);
        }}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Manage Categories</DialogTitle>
                    <DialogDescription>
                        Add or remove custom categories for issue reporting.
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive font-medium flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {deletingCategory ? (
                    <div className="space-y-4">
                        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
                            <strong>Deleting "{deletingCategory.label}"</strong>
                            {affectedCount > 0 ? (
                                <p className="mt-1">
                                    There {affectedCount === 1 ? 'is' : 'are'} <strong>{affectedCount} issue{affectedCount !== 1 && 's'}</strong> on the current sheet using this category. 
                                    You MUST select a replacement category for them before you can delete it.
                                </p>
                            ) : (
                                <p className="mt-1">
                                    No issues on the current sheet are using this category. It is safe to delete.
                                </p>
                            )}
                        </div>

                        {affectedCount > 0 && (
                            <div className="space-y-2">
                                <Label htmlFor="replacement">Replacement Category</Label>
                                <select
                                    id="replacement"
                                    value={replacementId}
                                    onChange={(e) => setReplacementId(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <option value="" disabled>Select a category...</option>
                                    {categories.map(c => {
                                        if (c.id === deletingCategory.id) return null;
                                        return <option key={c.id} value={c.id}>{c.label}</option>;
                                    })}
                                </select>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="ghost" onClick={cancelDelete} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={isSubmitting || (affectedCount > 0 && !replacementId)}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Confirm Delete
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <form onSubmit={handleAdd} className="flex gap-2">
                            <Input
                                value={newCategoryLabel}
                                onChange={(e) => setNewCategoryLabel(e.target.value)}
                                placeholder="New category name..."
                                disabled={isSubmitting}
                            />
                            <Button type="submit" disabled={!newCategoryLabel.trim() || isSubmitting}>
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                <span className="sr-only">Add Category</span>
                            </Button>
                        </form>

                        <div className="mt-4 border rounded-md divide-y max-h-[250px] overflow-y-auto">
                            {customCategories.length === 0 ? (
                                <div className="p-4 text-center text-sm text-muted-foreground">
                                    No custom categories added yet.
                                </div>
                            ) : (
                                customCategories.map(cat => (
                                    <div key={cat.id} className="flex items-center justify-between p-3 bg-surface hover:bg-muted/50 transition-colors">
                                        <span className="text-sm font-medium">{cat.label}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-3 text-red-500 hover:text-red-400 hover:bg-red-500/10 font-bold border border-red-500/30 bg-red-500/5"
                                            onClick={() => handleInitDelete(cat)}
                                            disabled={isSubmitting}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2 px-1">
                            Note: Default categories (Broken Items, Plumbing, Electrical, Other) cannot be deleted.
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
