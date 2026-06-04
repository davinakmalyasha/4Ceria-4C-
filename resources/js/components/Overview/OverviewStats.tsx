import React from 'react';
import { FolderKanban, FileText, Search } from 'lucide-react';

interface Props {
    isUser: boolean;
    projectCount: number;
    bidCount: number;
    openTenders: number;
    setActiveTab: (tab: string) => void;
    availableProsCount?: number;
}

export default function OverviewStats({ isUser, projectCount, bidCount, openTenders, setActiveTab, availableProsCount = 0 }: Props) {
    const stats = isUser
        ? [
            { 
                label: 'Active Projects', 
                value: projectCount, 
                icon: FolderKanban, 
                tab: 'projects' 
            },
            { 
                label: 'Bids Received', 
                value: bidCount, 
                icon: FileText, 
                tab: 'projects' 
            },
            { 
                label: 'Available Pros', 
                value: availableProsCount, 
                icon: Search, 
                tab: 'explore' 
            },
        ]
        : [
            { 
                label: 'Open Tenders', 
                value: openTenders, 
                icon: Search, 
                tab: 'projects' 
            },
            { 
                label: 'My Proposals', 
                value: bidCount, 
                icon: FileText, 
                tab: 'my-bids' 
            },
            { 
                label: 'My Projects', 
                value: projectCount, 
                icon: FolderKanban, 
                tab: 'management' 
            },
        ];

    return (
        <div className="grid grid-cols-3 gap-3">
            {stats.map((s) => {
                const Icon = s.icon;
                return (
                    <button
                        key={s.label}
                        onClick={() => setActiveTab(s.tab)}
                        className="bg-white rounded-3xl border border-neutral-200/80 p-5 shadow-sm hover:border-neutral-400 hover:bg-neutral-50/20 transition-all text-left flex flex-col items-start justify-between select-none active:scale-[0.97]"
                    >
                        <div className="w-9 h-9 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-600 flex items-center justify-center mb-4">
                            <Icon size={16} />
                        </div>
                        <div>
                            <p className="text-3xl font-black text-neutral-800 tracking-tight leading-none">{s.value}</p>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mt-1.5 leading-none">
                                {s.label}
                            </p>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
