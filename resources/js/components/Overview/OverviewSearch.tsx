import React, { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';

interface Props {
    setActiveTab: (tab: string) => void;
}

const SHORTCUTS = [
    { label: 'Red Bricks', tab: 'marketplace-materials' },
    { label: 'SHM Houses', tab: 'houses' },
    { label: 'Architects', tab: 'architects' },
    { label: 'Legal Notary', tab: 'notaris' },
];

export default function OverviewSearch({ setActiveTab }: Props) {
    const [query, setQuery] = useState('');

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const q = query.toLowerCase();
        if (q.includes('brick') || q.includes('material') || q.includes('semen') || q.includes('pasir')) {
            setActiveTab('marketplace-materials');
        } else if (q.includes('house') || q.includes('rumah') || q.includes('tanah') || q.includes('property')) {
            setActiveTab('houses');
        } else if (q.includes('architect') || q.includes('arsitek') || q.includes('design')) {
            setActiveTab('architects');
        } else if (q.includes('notar') || q.includes('hukum') || q.includes('legal')) {
            setActiveTab('notaris');
        } else if (q.includes('kontraktor') || q.includes('build') || q.includes('bangun')) {
            setActiveTab('constructors');
        } else {
            setActiveTab('explore');
        }
    };

    return (
        <div className="w-full bg-white border border-neutral-200 p-4 rounded-3xl shadow-sm space-y-3">
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
                <Search className="absolute left-4 text-neutral-400" size={18} />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search materials, verified architects, legal notary, or house designs..."
                    className="w-full pl-12 pr-28 py-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-xs font-semibold placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/5 focus:border-neutral-900 transition-all text-neutral-800"
                />
                <button
                    type="submit"
                    className="absolute right-2 px-4 py-2 bg-neutral-900 text-white rounded-xl text-[11px] font-bold hover:bg-neutral-800 transition-all flex items-center gap-1 active:scale-95"
                >
                    Find <ArrowRight size={12} />
                </button>
            </form>
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Fast Tags:</span>
                {SHORTCUTS.map((sc) => (
                    <button
                        key={sc.label}
                        onClick={() => setActiveTab(sc.tab)}
                        className="px-3 py-1.5 bg-neutral-50 border border-neutral-200/60 hover:border-neutral-400 hover:bg-neutral-100 rounded-lg text-[10px] font-bold text-neutral-600 transition-all active:scale-[0.97]"
                    >
                        {sc.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
