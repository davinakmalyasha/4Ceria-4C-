import { useState, useMemo, useEffect } from 'react';
import { ConstructorData, ConstructorFilterState, ConstructorSortOption, ConstructorViewMode, CONSTRUCTOR_TYPES } from '../types/constructor.types';

export const useConstructors = (initialData: ConstructorData[]) => {
    const [viewMode, setViewMode] = useState<ConstructorViewMode>('grid');
    const [filters, setFilters] = useState<ConstructorFilterState>({
        query: '',
        jenis: CONSTRUCTOR_TYPES[0],
        sort: 'recommended',
    });

    const filteredAndSorted = useMemo(() => {
        let result = [...(initialData || [])];

        // 1. Search filter
        if (filters.query.trim()) {
            const q = filters.query.toLowerCase();
            result = result.filter(c => 
                c.nama?.toLowerCase().includes(q) || 
                c.nama_perusahaan?.toLowerCase().includes(q)
            );
        }

        // 2. Jenis (Type) filter
        if (filters.jenis !== CONSTRUCTOR_TYPES[0]) {
            result = result.filter(c => c.jenis === filters.jenis);
        }

        // 3. Sorting
        result.sort((a, b) => {
            switch (filters.sort) {
                case 'experience_desc':
                    return (b.pengalaman || 0) - (a.pengalaman || 0);
                case 'experience_asc':
                    return (a.pengalaman || 0) - (b.pengalaman || 0);
                case 'recommended':
                default:
                    // Mock recommendation sort based on experience
                    return (b.pengalaman || 0) - (a.pengalaman || 0);
            }
        });

        return result;
    }, [initialData, filters]);

    const [page, setPage] = useState(1);
    const itemsPerPage = 8;

    useEffect(() => {
        setPage(1);
    }, [filters, viewMode]);

    const displayedConstructors = useMemo(() => {
        return filteredAndSorted.slice(0, page * itemsPerPage);
    }, [filteredAndSorted, page]);

    const hasMore = displayedConstructors.length < filteredAndSorted.length;

    const loadMore = () => setPage(p => p + 1);

    return {
        viewMode,
        setViewMode,
        filters,
        setFilters,
        constructors: displayedConstructors,
        totalConstructors: filteredAndSorted.length,
        hasMore,
        loadMore
    };
};
