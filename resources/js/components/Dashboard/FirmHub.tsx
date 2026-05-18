import React, { useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import FirmRoster from './FirmRoster';
import JoinRequestsList from './JoinRequestsList';

interface FirmHubProps {
    onOpenChat: (user: { id: number }) => void;
}

type FirmTabId = 'roster' | 'requests';

interface FirmTab {
    id: FirmTabId;
    label: string;
    icon: React.FC<{ size?: number }>;
}

const TABS: FirmTab[] = [
    { id: 'roster', label: 'Firm Roster', icon: Users },
    { id: 'requests', label: 'Join Requests', icon: UserPlus },
];

export default function FirmHub({ onOpenChat }: FirmHubProps) {
    const [activeTab, setActiveTab] = useState<FirmTabId>('roster');

    return (
        <div className="space-y-6">
            {/* Tab Switcher */}
            <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                isActive
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <Icon size={14} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {activeTab === 'roster' && (
                <FirmRoster onOpenChat={onOpenChat} />
            )}

            {activeTab === 'requests' && (
                <JoinRequestsList />
            )}
        </div>
    );
}
