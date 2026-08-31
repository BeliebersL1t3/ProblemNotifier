import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';

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
    const { isDeptUser, department } = useAuth();

    // --- Sheet (Period/Year) state ---
    const [availableSheets, setAvailableSheets] = useState([]);
    const [currentSheet, setCurrentSheetState] = useState(() => {
        return localStorage.getItem('campusfix_sheet') || null; // null = auto-detect newest
    });

    const setCurrentSheet = useCallback((name) => {
        setCurrentSheetState(name);
        localStorage.setItem('campusfix_sheet', name);
    }, []);

    // Fetch available sheets once on mount
    const fetchSheets = useCallback(async () => {
        try {
            const res = await axios.get('/api/sheets');
            if (res.data?.success) {
                setAvailableSheets(res.data.data);
                // If no sheet selected yet, default to newest
                if (!currentSheet) {
                    setCurrentSheetState(res.data.newest);
                    localStorage.setItem('campusfix_sheet', res.data.newest);
                }
            }
        } catch (err) {
            console.error('Failed to load sheets:', err);
        }
    }, [currentSheet]); 

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

    // Re-fetch issues when active sheet changes
    useEffect(() => {
        fetchIssues(false);
    }, [fetchIssues]);

    // Live Auto-Sync: Poll every 8 seconds and re-fetch immediately on window focus
    useEffect(() => {
        const interval = setInterval(() => {
            fetchIssues(true);
        }, 8000);

        const handleFocus = () => {
            fetchIssues(true);
        };

        window.addEventListener('focus', handleFocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
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

    const addIssue = useCallback(async (input) => {
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
        if (input.imageFile) {
            formData.append('image', input.imageFile);
        }

        const response = await axios.post('/api/issues', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (response.data?.success) {
            await fetchIssues();
        } else {
            throw new Error(response.data?.message || 'Upload failed');
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
        formData.append('title', input.title);
        formData.append('description', input.description);
        formData.append('location', input.location);
        formData.append('category', input.category);
        if (input.priority) formData.append('priority', input.priority);
        if (input.deadline) formData.append('deadline', input.deadline);
        if (input.assignedDepartments !== undefined) formData.append('assignedDepartments', input.assignedDepartments);
        if (input.taggedDepartments !== undefined) formData.append('taggedDepartments', input.taggedDepartments);
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
            await fetchIssues(true);
            return response.data;
        } else {
            throw new Error(response.data?.message || 'Failed to delete issue');
        }
    }, [fetchIssues]);

    const value = useMemo(() => {
        const stats = {
            total: issues.length,
            open: issues.filter((i) => i.status === 'open').length,
            progress: issues.filter((i) => i.status === 'progress').length,
            pending: issues.filter((i) => i.status === 'pending').length,
            solved: issues.filter((i) => i.status === 'solved').length,
        };
        return {
            issues,
            rawIssues,
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
        };
    }, [issues, rawIssues, loading, error, fetchIssues, addIssue, updateIssue, deleteIssue, claimIssue, resolveIssue, pendingIssue, updateIssueCategory, availableSheets, currentSheet, setCurrentSheet, createNewPeriod, deletePeriod, fetchSheets]);

    return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssues() {
    const ctx = useContext(IssuesContext);
    if (!ctx) throw new Error('useIssues must be used within IssuesProvider');
    return ctx;
}
