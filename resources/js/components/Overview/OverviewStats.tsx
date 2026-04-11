import React from 'react';
import { FolderKanban, FileText, Search, TrendingUp } from 'lucide-react';

interface OverviewStatsProps {
    isUser: boolean;
    projectCount: number;
    bidCount: number;
    openTenders: number;
    setActiveTab: (tab: string) => void;
}

export default function OverviewStats({ isUser, projectCount, bidCount, openTenders, setActiveTab }: OverviewStatsProps) {
    const stats = isUser
        ? [
            { label: 'Active Projects', value: projectCount, icon: FolderKanban, color: 'text-blue-500 bg-blue-50', tab: 'projects' },
            { label: 'Bids Received', value: bidCount, icon: FileText, color: 'text-emerald-500 bg-emerald-50', tab: 'projects' },
            { label: 'Available Pros', value: '100+', icon: Search, color: 'text-purple-500 bg-purple-50', tab: 'explore' },
        ]
        : [
            { label: 'Open Tenders', value: openTenders, icon: Search, color: 'text-blue-500 bg-blue-50', tab: 'projects' },
            { label: 'My Proposals', value: bidCount, icon: FileText, color: 'text-emerald-500 bg-emerald-50', tab: 'my-bids' },
            { label: 'My Projects', value: projectCount, icon: FolderKanban, color: 'text-purple-500 bg-purple-50', tab: 'management' },
        ];

    return (
        <div className="grid grid-cols-3 gap-3">
            {stats.map((s) => {
                const Icon = s.icon;
                return (
                    <button
                        key={s.label}
                        onClick={() => setActiveTab(s.tab)}
                        className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
                    >
                        <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center mb-3`}>
                            <Icon size={16} />
                        </div>
                        <p className="text-2xl font-black text-gray-900">{s.value}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">{s.label}</p>
                    </button>
                );
            })}
        </div>
    );
}
