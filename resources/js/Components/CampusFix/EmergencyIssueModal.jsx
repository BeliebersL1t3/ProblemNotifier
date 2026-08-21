import { useState, useMemo } from 'react';
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
import { useIssues } from '@/context/IssuesContext';
import { Loader2, AlertTriangle } from 'lucide-react';
import { ALL_DEPARTMENTS, getStaffForDepartment } from '@/constants/staff';

export function EmergencyIssueModal({ open, onOpenChange }) {
    const { addIssue } = useIssues();
    const [originDept, setOriginDept] = useState('');
    const [reporter, setReporter] = useState('');
    const [title, setTitle] = useState('');
    const [locMain, setLocMain] = useState('');
    const [locDetail, setLocDetail] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const staffForOriginDept = useMemo(() => {
        if (!originDept) return [];
        return getStaffForDepartment(originDept);
    }, [originDept]);

    const handleOriginDeptChange = (dept) => {
        setOriginDept(dept);
        setReporter('');
    };

    const location = locMain
        ? (locDetail.trim() ? `${locMain} - ${locDetail.trim()}` : locMain)
        : locDetail.trim();

    const MAIN_LOCATIONS = ['TPI', 'TBR', 'Kantor'];
    const valid = reporter.trim() && title.trim() && location.trim() && originDept;

    const reset = () => {
        setOriginDept('');
        setReporter('');
        setTitle('');
        setLocMain('');
        setLocDetail('');
        setDescription('');
        setErrorMsg('');
        setIsSubmitting(false);
    };

    const submit = async () => {
        if (!valid || isSubmitting) return;
        setIsSubmitting(true);
        setErrorMsg('');

        try {
            const finalDesc = description.trim() 
                ? `${description.trim()} [EMERGENCY FAST-TRACK]`
                : '[EMERGENCY FAST-TRACK]';

            await addIssue({
                reporter: reporter.trim(),
                title: title.trim(),
                department: originDept || 'Emergency',
                assignedDepartments: 'ALL',
                taggedDepartments: 'ALL',
                category: 'emergency',
                description: finalDesc,
                imageFile: null,
                priority: 'critical',
                deadline: Date.now().toString(),
            });
            reset();
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            setErrorMsg(err.response?.data?.message || err.message || 'Display Error: Upload Failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) onOpenChange(o); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)] bg-red-950/20 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-red-500">
                        <AlertTriangle className="h-6 w-6 animate-pulse" />
                        EMERGENCY REPORT
                    </DialogTitle>
                    <DialogDescription className="text-red-200">
                        Fast-track a critical issue. Submits immediately to alert all responders.
                    </DialogDescription>
                </DialogHeader>

                {errorMsg && (
                    <div className="rounded-md bg-destructive/30 p-3 text-sm font-medium text-destructive-foreground border border-red-500">
                        {errorMsg}
                    </div>
                )}

                <div className="grid gap-4 mt-2">
                    {/* Step 1: Origin Department */}
                    <div className="grid gap-2 p-3 rounded-lg border border-red-500/40 bg-red-950/40">
                        <Label htmlFor="sos-originDept" className="text-red-300 font-semibold flex items-center gap-1.5">
                            🏠 1. Origin Department (Your Dept) <span className="text-xs text-red-400">*</span>
                        </Label>
                        <Select value={originDept} onValueChange={handleOriginDeptChange} disabled={isSubmitting}>
                            <SelectTrigger id="sos-originDept" className="border-red-900/50 bg-black/60 text-white focus-visible:ring-red-500">
                                <SelectValue placeholder="-- Select Your Department --" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 text-white border-zinc-800">
                                {ALL_DEPARTMENTS.map((dept) => (
                                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Step 2: Submitter Name */}
                    <div className="grid gap-2 p-3 rounded-lg border border-red-900/40 bg-black/40">
                        <div className="flex items-center justify-between">
                            <Label className="text-red-300 font-semibold flex items-center gap-1.5">
                                👤 2. Submitter Name (Pelapor) <span className="text-xs text-red-400">*</span>
                            </Label>
                            {originDept && (
                                <span className="text-xs text-red-400 font-medium">
                                    {originDept} Staff
                                </span>
                            )}
                        </div>

                        {originDept ? (
                            staffForOriginDept.length > 0 ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {staffForOriginDept.map(name => (
                                        <button
                                            key={name}
                                            type="button"
                                            disabled={isSubmitting}
                                            onClick={() => setReporter(name)}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-all ${
                                                reporter === name
                                                    ? 'bg-red-600 text-white border-red-400 shadow-md ring-2 ring-red-500/40'
                                                    : 'bg-black/50 text-red-300 border-red-900/60 hover:border-red-500/50 hover:bg-red-950/40'
                                            }`}
                                        >
                                            {reporter === name ? `✓ ${name}` : name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <Input
                                    id="sos-reporter"
                                    value={reporter}
                                    onChange={(e) => setReporter(e.target.value)}
                                    placeholder="Enter your name..."
                                    disabled={isSubmitting}
                                    className="border-red-900/50 bg-black/50 text-white placeholder:text-red-800 focus-visible:ring-red-500"
                                />
                            )
                        ) : (
                            <p className="text-xs text-red-400/80 italic py-1">
                                👆 Please select an Origin Department above to choose your name.
                            </p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="sos-title" className="text-red-300">Emergency Title / Subject</Label>
                        <Input
                            id="sos-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Fire in kitchen"
                            disabled={isSubmitting}
                            className="border-red-900/50 bg-black/50 text-white placeholder:text-red-800 focus-visible:ring-red-500 font-bold"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label className="text-red-300">Location</Label>
                        <div className="flex gap-2">
                            {MAIN_LOCATIONS.map(loc => (
                                <button
                                    key={loc}
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => setLocMain(prev => prev === loc ? '' : loc)}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                                        locMain === loc
                                            ? 'bg-red-600 text-white border-red-400'
                                            : 'bg-black/40 text-red-300 border-red-900/60 hover:border-red-500/50'
                                    }`}
                                >
                                    {loc}
                                </button>
                            ))}
                        </div>
                        <Input
                            id="sos-location"
                            value={locDetail}
                            onChange={(e) => setLocDetail(e.target.value)}
                            placeholder={locMain ? `More specific in ${locMain}… (optional)` : 'Or type a location…'}
                            disabled={isSubmitting}
                            className="border-red-900/50 bg-black/50 text-white placeholder:text-red-800 focus-visible:ring-red-500"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="sos-desc" className="text-red-300">More details / description (optional)</Label>
                        <Textarea
                            id="sos-desc"
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Stove burner #3 is sparking violently, staff evacuated area."
                            disabled={isSubmitting}
                            className="border-red-900/50 bg-black/50 text-white placeholder:text-red-800 focus-visible:ring-red-500 text-xs"
                        />
                    </div>
                </div>

                <DialogFooter className="mt-6 sm:justify-between">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                        className="text-red-300 hover:text-red-100 hover:bg-red-900/50"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={submit}
                        disabled={!valid || isSubmitting}
                        className="bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)] border border-red-400"
                    >
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSubmitting ? 'Submitting...' : 'SUBMIT EMERGENCY'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
