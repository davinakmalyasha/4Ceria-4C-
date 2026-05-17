import { useState, useMemo, useEffect } from 'react';
import { InteriorDesigner, InteriorFilterState, InteriorSortOption, InteriorViewMode, INTERIOR_SPECS } from '../types/interior.types';

export const useInterior = (initialData: InteriorDesigner[]) => {
    const [viewMode, setViewMode] = useState<InteriorViewMode>('grid');
    const [filters, setFilters] = useState<InteriorFilterState>({
        query: '',
        specialization: INTERIOR_SPECS[0],
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
        if (filters.specialization !== INTERIOR_SPECS[0]) {
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
                    const scoreA = (a.pengalaman_tahun || 1) * 10 - a.rate_harga / 100000;
                    const scoreB = (b.pengalaman_tahun || 1) * 10 - b.rate_harga / 100000;
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

    const displayedDesigners = useMemo(() => {
        return filteredAndSorted.slice(0, page * itemsPerPage);
    }, [filteredAndSorted, page]);

    const hasMore = displayedDesigners.length < filteredAndSorted.length;

    const loadMore = () => setPage(p => p + 1);

    return { 
        viewMode, 
        setViewMode, 
        filters, 
        setFilters, 
        designers: displayedDesigners,
        totalDesigners: filteredAndSorted.length,
        hasMore,
        loadMore
    };
};
