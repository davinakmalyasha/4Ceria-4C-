import { Flame, Eye, Star } from 'lucide-react';

export interface House {
    id: number;
    name: string;
    price: number;
    description: string;
    coordinate?: string;
    views?: number;
    created_at?: string;
    address?: {
        street?: string;
        kelurahan?: string;
        kecamatan?: string;
        city: string;
        province: string;
        postal_code?: string;
        coordinates?: string;
    };
    dimensions?: { width: number; length: number; floors: number };
    rooms?: { bedrooms: number; bathrooms: number };
    housePic?: { dir: string }[];
    owner?: { name: string; email: string; phones: string[] };
    roomList?: {
        name: string;
        width: number;
        length: number;
        description: string;
        pics: { dir: string }[];
    }[];
}

export type SortOption = 'default' | 'price_asc' | 'price_desc' | 'newest' | 'most_viewed' | 'nearest';
export type ViewMode = 'grid' | 'list';
export type HouseBadge = 'new' | 'popular' | 'hot_deal' | null;

export const ITEMS_PER_PAGE = 8;
export const MAX_COMPARE = 3;

export const BADGE_CONFIG: Record<string, { label: string; icon: typeof Flame; colors: string }> = {
    new: { label: 'New', icon: Star, colors: 'bg-emerald-500/90 text-white' },
    popular: { label: 'Popular', icon: Eye, colors: 'bg-amber-500/90 text-white' },
    hot_deal: { label: 'Hot Deal', icon: Flame, colors: 'bg-rose-500/90 text-white' },
};

export const getHouseBadge = (house: House, allHouses: House[]): HouseBadge => {
    const created = house.created_at ? new Date(house.created_at) : null;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    if (created && created > weekAgo) return 'new';
    if ((house.views || 0) >= 50) return 'popular';
    if (allHouses.length > 0) {
        const avgPrice = allHouses.reduce((s, h) => s + h.price, 0) / allHouses.length;
        if (house.price < avgPrice * 0.7) return 'hot_deal';
    }
    return null;
};

export const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);

export const getCoords = (house: House): { longitude: number; latitude: number } | null => {
    const s = house.coordinate || house.address?.coordinates;
    if (!s) return null;
    const p = s.split(',');
    if (p.length === 2) {
        const lat = parseFloat(p[0].trim());
        const lng = parseFloat(p[1].trim());
        if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng };
    }
    return null;
};

export const getDistance = (house: House, userLocation: { latitude: number; longitude: number } | null): number | null => {
    if (!userLocation) return null;
    const coords = getCoords(house);
    if (!coords) return null;
    const R = 6371;
    const dLat = ((coords.latitude - userLocation.latitude) * Math.PI) / 180;
    const dLon = ((coords.longitude - userLocation.longitude) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((userLocation.latitude * Math.PI) / 180) * Math.cos((coords.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
