import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

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
    const [issues, setIssues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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
    }, []); // eslint-disable-line

    useEffect(() => {
        fetchSheets();
    }, [fetchSheets]);

    const fetchIssues = useCallback(async (silent = false) => {
        if (!silent) {
            setLoading(true);
            setError(null);
        }
        try {
            // Retry fetching sheets if availableSheets list is empty
            if (availableSheets.length === 0) {
                fetchSheets();
            }

            const sheet = localStorage.getItem('campusfix_sheet');
            const params = sheet ? { sheet } : {};
            const response = await axios.get('/api/issues', { params });
            if (response.data?.success) {
                setError(null);
                const fetchedIssues = response.data.data;
                setIssues(prev => {
                    if (prev && prev.length === fetchedIssues.length && JSON.stringify(prev) === JSON.stringify(fetchedIssues)) {
                        return prev;
                    }
                    return fetchedIssues;
                });
            }
        } catch (err) {
            console.error('Failed to load issues:', err);
            const isRateLimit = err.response?.status === 429 || err.response?.data?.isRateLimit;
            
            if (isRateLimit) {
                // If rate limited, don't throw scary raw error if we already have data loaded
                if (!silent && issues.length === 0) {
                    setError('Google Sheets API rate limit reached (60 req/min). Retrying in a moment...');
                }
            } else if (!silent) {
                setError(err.response?.data?.message || 'Failed to load issues from server.');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [issues.length]);

    // Re-fetch issues whenever currentSheet changes
    useEffect(() => {
        fetchIssues();
    }, [currentSheet, fetchIssues]);

    useEffect(() => {
        // Background poll every 10 seconds without triggering loader
        const interval = setInterval(() => {
            fetchIssues(true);
        }, 10000);
        return () => clearInterval(interval);
    }, [fetchIssues]);

    const addIssue = useCallback(async (input) => {
        const formData = new FormData();
        formData.append('title', input.title);
        formData.append('description', input.description);
        formData.append('location', input.location);
        formData.append('category', input.category);
        formData.append('department', input.department);
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

    const claimIssue = useCallback(async (issue, taker) => {
        const target = issue.id || issue.rowIndex;
        const response = await axios.post(`/api/issues/${target}/claim`, { taker });

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
                const newActive = res.data.data?.newActive || 'Sheet1';
                
                setAvailableSheets(remaining);

                // If currently viewing deleted sheet, switch to newest remaining sheet
                const current = localStorage.getItem('campusfix_sheet');
                if (current === name || !remaining.includes(current)) {
                    setCurrentSheetState(newActive);
                    localStorage.setItem('campusfix_sheet', newActive);
                }

                // Refetch issues from the new active sheet
                await fetchIssues(false);
                return res.data;
            }
        } catch (err) {
            console.error('Failed to delete period:', err);
            throw new Error(err.response?.data?.message || 'Failed to delete period');
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
            categories: DEFAULT_CATEGORIES,
            stats,
            loading,
            error,
            fetchIssues,
            addIssue,
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
    }, [issues, loading, error, fetchIssues, addIssue, claimIssue, resolveIssue, pendingIssue, updateIssueCategory, availableSheets, currentSheet, setCurrentSheet, createNewPeriod, deletePeriod, fetchSheets]);

    return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssues() {
    const ctx = useContext(IssuesContext);
    if (!ctx) throw new Error('useIssues must be used within IssuesProvider');
    return ctx;
}
