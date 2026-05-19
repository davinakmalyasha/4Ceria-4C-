import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types/project.types';
import { House } from '../types/explore';
import { useToast } from '../context/ToastContext';

export const useDashboardData = () => {
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
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const [housesRes, projectsRes, feedRes, archRes, constRes, interiorRes, notaryRes, pmRes, structuralRes, mepRes] = await Promise.all([
                axios.get('/houses').catch(() => ({ data: { data: [] } })),
                axios.get('/projects?all=true&with_bids=true').catch(() => ({ data: { data: [] } })),
                axios.get('/projects?feed=true&with_bids=true').catch(() => ({ data: { data: [] } })),
                axios.get('/arsitek').catch(() => ({ data: { data: [] } })),
                axios.get('/kontraktor').catch(() => ({ data: { data: [] } })),
                axios.get('/interior').catch(() => ({ data: { data: [] } })),
                axios.get('/notaris').catch(() => ({ data: { data: [] } })),
                axios.get('/project-manager').catch(() => ({ data: { data: [] } })),
                axios.get('/structural-engineers').catch(() => ({ data: { data: [] } })),
                axios.get('/mep-engineers').catch(() => ({ data: { data: [] } }))
            ]);
            
            setHouses(housesRes.data.data || []);
            setProjects(projectsRes.data.data || []);
            setProjectFeed(feedRes.data.data || []);
            setArchitects(archRes.data.data || []);
            setConstructors(constRes.data.data || []);
            setInteriors(interiorRes.data.data || []);
            setNotaries(notaryRes.data.data || []);
            setProjectManagers(pmRes.data.data || []);
            setStructuralEngineers(structuralRes.data.data || []);
            setMepEngineers(mepRes.data.data || []);

            if (user.role_type === 'user') {
                const [allBidsRes, historyRes] = await Promise.all([
                    axios.get('/projects?all=true&with_bids=true'),
                    axios.get('/hire-history')
                ]);
                
                const projectsData = allBidsRes.data.data || [];
                setProjects(projectsData);
                setHiredProfessionals(historyRes.data.data || []);

                const allBids: any[] = [];
                projectsData.forEach((p: Project) => {
                    if (p.bids_arsitek) allBids.push(...p.bids_arsitek.map(b => ({ ...b, project_title: p.title })));
                    if (p.bids_kontraktor) allBids.push(...p.bids_kontraktor.map(b => ({ ...b, project_title: p.title })));
                });
                setLatestBids(allBids.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
            }

            if (user.role_type === 'arsitek' || user.role_type === 'kontraktor' || user.role_type === 'interior' || user.role_type === 'notaris' || user.role_type === 'project_manager' || user.role_type === 'structural' || user.role_type === 'mep') {
                const bidsRes = await axios.get('/my-bids');
                const bidsData = bidsRes.data.data || [];
                setMyBids(bidsData);
                setLatestBids(bidsData);
            }
        } catch (err) {
            console.error('Failed to fetch dashboard data', err);
            showToast('Failed to load dashboard data. Please refresh.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [user, showToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const refreshProjects = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get('/projects?all=true&with_bids=true');
            setProjects(res.data.data);
        } catch (err) {
            showToast('Failed to refresh projects', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return {
        houses, projects, projectFeed, latestBids, myBids, hiredProfessionals, isLoading, 
        architects, constructors, interiors, notaries, projectManagers, structuralEngineers, mepEngineers, fetchData, refreshProjects
    };
};
