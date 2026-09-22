import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { normalizeDepartment } from '@/constants/staff';

// Format YYYY-MM-DD for local date comparison
function toDateStr(d) {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Global in-memory cache to prevent excessive network requests when opening modals
let cachedOpsData = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds

export function useDepartmentScheduleConflicts(selectedDepts = [], targetDate = new Date()) {
    const [opsTasks, setOpsTasks] = useState(() => cachedOpsData || []);
    const [loading, setLoading] = useState(false);
    const abortRef = useRef(null);

    const loadTasks = useCallback(async (force = false) => {
        const now = Date.now();
        if (!force && cachedOpsData && now - lastFetchTime < CACHE_TTL) {
            setOpsTasks(cachedOpsData);
            return;
        }

        if (abortRef.current) abortRef.current.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            setLoading(true);
            const res = await axios.get(`/api/operations?dept=all${force ? '&refresh=1' : ''}`, { signal: ctrl.signal });
            const json = res.data;
            if (json.success && Array.isArray(json.manual)) {
                cachedOpsData = json.manual;
                lastFetchTime = Date.now();
                setOpsTasks(json.manual);
            }
        } catch (e) {
            // Ignore abort errors
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    const targetDateStr = useMemo(() => toDateStr(targetDate), [targetDate]);

    // Check conflicts for the given selected departments
    const conflicts = useMemo(() => {
        if (!selectedDepts || selectedDepts.length === 0 || !opsTasks || opsTasks.length === 0) {
            return [];
        }

        const normalizedSelected = selectedDepts.map(d => normalizeDepartment(d).toLowerCase().trim()).filter(Boolean);
        if (normalizedSelected.length === 0) return [];

        const matchedConflicts = [];

        for (const task of opsTasks) {
            // Only consider active/in-progress/pending tasks (exclude completed 'done' tasks)
            if (task.status === 'done') continue;

            const taskDeptNorm = normalizeDepartment(task.department || '').toLowerCase().trim();
            if (!normalizedSelected.includes(taskDeptNorm)) continue;

            // Check if targetDate overlaps with task date(s)
            const sDate = task.startDate ? toDateStr(task.startDate) : null;
            const eDate = task.endDate ? toDateStr(task.endDate) : sDate;

            let isBusyToday = false;

            if (sDate && eDate) {
                // Interval check: sDate <= targetDateStr <= eDate
                if (targetDateStr >= sDate && targetDateStr <= eDate) {
                    isBusyToday = true;
                }
            } else if (sDate) {
                if (targetDateStr === sDate) {
                    isBusyToday = true;
                }
            }

            if (isBusyToday) {
                matchedConflicts.push({
                    department: task.department,
                    normalizedDept: taskDeptNorm,
                    taskId: task.id,
                    title: task.title || 'Scheduled Operations Task',
                    description: task.description || '',
                    startDate: task.startDate,
                    endDate: task.endDate || task.startDate,
                    priority: task.priority || 'normal',
                    location: task.location || '',
                });
            }
        }

        return matchedConflicts;
    }, [selectedDepts, opsTasks, targetDateStr]);

    // Group conflicts by department
    const conflictsByDept = useMemo(() => {
        const grouped = {};
        for (const c of conflicts) {
            const key = c.department || 'Other';
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(c);
        }
        return grouped;
    }, [conflicts]);

    return {
        conflicts,
        conflictsByDept,
        hasConflicts: conflicts.length > 0,
        loading,
        reload: () => loadTasks(true)
    };
}
