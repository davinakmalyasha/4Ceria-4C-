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

    const fetchData = useCallback(async () => {
        if (!user) return;
        
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

        // Fetch houses when exploring houses or using marketplace tabs
        if ((activeTab === 'houses' || activeTab === 'marketplace-materials' || activeTab === 'marketplace-furniture') && houses.length === 0 && !isHousesLoading) {
            setIsHousesLoading(true);
            axios.get('/houses')
                .then(res => setHouses(res.data.data || []))
                .catch(() => {})
                .finally(() => setIsHousesLoading(false));
        }

        // Fetch directory professionals on-demand
        if (activeTab === 'architects' && architects.length === 0 && !isArchitectsLoading) {
            setIsArchitectsLoading(true);
            axios.get('/arsitek')
                .then(res => setArchitects(res.data.data || []))
                .catch(() => {})
                .finally(() => setIsArchitectsLoading(false));
        }
        if (activeTab === 'constructors' && constructors.length === 0 && !isConstructorsLoading) {
            setIsConstructorsLoading(true);
            axios.get('/kontraktor')
                .then(res => setConstructors(res.data.data || []))
                .catch(() => {})
                .finally(() => setIsConstructorsLoading(false));
        }
        if (activeTab === 'interior' && interiors.length === 0 && !isInteriorsLoading) {
            setIsInteriorsLoading(true);
            axios.get('/interior')
                .then(res => setInteriors(res.data.data || []))
                .catch(() => {})
                .finally(() => setIsInteriorsLoading(false));
        }
        if (activeTab === 'notaris' && notaries.length === 0 && !isNotariesLoading) {
            setIsNotariesLoading(true);
            axios.get('/notaris')
                .then(res => setNotaries(res.data.data || []))
                .catch(() => {})
                .finally(() => setIsNotariesLoading(false));
        }
        if (activeTab === 'project_manager' && projectManagers.length === 0 && !isProjectManagersLoading) {
            setIsProjectManagersLoading(true);
            axios.get('/project-manager')
                .then(res => setProjectManagers(res.data.data || []))
                .catch(() => {})
                .finally(() => setIsProjectManagersLoading(false));
        }
        if (activeTab === 'structural' && structuralEngineers.length === 0 && !isStructuralLoading) {
            setIsStructuralLoading(true);
            axios.get('/structural-engineers')
                .then(res => setStructuralEngineers(res.data.data || []))
                .catch(() => {})
                .finally(() => setIsStructuralLoading(false));
        }
        if (activeTab === 'mep' && mepEngineers.length === 0 && !isMepLoading) {
            setIsMepLoading(true);
            axios.get('/mep-engineers')
                .then(res => setMepEngineers(res.data.data || []))
                .catch(() => {})
                .finally(() => setIsMepLoading(false));
        }
    }, [activeTab, user, houses.length, architects.length, constructors.length, interiors.length, notaries.length, projectManagers.length, structuralEngineers.length, mepEngineers.length, isHousesLoading, isArchitectsLoading, isConstructorsLoading, isInteriorsLoading, isNotariesLoading, isProjectManagersLoading, isStructuralLoading, isMepLoading]);

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
