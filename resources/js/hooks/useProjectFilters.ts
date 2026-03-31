import { useState, useMemo } from 'react';
import { Project, ProjectFilter } from '../types/project.types';

export function useProjectFilters(projects: Project[]) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState<'newest' | 'budget_desc' | 'budget_asc' | 'deadline_asc'>('newest');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [visibleCount, setVisibleCount] = useState(8);

    const filteredProjects = useMemo(() => {
        let result = [...projects];

        if (statusFilter !== 'all') {
            result = result.filter(p => p.status === statusFilter);
        }

        if (search.trim() !== '') {
            const query = search.toLowerCase();
            result = result.filter(p => 
                p.title.toLowerCase().includes(query) || 
                p.description.toLowerCase().includes(query) ||
                (p.location && p.location.toLowerCase().includes(query))
            );
        }

        result.sort((a, b) => {
            if (sortBy === 'newest') {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
            }
            if (sortBy === 'budget_desc') return b.budget - a.budget;
            if (sortBy === 'budget_asc') return a.budget - b.budget;
            if (sortBy === 'deadline_asc') {
                const dateA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
                const dateB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
                return dateA - dateB;
            }
            return 0;
        });

        return result;
    }, [projects, search, statusFilter, sortBy]);

    const totalCount = filteredProjects.length;
    const paginatedProjects = filteredProjects.slice(0, visibleCount);
    const hasMore = visibleCount < totalCount;

    const loadMore = () => {
        setVisibleCount(prev => prev + 8);
    };

    const stats = useMemo(() => {
        const openProjects = projects.filter(p => p.status === 'open');
        const activeBids = openProjects.reduce((acc, p) => acc + (p.bids_arsitek_count || 0) + (p.bids_kontraktor_count || 0), 0);
        const totalBudget = openProjects.reduce((acc, p) => acc + p.budget, 0);

        return {
            all: projects.length,
            open: openProjects.length,
            inProgress: projects.filter(p => p.status === 'in_progress').length,
            completed: projects.filter(p => p.status === 'completed').length,
            activeBids,
            totalBudget
        };
    }, [projects]);

    return {
        search, setSearch,
        statusFilter, setStatusFilter,
        sortBy, setSortBy,
        viewMode, setViewMode,
        visibleCount, setVisibleCount,
        hasMore, loadMore,
        filteredProjects: paginatedProjects,
        totalCount,
        stats
    };
}
