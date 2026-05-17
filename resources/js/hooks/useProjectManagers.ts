import { useState, useMemo, useEffect } from 'react';
import { ProjectManager, PMFilterState, PMSortOption, PMViewMode, PM_SPECS } from '../types/project_manager.types';

export const useProjectManagers = (initialData: ProjectManager[]) => {
    const [viewMode, setViewMode] = useState<PMViewMode>('grid');
    const [filters, setFilters] = useState<PMFilterState>({
        query: '',
        specialization: PM_SPECS[0],
        sort: 'recommended',
    });

    const filteredAndSorted = useMemo(() => {
        let result = [...(initialData || [])];

        // 1. Search filter
        if (filters.query.trim()) {
            const q = filters.query.toLowerCase();
            result = result.filter(a => 
                a.nama?.toLowerCase().includes(q) || 
                a.spesialisasi?.toLowerCase().includes(q)
            );
        }

        // 2. Specialization filter
        if (filters.specialization !== PM_SPECS[0]) {
            result = result.filter(a => a.spesialisasi === filters.specialization);
        }

        // 3. Sorting
        result.sort((a, b) => {
            switch (filters.sort) {
                case 'price_asc':
                    return a.rate_harga - b.rate_harga;
                case 'price_desc':
                    return b.rate_harga - a.rate_harga;
                case 'experience_desc':
                    return (b.pengalaman_tahun || 0) - (a.pengalaman_tahun || 0);
                case 'recommended':
                default:
                    // Score based on experience + rating
                    const ratingA = typeof a.average_rating === 'string' ? parseFloat(a.average_rating) : (a.average_rating || 0);
                    const ratingB = typeof b.average_rating === 'string' ? parseFloat(b.average_rating) : (b.average_rating || 0);
                    const scoreA = (a.pengalaman_tahun || 1) * 20 + (ratingA * 50);
                    const scoreB = (b.pengalaman_tahun || 1) * 20 + (ratingB * 50);
                    return scoreB - scoreA;
            }
        });

        return result;
    }, [filters, initialData]);

    const [page, setPage] = useState(1);
    const itemsPerPage = 8;

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [filters, viewMode]);

    const displayedPMs = useMemo(() => {
        return filteredAndSorted.slice(0, page * itemsPerPage);
    }, [filteredAndSorted, page]);

    const hasMore = displayedPMs.length < filteredAndSorted.length;

    const loadMore = () => setPage(p => p + 1);

    return { 
        viewMode, 
        setViewMode, 
        filters, 
        setFilters, 
        projectManagers: displayedPMs,
        totalPMs: filteredAndSorted.length,
        hasMore,
        loadMore
    };
};
