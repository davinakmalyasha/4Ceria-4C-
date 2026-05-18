import { HardHat, Blocks, Cog, Zap, Droplets, Home, Paintbrush } from 'lucide-react';

export type ConstructionSubRoleKey =
    | 'general'
    | 'civil'
    | 'mechanical'
    | 'electrical'
    | 'plumbing'
    | 'roofing'
    | 'finishing';

export interface ConstructionSubRole {
    key: ConstructionSubRoleKey;
    label: string;
    labelId: string;
    icon: typeof HardHat;
    color: string;
    activeClass: string;
    description: string;
}

export const CONSTRUCTION_SUB_ROLES: ConstructionSubRole[] = [
    {
        key: 'general',
        label: 'General Contractor',
        labelId: 'Kontraktor Utama',
        icon: HardHat,
        color: 'slate',
        activeClass: 'bg-white text-slate-900 shadow-sm',
        description: 'Oversees all construction works on site.',
    },
    {
        key: 'civil',
        label: 'Civil & Structural',
        labelId: 'Sipil & Struktur',
        icon: Blocks,
        color: 'amber',
        activeClass: 'bg-white text-amber-600 shadow-sm',
        description: 'Foundation, framing, columns, beams, slabs.',
    },
    {
        key: 'mechanical',
        label: 'Mechanical',
        labelId: 'Mekanikal',
        icon: Cog,
        color: 'blue',
        activeClass: 'bg-white text-blue-600 shadow-sm',
        description: 'HVAC, elevator, fire protection systems.',
    },
    {
        key: 'electrical',
        label: 'Electrical',
        labelId: 'Elektrikal',
        icon: Zap,
        color: 'yellow',
        activeClass: 'bg-white text-yellow-600 shadow-sm',
        description: 'Power distribution, wiring, panels, grounding.',
    },
    {
        key: 'plumbing',
        label: 'Plumbing',
        labelId: 'Plumbing',
        icon: Droplets,
        color: 'cyan',
        activeClass: 'bg-white text-cyan-600 shadow-sm',
        description: 'Water supply, drainage, sewage, fixtures.',
    },
    {
        key: 'roofing',
        label: 'Roofing',
        labelId: 'Atap & Waterproofing',
        icon: Home,
        color: 'orange',
        activeClass: 'bg-white text-orange-600 shadow-sm',
        description: 'Roof truss, covering, waterproofing membrane.',
    },
    {
        key: 'finishing',
        label: 'Finishing',
        labelId: 'Finishing',
        icon: Paintbrush,
        color: 'emerald',
        activeClass: 'bg-white text-emerald-600 shadow-sm',
        description: 'Plastering, painting, tiling, facade finishes.',
    },
];

export const CONSTRUCTION_SUB_ROLE_MAP: Record<string, string> = {
    general: 'General Contractor',
    civil: 'Civil & Structural',
    mechanical: 'Mechanical',
    electrical: 'Electrical',
    plumbing: 'Plumbing',
    roofing: 'Roofing & Waterproofing',
    finishing: 'Finishing',
};

/** Fee types specifically for sub-contractor negotiation (simplified). */
export const SUB_CONTRACTOR_FEE_TYPES = [
    { id: 'fixed', label: 'Lump Sum (Harga Pasti)', description: 'Biaya tetap untuk seluruh lingkup pekerjaan sub-kontraktor.' },
    { id: 'unit_price', label: 'Harga Satuan (Unit Price)', description: 'Berdasarkan volume pekerjaan aktual di lapangan.' },
];
