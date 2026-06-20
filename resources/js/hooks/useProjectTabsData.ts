import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export type TabDataType = 'milestones' | 'paymentTermins' | 'documents' | 'comments' | 'activityLogs' | 'bids' | 'budget';

export interface TabData {
    milestones: any[] | null;
    paymentTermins: any[] | null;
    documents: any[] | null;
    comments: any[] | null;
    activityLogs: any[] | null;
    bids: any | null;
    budget: any | null;
}

const globalTabsCache: Record<number, TabData> = {};
const lastFetchedCache: Record<number, Record<string, number>> = {};
const inFlightRequests: Record<number, Record<string, Promise<any>>> = {};

const getInitialData = (id: number | null): TabData => {
    if (id && globalTabsCache[id]) {
        return globalTabsCache[id];
    }
    return {
        milestones: null,
        paymentTermins: null,
        documents: null,
        comments: null,
        activityLogs: null,
        bids: null,
        budget: null,
    };
};

export function useProjectTabsData(projectId: number | null) {
    const [tabData, setTabData] = useState<TabData>(() => getInitialData(projectId));

    const [loadingStates, setLoadingStates] = useState<Record<TabDataType, boolean>>({
        milestones: false,
        paymentTermins: false,
        documents: false,
        comments: false,
        activityLogs: false,
        bids: false,
        budget: false,
    });

    // Reset state and load cached data when projectId changes
    useEffect(() => {
        setTabData(getInitialData(projectId));
        setLoadingStates({
            milestones: false,
            paymentTermins: false,
            documents: false,
            comments: false,
            activityLogs: false,
            bids: false,
            budget: false,
        });
    }, [projectId]);

    const updateData = useCallback((type: TabDataType, data: any) => {
        if (projectId) {
            if (!globalTabsCache[projectId]) {
                globalTabsCache[projectId] = {
                    milestones: null,
                    paymentTermins: null,
                    documents: null,
                    comments: null,
                    activityLogs: null,
                    bids: null,
                    budget: null,
                };
            }
            globalTabsCache[projectId][type] = data;
        }
        setTabData(prev => ({ ...prev, [type]: data }));
    }, [projectId]);

    const fetchTab = useCallback(async (type: TabDataType, force = false) => {
        if (!projectId) return;

        const hasCache = globalTabsCache[projectId]?.[type] !== null && globalTabsCache[projectId]?.[type] !== undefined;

        const now = Date.now();
        if (!lastFetchedCache[projectId]) {
            lastFetchedCache[projectId] = {};
        }
        const lastFetchTime = lastFetchedCache[projectId][type] || 0;

        console.log(`[useProjectTabsData] fetchTab: type=${type}, projectId=${projectId}, hasCache=${hasCache}, force=${force}, timeDiff=${now - lastFetchTime}ms`);

        // If not forced, we have cached data, and the data is fresh (fetched within last 60s), skip fetching
        if (!force && hasCache && (now - lastFetchTime < 60000)) {
            console.log(`[useProjectTabsData] Cache HIT for type=${type}. Skipping fetch.`);
            return;
        }

        // If a request for this type is already in flight, await it instead of making a duplicate request
        if (inFlightRequests[projectId]?.[type]) {
            console.log(`[useProjectTabsData] Request for type=${type} already in flight. Awaiting existing request.`);
            try {
                await inFlightRequests[projectId][type];
            } catch (err) {
                // error is already logged by the initiating request
            }
            return;
        }

        console.log(`[useProjectTabsData] Cache MISS/Expired/Forced for type=${type}. Fetching...`);

        // Update the fetch timestamp to prevent duplicate concurrent requests
        lastFetchedCache[projectId][type] = now;

        // Only show skeleton loaders on the first fetch when cache is empty
        if (!hasCache) {
            console.log(`[useProjectTabsData] Showing skeleton for type=${type}`);
            setLoadingStates(prev => ({ ...prev, [type]: true }));
        }

        if (!inFlightRequests[projectId]) {
            inFlightRequests[projectId] = {};
        }

        const fetchPromise = (async () => {
            if (type === 'milestones') {
                return axios.get(`/projects/${projectId}/milestones`);
            } else if (type === 'paymentTermins') {
                return axios.get(`/projects/${projectId}/payment-termins`);
            } else if (type === 'documents') {
                return axios.get(`/projects/${projectId}/documents`);
            } else if (type === 'comments') {
                return axios.get(`/projects/${projectId}/comments`);
            } else if (type === 'activityLogs') {
                return axios.get(`/projects/${projectId}/activity`);
            } else if (type === 'bids') {
                return axios.get(`/projects/${projectId}/bids`);
            } else if (type === 'budget') {
                return axios.get(`/projects/${projectId}/budget`);
            }
            throw new Error(`Unknown tab type: ${type}`);
        })();

        inFlightRequests[projectId][type] = fetchPromise;

        try {
            const res = await fetchPromise;
            if (type === 'milestones') {
                updateData('milestones', res.data.data || []);
            } else if (type === 'paymentTermins') {
                updateData('paymentTermins', res.data.data || []);
            } else if (type === 'documents') {
                updateData('documents', res.data.data || []);
            } else if (type === 'comments') {
                updateData('comments', res.data.data || []);
            } else if (type === 'activityLogs') {
                updateData('activityLogs', res.data.data || []);
            } else if (type === 'bids') {
                updateData('bids', res.data.data || {});
            } else if (type === 'budget') {
                updateData('budget', res.data || null);
            }
        } catch (err) {
            console.error(`Failed to fetch ${type} tab data:`, err);
        } finally {
            if (inFlightRequests[projectId]) {
                delete inFlightRequests[projectId][type];
            }
            setLoadingStates(prev => ({ ...prev, [type]: false }));
        }
    }, [projectId, updateData]);

    return {
        tabData,
        loadingStates,
        fetchTab,
    };
}
