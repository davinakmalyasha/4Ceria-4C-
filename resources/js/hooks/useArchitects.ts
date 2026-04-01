import { useState, useMemo, useEffect } from 'react';
import { Architect, ArchitectFilterState, ArchitectSortOption, ArchitectViewMode, ARCHITECT_SPECS } from '../types/architect.types';

export const useArchitects = (initialData: Architect[]) => {
    const [viewMode, setViewMode] = useState<ArchitectViewMode>('grid');
    const [filters, setFilters] = useState<ArchitectFilterState>({
        query: '',
        specialization: ARCHITECT_SPECS[0],
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
        if (filters.specialization !== ARCHITECT_SPECS[0]) {
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
                    // Mock recommendation sort based on experience + rate balance
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

    const displayedArchitects = useMemo(() => {
        return filteredAndSorted.slice(0, page * itemsPerPage);
    }, [filteredAndSorted, page]);

    const hasMore = displayedArchitects.length < filteredAndSorted.length;

    const loadMore = () => setPage(p => p + 1);

    return { 
        viewMode, 
        setViewMode, 
        filters, 
        setFilters, 
        architects: displayedArchitects,
        totalArchitects: filteredAndSorted.length,
        hasMore,
        loadMore
    };
};
