import { useState, useEffect } from 'react';

export function useFavorites(storageKey: string) {
    const [favorites, setFavorites] = useState<number[]>([]);

    // Load from local storage on mount
    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                setFavorites(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to load favorites', e);
            }
        }
    }, [storageKey]);

    const toggleFavorite = (id: number) => {
        setFavorites(prev => {
            const next = prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id];
            localStorage.setItem(storageKey, JSON.stringify(next));
            return next;
        });
    };

    const isFavorite = (id: number) => favorites.includes(id);

    return { favorites, toggleFavorite, isFavorite };
}
