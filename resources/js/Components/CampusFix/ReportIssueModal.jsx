import { useState } from 'react';
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
import { Textarea } from '@/Components/UI/Textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/Components/UI/Select';
import { ImageDropzone } from './ImageDropzone';
import { useIssues } from '@/context/IssuesContext';
import { Loader2 } from 'lucide-react';

const ADD_NEW = '__add_new__';

export function ReportIssueModal({ open, onOpenChange }) {
    const { addIssue, categories, addCategory } = useIssues();
    const [reporter, setReporter] = useState('');
    const [title, setTitle] = useState('');
    const [location, setLocation] = useState('');
    const [category, setCategory] = useState('broken');
    const [addingCategory, setAddingCategory] = useState(false);
    const [newCategory, setNewCategory] = useState('');
    const [description, setDescription] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imageUrl, setImageUrl] = useState(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const valid = reporter.trim() && title.trim() && location.trim() && description.trim() && imageFile;

    const createCategory = () => {
        if (!newCategory.trim()) return;
        const id = addCategory(newCategory);
        setCategory(id);
        setNewCategory('');
        setAddingCategory(false);
    };

    const reset = () => {
        setReporter('');
        setTitle('');
        setLocation('');
        setCategory('broken');
        setAddingCategory(false);
        setNewCategory('');
        setDescription('');
        setImageFile(null);
        setImageUrl(undefined);
        setErrorMsg('');
        setIsSubmitting(false);
    };

    const submit = async () => {
        if (!valid || isSubmitting) return;
        setIsSubmitting(true);
        setErrorMsg('');

        try {
            await addIssue({
                reporter: reporter.trim(),
                title: title.trim(),
                location: location.trim(),
                category,
                description: description.trim(),
                imageFile,
            });
            reset();
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || 'Display Error: Upload Failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) onOpenChange(o); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Report an issue</DialogTitle>
                    <DialogDescription>
                        Tell the community what is broken so someone nearby can pick it up.
                    </DialogDescription>
                </DialogHeader>

                {errorMsg && (
                    <div className="rounded-md bg-destructive/15 p-3 text-sm font-medium text-destructive">
                        {errorMsg}
                    </div>
                )}

                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reporter">Submitter name</Label>
                        <Input
                            id="reporter"
                            value={reporter}
                            onChange={(e) => setReporter(e.target.value)}
                            placeholder="e.g. Aisha M."
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="title">Issue title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Broken lab door handle"
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="location">Location</Label>
                            <Input
                                id="location"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g. Engineering Block B"
                                disabled={isSubmitting}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="category">Category</Label>
                            <Select
                                value={category}
                                disabled={isSubmitting}
                                onValueChange={(v) => {
                                    if (v === ADD_NEW) {
                                        setAddingCategory(true);
                                        return;
                                    }
                                    setCategory(v);
                                }}
                            >
                                <SelectTrigger id="category">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.label}
                                        </SelectItem>
                                    ))}
                                    <SelectItem value={ADD_NEW}>+ New category…</SelectItem>
                                </SelectContent>
                            </Select>
                            {addingCategory && (
                                <div className="flex gap-2">
                                    <Input
                                        autoFocus
                                        value={newCategory}
                                        onChange={(e) => setNewCategory(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                createCategory();
                                            }
                                        }}
                                        placeholder="e.g. Network & Wi-Fi"
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={createCategory}
                                        disabled={!newCategory.trim()}
                                    >
                                        Add
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                            setAddingCategory(false);
                                            setNewCategory('');
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description">Problem description</Label>
                        <Textarea
                            id="description"
                            rows={4}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe what happened and how it affects people."
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>Photo of the problem</Label>
                        <ImageDropzone
                            previewUrl={imageUrl}
                            onChange={(file, preview) => {
                                setImageFile(file);
                                setImageUrl(preview);
                            }}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={!valid || isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Uploading to Drive...
                            </>
                        ) : (
                            'Submit report'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

