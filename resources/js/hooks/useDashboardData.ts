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
    const [projectFeed, setProjectFeed] = useState<Project[]>([]);
    const [latestBids, setLatestBids] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const [houseRes, projectRes, archRes, constrRes, feedRes] = await Promise.all([
                axios.get('/houses'),
                axios.get('/projects?all=true&with_bids=true'),
                axios.get('/arsitek'),
                axios.get('/kontraktor'),
                axios.get('/projects?feed=true')
            ]);
            
            setHouses(houseRes.data.data);
            setProjects(projectRes.data.data);
            setArchitects(archRes.data.data);
            setConstructors(constrRes.data.data);
            setProjectFeed(feedRes.data.data);

            if (user.role_type === 'user') {
                const allBids: any[] = [];
                projectRes.data.data.forEach((p: Project) => {
                    if (p.bids_arsitek) allBids.push(...p.bids_arsitek.map(b => ({ ...b, project_title: p.title })));
                    if (p.bids_kontraktor) allBids.push(...p.bids_kontraktor.map(b => ({ ...b, project_title: p.title })));
                });
                setLatestBids(allBids.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
            }

            if (user.role_type === 'arsitek' || user.role_type === 'kontraktor') {
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
            const res = await axios.get('/projects?all=true');
            setProjects(res.data.data);
        } catch (err) {
            showToast('Failed to refresh projects', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return {
        houses, setHouses,
        projects, setProjects,
        myBids, setMyBids,
        architects, setArchitects,
        constructors, setConstructors,
        projectFeed, setProjectFeed,
        latestBids, setLatestBids,
        isLoading,
        refreshProjects,
        fetchData
    };
};
