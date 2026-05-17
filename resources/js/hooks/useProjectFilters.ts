import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { Project, ProjectFilter } from '../types/project.types';

export function useProjectFilters(projects: Project[]) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState<'newest' | 'budget_desc' | 'budget_asc' | 'deadline_asc'>('newest');
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'board'>('grid');
    const [visibleCount, setVisibleCount] = useState(8);

    // Map specific state
    const mapRef = useRef<MapRef>(null);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [selectedCity, setSelectedCity] = useState<string>('all');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [popupInfo, setPopupInfo] = useState<Project | null>(null);

    // Geolocation
    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            () => { /* silently fail */ },
            { enableHighAccuracy: true, maximumAge: 10000 },
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    // Dropdown handler
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const cities = useMemo(() => {
        const s = new Set<string>();
        projects.forEach(p => { if (p.city) s.add(p.city); });
        return Array.from(s).sort();
    }, [projects]);

    const flyToUser = useCallback(() => {
        if (userLocation && mapRef.current) mapRef.current.flyTo({ center: [userLocation.longitude, userLocation.latitude], zoom: 14, duration: 1500 });
    }, [userLocation]);

    const filteredProjects = useMemo(() => {
        let result = [...projects];

        if (statusFilter !== 'all') {
            if (statusFilter === 'open') {
                result = result.filter(p => ['open', 'accepted_arsitek', 'accepted_kontraktor', 'completed_build', 'awaiting_payment', 'contract_pending', 'planning', 'legal'].includes(p.status));
            } else {
                result = result.filter(p => p.status === statusFilter);
            }
        }

        if (selectedCity !== 'all') {
            result = result.filter(p => p.city === selectedCity);
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
    }, [projects, search, statusFilter, sortBy, selectedCity]);

    const totalCount = filteredProjects.length;
    const paginatedProjects = filteredProjects.slice(0, visibleCount);
    const hasMore = visibleCount < totalCount;

    const loadMore = () => {
        setVisibleCount(prev => prev + 8);
    };

    const stats = useMemo(() => {
        const openProjects = projects.filter(p => ['open', 'accepted_arsitek', 'accepted_kontraktor', 'completed_build', 'awaiting_payment', 'contract_pending', 'planning', 'legal'].includes(p.status));
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
        allFilteredProjects: filteredProjects, // Added this for map markers
        totalCount,
        stats,
        // Map specific
        mapRef, userLocation, selectedCity, setSelectedCity, isDropdownOpen, setIsDropdownOpen, dropdownRef, popupInfo, setPopupInfo, flyToUser, cities
    };
}
