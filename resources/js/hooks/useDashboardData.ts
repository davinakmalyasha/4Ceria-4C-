import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types/project.types';
import { House } from '../types/explore';
import { useToast } from '../context/ToastContext';

export const useDashboardData = (activeTab: string = 'overview') => {
    const { user } = useAuth();
    const { showToast } = useToast();
    
    // Core Data State
    const [houses, setHouses] = useState<House[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [myBids, setMyBids] = useState<any[]>([]);
    const [architects, setArchitects] = useState<any[]>([]);
    const [constructors, setConstructors] = useState<any[]>([]);
    const [interiors, setInteriors] = useState<any[]>([]);
    const [notaries, setNotaries] = useState<any[]>([]);
    const [projectManagers, setProjectManagers] = useState<any[]>([]);
    const [structuralEngineers, setStructuralEngineers] = useState<any[]>([]);
    const [mepEngineers, setMepEngineers] = useState<any[]>([]);
    const [projectFeed, setProjectFeed] = useState<Project[]>([]);
    const [latestBids, setLatestBids] = useState<any[]>([]);
    const [hiredProfessionals, setHiredProfessionals] = useState<any[]>([]);
    
    // Core loading states
    const [isLoading, setIsLoading] = useState(true);
    const [isProjectsLoading, setIsProjectsLoading] = useState(true);
    const [isFeedLoading, setIsFeedLoading] = useState(true);
    const [isBidsLoading, setIsBidsLoading] = useState(true);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);

    // Tab-based lazy loading states
    const [isHousesLoading, setIsHousesLoading] = useState(false);
    const [isArchitectsLoading, setIsArchitectsLoading] = useState(false);
    const [isConstructorsLoading, setIsConstructorsLoading] = useState(false);
    const [isInteriorsLoading, setIsInteriorsLoading] = useState(false);
    const [isNotariesLoading, setIsNotariesLoading] = useState(false);
    const [isProjectManagersLoading, setIsProjectManagersLoading] = useState(false);
    const [isStructuralLoading, setIsStructuralLoading] = useState(false);
    const [isMepLoading, setIsMepLoading] = useState(false);

    // Tracks completed lazy-tab fetches so empty results or errors never retrigger a request (prevents infinite refetch loops / 429 storms)
    const [lazyFetched, setLazyFetched] = useState<Record<string, boolean>>({});

    const fetchData = useCallback(async () => {
        if (!user) return;

        setLazyFetched({});
        setIsLoading(true);
        setIsProjectsLoading(true);
        setIsFeedLoading(true);
        setIsHistoryLoading(true);
        setIsBidsLoading(true);

        const projectsPromise = axios.get('/projects?all=true')
            .then(res => {
                const projectsData = res.data.data || [];
                setProjects(projectsData);
                
                if (user.role_type === 'user') {
                    const allBids: any[] = [];
                    projectsData.forEach((p: Project) => {
                        if (p.bids_arsitek) allBids.push(...p.bids_arsitek.map(b => ({ ...b, project_title: p.title })));
                        if (p.bids_kontraktor) allBids.push(...p.bids_kontraktor.map(b => ({ ...b, project_title: p.title })));
                    });
                    setLatestBids(allBids.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
                }
            })
            .catch(err => {
                console.error('Failed to fetch projects', err);
            })
            .finally(() => setIsProjectsLoading(false));

        const feedPromise = axios.get('/projects?feed=true')
            .then(res => {
                setProjectFeed(res.data.data || []);
            })
            .catch(err => {
                console.error('Failed to fetch project feed', err);
            })
            .finally(() => setIsFeedLoading(false));

        let historyPromise = Promise.resolve();
        if (user.role_type === 'user') {
            historyPromise = axios.get('/hire-history')
                .then(res => {
                    setHiredProfessionals(res.data.data || []);
                })
                .catch(err => {
                    console.error('Failed to fetch hire history', err);
                })
                .finally(() => setIsHistoryLoading(false));
            
            setIsBidsLoading(false);
        } else {
            setIsHistoryLoading(false);
        }

        let bidsPromise = Promise.resolve();
        if (user.role_type !== 'user') {
            bidsPromise = axios.get('/my-bids')
                .then(res => {
                    const bidsData = res.data.data || [];
                    setMyBids(bidsData);
                    setLatestBids(bidsData);
                })
                .catch(err => {
                    console.error('Failed to fetch my bids', err);
                })
                .finally(() => setIsBidsLoading(false));
        } else {
            setIsBidsLoading(false);
        }

        Promise.all([projectsPromise, feedPromise, historyPromise, bidsPromise])
            .catch(err => {
                console.error('Failed to fetch dashboard data', err);
                showToast('Failed to load dashboard data. Please refresh.', 'error');
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [user, showToast]);

    // Initial Fetch of Core Data
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Tab-Based Lazy Loading
    useEffect(() => {
        if (!user) return;

        const lazyGet = (key: string, url: string, setter: (data: any[]) => void, setLoading: (v: boolean) => void) => {
            if (lazyFetched[key]) return;
            setLazyFetched(prev => (prev[key] ? prev : { ...prev, [key]: true }));
            setLoading(true);
            axios.get(url)
                .then(res => setter(res.data.data || []))
                .catch(() => {})
                .finally(() => setLoading(false));
        };

        // Fetch houses when exploring houses or using marketplace tabs
        if (activeTab === 'houses' || activeTab === 'marketplace-materials' || activeTab === 'marketplace-furniture') {
            lazyGet('houses', '/houses', setHouses, setIsHousesLoading);
        }

        // Fetch directory professionals on-demand
        if (activeTab === 'architects') lazyGet('architects', '/arsitek', setArchitects, setIsArchitectsLoading);
        if (activeTab === 'constructors') lazyGet('constructors', '/kontraktor', setConstructors, setIsConstructorsLoading);
        if (activeTab === 'interior') lazyGet('interior', '/interior', setInteriors, setIsInteriorsLoading);
        if (activeTab === 'notaris') lazyGet('notaris', '/notaris', setNotaries, setIsNotariesLoading);
        if (activeTab === 'project_manager') lazyGet('project_manager', '/project-manager', setProjectManagers, setIsProjectManagersLoading);
        if (activeTab === 'structural') lazyGet('structural', '/structural-engineers', setStructuralEngineers, setIsStructuralLoading);
        if (activeTab === 'mep') lazyGet('mep', '/mep-engineers', setMepEngineers, setIsMepLoading);
    }, [activeTab, user, lazyFetched]);

    const refreshProjects = async () => {
        setIsProjectsLoading(true);
        setIsLoading(true);
        try {
            const res = await axios.get('/projects?all=true');
            setProjects(res.data.data);
        } catch (err) {
            showToast('Failed to refresh projects', 'error');
        } finally {
            setIsProjectsLoading(false);
            setIsLoading(false);
        }
    };

    return {
        houses, projects, projectFeed, latestBids, myBids, hiredProfessionals, isLoading, 
        isProjectsLoading, isFeedLoading, isBidsLoading, isHistoryLoading, isHousesLoading,
        isArchitectsLoading, isConstructorsLoading, isInteriorsLoading, isNotariesLoading,
        isProjectManagersLoading, isStructuralLoading, isMepLoading,
        architects, constructors, interiors, notaries, projectManagers, structuralEngineers, mepEngineers, fetchData, refreshProjects
    };
};
