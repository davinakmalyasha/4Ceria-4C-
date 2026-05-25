import React from 'react';
import { Plus, Compass, ShoppingBag, Shield, Pencil, Armchair, Building } from 'lucide-react';

interface Props {
    isUser: boolean;
    setActiveTab: (tab: string) => void;
    onPostProject?: () => void;
}

export default function OverviewQuickActions({ isUser, setActiveTab, onPostProject }: Props) {
    const actions = isUser
        ? [
            { 
                label: 'Start Project', 
                desc: 'Post bidding tenders', 
                icon: Plus, 
                onClick: onPostProject, 
            },
            { 
                label: 'Sell Property', 
                desc: 'List your real estate', 
                icon: Building, 
                onClick: () => setActiveTab('my-houses'), 
            },
            { 
                label: 'Find Notaris', 
                desc: 'Get legal PPAT support', 
                icon: Shield, 
                onClick: () => setActiveTab('explore'), 
            },
            { 
                label: 'Browse Designs', 
                desc: 'Explore floor plans', 
                icon: Pencil, 
                onClick: () => setActiveTab('explore'), 
            },
            { 
                label: 'Interior Design', 
                desc: 'Get premium styling', 
                icon: Armchair, 
                onClick: () => setActiveTab('explore'), 
            },
            { 
                label: 'Marketplace', 
                desc: 'Direct shop materials', 
                icon: ShoppingBag, 
                onClick: () => setActiveTab('explore'), 
            },
        ]
        : [
            { 
                label: 'Browse Tenders', 
                desc: 'Find jobs & submit proposals', 
                icon: Compass, 
                onClick: () => setActiveTab('projects'), 
            },
            { 
                label: 'My Profile', 
                desc: 'Manage portfolio & rating', 
                icon: Pencil, 
                onClick: () => setActiveTab('profile'), 
            },
        ];

    return (
        <div className="space-y-3">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Quick Shortcuts</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {actions.map((a) => {
                    const Icon = a.icon;
                    return (
                        <button
                            key={a.label}
                            onClick={a.onClick}
                            className="flex flex-col text-left p-4 rounded-3xl bg-white border border-neutral-200/80 shadow-sm select-none transition-all hover:bg-neutral-50/50 hover:border-neutral-400 active:scale-[0.97]"
                        >
                            <div className="p-2 bg-neutral-50 rounded-xl border border-neutral-200 text-neutral-600 self-start mb-3">
                                <Icon size={16} />
                            </div>
                            <span className="text-xs font-extrabold text-neutral-900 tracking-tight">{a.label}</span>
                            <span className="text-[10px] text-neutral-500 font-semibold mt-0.5">{a.desc}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
