import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';
import { getOfflineQueue, addToOfflineQueue, removeFromOfflineQueue, dataUrlToFile } from '@/lib/offlineQueue';

// Fixed 10-category system — no custom categories
export const DEFAULT_CATEGORIES = [
    { id: 'emergency', label: 'Emergency' },
    { id: 'broken', label: 'Broken Equipment' },
    { id: 'plumbing', label: 'Plumbing' },
    { id: 'electrical', label: 'Electrical' },
    { id: 'structural', label: 'Structural / Building' },
    { id: 'pest-hygiene', label: 'Pest & Hygiene' },
    { id: 'it-technology', label: 'IT & Technology' },
    { id: 'marine-outdoor', label: 'Marine & Outdoor' },
    { id: 'safety-hazard', label: 'Safety Hazard' },
    { id: 'guest-issues', label: 'Guest Issues' },
    { id: 'other', label: 'Other' },
];

const IssuesContext = createContext(null);

export function IssuesProvider({ children }) {
    const [rawIssues, setRawIssues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { isDeptUser, department, isAdmin } = useAuth();

    // --- Sheet (Period/Year) state ---
    const [availableSheets, setAvailableSheets] = useState([]);
    const [currentSheet, setCurrentSheetState] = useState(() => {
        return localStorage.getItem('campusfix_sheet') || null; // null = auto-detect newest
    });

    const setCurrentSheet = useCallback((name) => {
        localStorage.setItem('campusfix_sheet', name);
        setCurrentSheetState(name);
    }, []);

    // Fetch available sheets once on mount
    const fetchSheets = useCallback(async (isSilent = false) => {
        try {
            const res = await axios.get('/api/sheets');
            if (res.data?.success) {
                const sheets = res.data.data || [];
                setAvailableSheets(sheets);
                if (!localStorage.getItem('campusfix_sheet') && res.data.newest) {
                    setCurrentSheetState(res.data.newest);
                }
            }
        } catch (e) {
            console.error('Failed to fetch sheets:', e);
        }
    }, []); 

    useEffect(() => {
        fetchSheets();
    }, [fetchSheets]);

    // Fetch issues for a specific sheet (or currentSheet if not specified)
    const fetchIssues = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        setError(null);

        try {
            const params = {};
            if (currentSheet && currentSheet !== 'all') {
                params.sheet = currentSheet;
            }
            const response = await axios.get('/api/issues', { params });
            if (response.data?.success) {
                setRawIssues(response.data.data);
            } else {
                setError(response.data?.message || 'Failed to fetch issues');
            }
        } catch (err) {
            console.error('Error fetching issues:', err);
            setError(err.response?.data?.message || 'Failed to connect to Google Sheets.');
        } finally {
            if (!isSilent) setLoading(false);
        }
    }, [currentSheet]);

    // Archived issues state (for Admin Archive / Trash view)
    const [archivedIssues, setArchivedIssues] = useState([]);
    const [loadingArchived, setLoadingArchived] = useState(false);

    const fetchArchivedIssues = useCallback(async (isSilent = false) => {
        if (!isAdmin) {
            setArchivedIssues([]);
            return;
        }
        if (!isSilent) setLoadingArchived(true);
        try {
            const params = { archived: true };
            if (currentSheet && currentSheet !== 'all') {
                params.sheet = currentSheet;
            }
            const res = await axios.get('/api/issues', { params });
            if (res.data?.success && Array.isArray(res.data.data)) {
                setArchivedIssues(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch archived issues:', err);
        } finally {
            if (!isSilent) setLoadingArchived(false);
        }
    }, [currentSheet, isAdmin]);

    // Re-fetch issues when active sheet changes
    useEffect(() => {
        fetchIssues(false);
        if (isAdmin) {
            fetchArchivedIssues(true);
        } else {
            setArchivedIssues([]);
        }
    }, [fetchIssues, fetchArchivedIssues, isAdmin]);

    // Live Auto-Sync: Poll every 8 seconds and re-fetch immediately on window focus / tab wake-up
    useEffect(() => {
        const interval = setInterval(() => {
            // If screen locked or tab in background, skip polling to preserve phone battery and network
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchIssues(true);
            if (isAdmin) fetchArchivedIssues(true);
        }, 8000);

        const handleResume = () => {
            if (typeof document === 'undefined' || !document.hidden) {
                fetchIssues(true);
            }
        };

        window.addEventListener('focus', handleResume);
        document.addEventListener('visibilitychange', handleResume);
        window.addEventListener('pageshow', handleResume);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleResume);
            document.removeEventListener('visibilitychange', handleResume);
            window.removeEventListener('pageshow', handleResume);
        };
    }, [fetchIssues]);

    // Scope issues for department accounts
    const issues = useMemo(() => {
        if (!isDeptUser || !department) return rawIssues;
        return rawIssues.filter(issue => {
            const assigned = Array.isArray(issue.assignedDepartments) 
                ? issue.assignedDepartments 
                : (issue.assignedDepartments ? String(issue.assignedDepartments).split(',').map(s => s.trim()) : []);
            const tagged = Array.isArray(issue.taggedDepartments) 
                ? issue.taggedDepartments 
                : (issue.taggedDepartments ? String(issue.taggedDepartments).split(',').map(s => s.trim()) : []);
            const orig = (issue.department || '').trim();
            return assigned.includes(department) || tagged.includes(department) || orig === department;
        });
    }, [rawIssues, isDeptUser, department]);

    const [outboxCount, setOutboxCount] = useState(() => getOfflineQueue().length);
    const [isSyncingOutbox, setIsSyncingOutbox] = useState(false);

    // Sync items in offline outbox back to server with original timestamp
    const syncOfflineOutbox = useCallback(async () => {
        const queue = getOfflineQueue();
        if (queue.length === 0 || !navigator.onLine) return;

        setIsSyncingOutbox(true);
        try {
            for (const item of queue) {
                const formData = new FormData();
                formData.append('title', item.title);
                formData.append('description', item.description);
                formData.append('location', item.location);
                formData.append('category', item.category);
                formData.append('department', item.department);
                formData.append('assignedDepartments', item.assignedDepartments);
                if (item.taggedDepartments) formData.append('taggedDepartments', item.taggedDepartments);
                formData.append('reporter', item.reporter);
                if (item.priority) formData.append('priority', item.priority);
                if (item.deadline) formData.append('deadline', item.deadline);
                // Keep the exact original timestamp of when the user tried to submit!
                formData.append('reportedAt', item.reportedAt);

                if (item.imageDataUrl) {
                    const file = dataUrlToFile(item.imageDataUrl, item.imageName || 'photo.jpg');
                    if (file) formData.append('image', file);
                }

                const res = await axios.post('/api/issues', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });

                if (res.data?.success) {
                    removeFromOfflineQueue(item.id);
                }
            }
            setOutboxCount(getOfflineQueue().length);
            await fetchIssues(true);
        } catch (err) {
            console.warn('Background outbox sync paused (will resume on reconnection):', err);
        } finally {
            setIsSyncingOutbox(false);
        }
    }, [fetchIssues]);

    // Listen for online status and custom outbox events
    useEffect(() => {
        const handleOnline = () => {
            syncOfflineOutbox();
        };
        const handleOutboxUpdate = (e) => {
            setOutboxCount(e.detail?.count ?? getOfflineQueue().length);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('campusfix:outbox-updated', handleOutboxUpdate);

        if (navigator.onLine) {
            syncOfflineOutbox();
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('campusfix:outbox-updated', handleOutboxUpdate);
        };
    }, [syncOfflineOutbox]);

    const addIssue = useCallback(async (input) => {
        const submissionTime = input.reportedAt || new Date().toISOString();

        // Convert image to dataUrl if we need to store offline
        const getImageDataUrl = async () => {
            if (input.imageDataUrl) return input.imageDataUrl;
            if (input.imageFile) {
                return new Promise((res) => {
                    const r = new FileReader();
                    r.onload = (e) => res(e.target.result);
                    r.onerror = () => res(null);
                    r.readAsDataURL(input.imageFile);
                });
            }
            return null;
        };

        // If completely offline right now, queue locally with original timestamp
        if (!navigator.onLine) {
            const dataUrl = await getImageDataUrl();
            addToOfflineQueue({
                ...input,
                reportedAt: submissionTime,
                imageDataUrl: dataUrl,
                imageName: input.imageFile?.name || 'photo.jpg',
            });
            setOutboxCount(getOfflineQueue().length);
            return { queuedOffline: true, reportedAt: submissionTime };
        }

        const formData = new FormData();
        formData.append('title', input.title);
        formData.append('description', input.description);
        formData.append('location', input.location);
        formData.append('category', input.category);
        formData.append('department', input.department);
        formData.append('assignedDepartments', input.assignedDepartments);
        if (input.taggedDepartments) formData.append('taggedDepartments', input.taggedDepartments);
        formData.append('reporter', input.reporter);
        if (input.priority) formData.append('priority', input.priority);
        if (input.deadline) formData.append('deadline', input.deadline);
        formData.append('reportedAt', submissionTime);
        if (input.imageFile) {
            formData.append('image', input.imageFile);
        }

        try {
            const response = await axios.post('/api/issues', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (response.data?.success) {
                await fetchIssues();
                return { success: true, reportedAt: submissionTime };
            } else {
                throw new Error(response.data?.message || 'Upload failed');
            }
        } catch (err) {
            // If network failed (Wi-Fi dropped during upload), save to offline outbox!
            const isNetworkError = !err.response || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error');
            if (isNetworkError) {
                const dataUrl = await getImageDataUrl();
                addToOfflineQueue({
                    ...input,
                    reportedAt: submissionTime,
                    imageDataUrl: dataUrl,
                    imageName: input.imageFile?.name || 'photo.jpg',
                });
                setOutboxCount(getOfflineQueue().length);
                return { queuedOffline: true, reportedAt: submissionTime };
            }
            throw err;
        }
    }, [fetchIssues]);

    const claimIssue = useCallback(async (issue, taker, department) => {
        const target = issue.id || issue.rowIndex;
        const response = await axios.post(`/api/issues/${target}/claim`, {
            taker,
            ...(department ? { department } : {}),
        });

        if (response.data?.success) {
            await fetchIssues();
        } else {
            throw new Error(response.data?.message || 'Job already taken');
        }
    }, [fetchIssues]);

    const resolveIssue = useCallback(async (issue, input) => {
        const target = issue.id || issue.rowIndex;
        const formData = new FormData();
        formData.append('solver', input.solver);
        formData.append('fixDescription', input.fixDescription);
        if (input.proofImageFile) {
            formData.append('proofImage', input.proofImageFile);
        }

        const response = await axios.post(`/api/issues/${target}/resolve`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data?.success) {
            await fetchIssues();
        } else {
            throw new Error(response.data?.message || 'Failed to resolve issue');
        }
    }, [fetchIssues]);

    const updateIssueCategory = useCallback(async (issue, newCategory) => {
        const target = issue.id || issue.rowIndex;
        const response = await axios.post(`/api/issues/${target}/category`, {
            category: newCategory
        });
        if (response.data?.success) {
            await fetchIssues();
        } else {
            throw new Error(response.data?.message || 'Failed to update category');
        }
    }, [fetchIssues]);

    const pendingIssue = useCallback(async (issue, input) => {
        const target = issue.id || issue.rowIndex;
        const formData = new FormData();
        formData.append('pendingBy', input.pendingBy);
        formData.append('pendingReason', input.pendingReason);
        if (input.pendingImageFile) {
            formData.append('pendingImage', input.pendingImageFile);
        }

        const response = await axios.post(`/api/issues/${target}/pending`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data?.success) {
            await fetchIssues();
        } else {
            throw new Error(response.data?.message || 'Failed to mark issue as pending');
        }
    }, [fetchIssues]);

    // Create a new year sheet and switch to it
    const createNewPeriod = useCallback(async (name) => {
        const response = await axios.post('/api/sheets', { name });
        if (response.data?.success) {
            await fetchSheets();
            setCurrentSheet(name);
        } else {
            throw new Error(response.data?.message || 'Failed to create new period');
        }
    }, [fetchSheets, setCurrentSheet]);

    // Delete a period sheet tab
    const deletePeriod = useCallback(async (name) => {
        try {
            const res = await axios.delete('/api/sheets', { data: { name } });
            if (res.data?.success) {
                const remaining = res.data.data?.remaining || [];
                setAvailableSheets(remaining);

                if (currentSheet === name) {
                    const fallback = remaining[0] || null;
                    setCurrentSheetState(fallback);
                    if (fallback) localStorage.setItem('campusfix_sheet', fallback);
                    else localStorage.removeItem('campusfix_sheet');
                }

                // Refetch issues from the new active sheet
                await fetchIssues(false);
                return res.data;
            }
        } catch (err) {
            console.error('Failed to delete period:', err);
            throw new Error(err.response?.data?.message || 'Failed to delete period');
        }
    }, [fetchIssues, currentSheet]);

    const updateIssue = useCallback(async (issue, input) => {
        const target = issue.id || issue.rowIndex;
        const formData = new FormData();

        const safeTitle = (input.title !== undefined && input.title !== 'undefined') ? input.title : (issue?.title || '');
        const safeDesc = (input.description !== undefined && input.description !== 'undefined') ? input.description : (issue?.description || '');
        const safeLoc = (input.location !== undefined && input.location !== 'undefined') ? input.location : (issue?.location || '');
        const safeCat = (input.category !== undefined && input.category !== 'undefined') ? input.category : (issue?.category || 'broken');
        const safePriority = (input.priority !== undefined && input.priority !== 'undefined') ? input.priority : (issue?.priority || 'low');
        const safeDeadline = (input.deadline !== undefined && input.deadline !== 'undefined') ? input.deadline : (issue?.deadline || '');

        let safeAssigned = input.assignedDepartments;
        if (safeAssigned === undefined || safeAssigned === 'undefined') {
            safeAssigned = Array.isArray(issue?.assignedDepartments) ? issue.assignedDepartments.join(',') : (issue?.assignedDepartments || '');
        }
        let safeTagged = input.taggedDepartments;
        if (safeTagged === undefined || safeTagged === 'undefined') {
            safeTagged = Array.isArray(issue?.taggedDepartments) ? issue.taggedDepartments.join(',') : (issue?.taggedDepartments || '');
        }

        formData.append('title', safeTitle);
        formData.append('description', safeDesc);
        formData.append('location', safeLoc);
        formData.append('category', safeCat);
        if (safePriority) formData.append('priority', safePriority);
        if (safeDeadline) formData.append('deadline', safeDeadline);
        if (safeAssigned !== undefined) formData.append('assignedDepartments', safeAssigned);
        if (safeTagged !== undefined) formData.append('taggedDepartments', safeTagged);
        if (input.imageFile) {
            formData.append('image', input.imageFile);
        }

        // State-specific fields
        if (input.status !== undefined) formData.append('status', input.status);
        if (input.statusReason !== undefined) formData.append('statusReason', input.statusReason);
        if (input.removePending !== undefined) formData.append('removePending', input.removePending ? '1' : '0');
        if (input.deletePendingIndex !== undefined) formData.append('deletePendingIndex', input.deletePendingIndex);
        if (input.taker !== undefined) formData.append('taker', input.taker);
        if (input.pendingBy !== undefined) formData.append('pendingBy', input.pendingBy);
        if (input.pendingReason !== undefined) formData.append('pendingReason', input.pendingReason);
        if (input.pendingImageFile) formData.append('pendingImage', input.pendingImageFile);
        if (input.solver !== undefined) formData.append('solver', input.solver);
        if (input.fixDescription !== undefined) formData.append('fixDescription', input.fixDescription);
        if (input.proofImageFile) formData.append('proofImage', input.proofImageFile);

        const response = await axios.post(`/api/issues/${target}/update`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data?.success) {
            await fetchIssues(true);
            return response.data;
        } else {
            throw new Error(response.data?.message || 'Failed to update issue');
        }
    }, [fetchIssues]);

    const deleteIssue = useCallback(async (issue) => {
        const target = issue.id || issue.rowIndex;
        const response = await axios.delete(`/api/issues/${target}`);

        if (response.data?.success) {
            await Promise.all([fetchIssues(true), fetchArchivedIssues(true)]);
            return response.data;
        } else {
            throw new Error(response.data?.message || 'Failed to delete issue');
        }
    }, [fetchIssues, fetchArchivedIssues]);

    const restoreIssue = useCallback(async (issue) => {
        const target = issue.id || issue.rowIndex;
        const response = await axios.post(`/api/issues/${target}/restore`);

        if (response.data?.success) {
            await Promise.all([fetchIssues(true), fetchArchivedIssues(true)]);
            return response.data;
        } else {
            throw new Error(response.data?.message || 'Failed to restore issue');
        }
    }, [fetchIssues, fetchArchivedIssues]);

    const value = useMemo(() => {
        const stats = {
            total: issues.length,
            open: issues.filter((i) => i.status === 'open').length,
            progress: issues.filter((i) => i.status === 'progress').length,
            pending: issues.filter((i) => i.status === 'pending').length,
            solved: issues.filter((i) => i.status === 'solved').length,
            archived: archivedIssues.length,
        };
        return {
            issues,
            rawIssues,
            archivedIssues,
            loadingArchived,
            fetchArchivedIssues,
            restoreIssue,
            categories: DEFAULT_CATEGORIES,
            stats,
            loading,
            error,
            fetchIssues,
            addIssue,
            updateIssue,
            deleteIssue,
            claimIssue,
            resolveIssue,
            pendingIssue,
            updateIssueCategory,
            // Sheet management
            availableSheets,
            currentSheet,
            setCurrentSheet,
            createNewPeriod,
            deletePeriod,
            fetchSheets,
            // Offline outbox status
            outboxCount,
            isSyncingOutbox,
            syncOfflineOutbox,
        };
    }, [issues, rawIssues, archivedIssues, loadingArchived, fetchArchivedIssues, restoreIssue, loading, error, fetchIssues, addIssue, updateIssue, deleteIssue, claimIssue, resolveIssue, pendingIssue, updateIssueCategory, availableSheets, currentSheet, setCurrentSheet, createNewPeriod, deletePeriod, fetchSheets, outboxCount, isSyncingOutbox, syncOfflineOutbox]);

    return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssues() {
    const ctx = useContext(IssuesContext);
    if (!ctx) throw new Error('useIssues must be used within IssuesProvider');
    return ctx;
}
