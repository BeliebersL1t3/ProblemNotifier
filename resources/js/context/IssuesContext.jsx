import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

export const DEFAULT_CATEGORIES = [
    { id: 'broken', label: 'Broken Items' },
    { id: 'plumbing', label: 'Plumbing' },
    { id: 'electrical', label: 'Electrical' },
    { id: 'other', label: 'Other' },
];

export function slugifyCategory(label) {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const IssuesContext = createContext(null);

export function IssuesProvider({ children }) {
    const [issues, setIssues] = useState([]);
    const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchIssues = useCallback(async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/issues');
            if (response.data?.success) {
                setIssues(response.data.data);
            }
        } catch (err) {
            console.error('Failed to load issues:', err);
            setError(err.response?.data?.message || 'Failed to load issues from server.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchIssues();
    }, [fetchIssues]);

    const addCategory = useCallback((label) => {
        const trimmed = label.trim();
        const id = slugifyCategory(trimmed) || `category-${Date.now()}`;
        setCategories((prev) =>
            prev.some((c) => c.id === id) ? prev : [...prev, { id, label: trimmed }],
        );
        return id;
    }, []);

    const addIssue = useCallback(async (input) => {
        const formData = new FormData();
        formData.append('title', input.title);
        formData.append('description', input.description);
        formData.append('location', input.location);
        formData.append('category', input.category);
        formData.append('reporter', input.reporter);
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

    const value = useMemo(() => {
        const stats = {
            total: issues.length,
            open: issues.filter((i) => i.status === 'open').length,
            progress: issues.filter((i) => i.status === 'progress').length,
            solved: issues.filter((i) => i.status === 'solved').length,
        };
        return {
            issues,
            categories,
            stats,
            loading,
            error,
            fetchIssues,
            addIssue,
            addCategory,
            claimIssue,
            resolveIssue,
        };
    }, [issues, categories, loading, error, fetchIssues, addIssue, addCategory, claimIssue, resolveIssue]);

    return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssues() {
    const ctx = useContext(IssuesContext);
    if (!ctx) throw new Error('useIssues must be used within IssuesProvider');
    return ctx;
}

