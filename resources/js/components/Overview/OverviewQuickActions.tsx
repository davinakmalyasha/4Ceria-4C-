import React from 'react';
import { Plus, Compass, ShoppingBag, Shield, Pencil, Armchair } from 'lucide-react';

interface OverviewQuickActionsProps {
    isUser: boolean;
    setActiveTab: (tab: string) => void;
    onPostProject?: () => void;
}

export default function OverviewQuickActions({ isUser, setActiveTab, onPostProject }: OverviewQuickActionsProps) {
    const actions = isUser
        ? [
            { label: 'Start Project', icon: Plus, onClick: onPostProject, color: 'bg-red-50 text-[#FF2D20] hover:bg-red-100' },
            { label: 'Find Notaris', icon: Shield, onClick: () => setActiveTab('explore'), color: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
            { label: 'Browse Designs', icon: Pencil, onClick: () => setActiveTab('explore'), color: 'bg-purple-50 text-purple-600 hover:bg-purple-100' },
            { label: 'Interior Design', icon: Armchair, onClick: () => setActiveTab('explore'), color: 'bg-amber-50 text-amber-600 hover:bg-amber-100' },
            { label: 'Marketplace', icon: ShoppingBag, onClick: () => setActiveTab('explore'), color: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' },
        ]
        : [
            { label: 'Browse Tenders', icon: Compass, onClick: () => setActiveTab('projects'), color: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
            { label: 'My Profile', icon: Pencil, onClick: () => setActiveTab('profile'), color: 'bg-purple-50 text-purple-600 hover:bg-purple-100' },
        ];

    return (
        <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
                {actions.map(a => {
                    const Icon = a.icon;
                    return (
                        <button
                            key={a.label}
                            onClick={a.onClick}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97] ${a.color}`}
                        >
                            <Icon size={14} />
                            {a.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
