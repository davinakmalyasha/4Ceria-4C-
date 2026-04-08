import React from 'react';
import { X } from 'lucide-react';
import { StatusBadge } from '../../Common/StatusBadge';


interface Props {
    title: string;
    status: string;
    activeTab: string;
    setActiveTab: (tab: any) => void;
    onClose: () => void;
    isManagementView?: boolean;
}

export const ProjectDetailHeader: React.FC<Props> = ({ 
    title, status, activeTab, setActiveTab, onClose, isManagementView 
}) => {
    return (
        <div className="shrink-0 flex flex-col bg-white z-20 border-b border-gray-100">
            {/* Top Bar */}
            <div className="px-8 py-6 flex justify-between items-center bg-gray-50/50">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-extrabold text-gray-900 line-clamp-1">{title}</h2>
                    <StatusBadge status={status} size="sm" />
                </div>

                <button
                    onClick={onClose}
                    className="bg-white text-gray-400 p-2 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors border border-gray-100"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex px-6 pt-4 border-b border-gray-100 overflow-x-auto scrollbar-none bg-white">
                <button 
                    onClick={() => setActiveTab('details')} 
                    className={`pb-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'details' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    Details & Bids
                </button>
                <button 
                    onClick={() => setActiveTab('team')} 
                    className={`pb-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'team' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    Team
                </button>
                {isManagementView && (
                    <>
                        <button onClick={() => setActiveTab('milestones')} className={`pb-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'milestones' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Milestones</button>
                        <button onClick={() => setActiveTab('materials')} className={`pb-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'materials' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Materials</button>
                    </>
                )}
                <button onClick={() => setActiveTab('qa')} className={`pb-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'qa' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Q&A Chat</button>
                {isManagementView && (
                    <>
                        <button onClick={() => setActiveTab('vault')} className={`pb-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'vault' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Vault</button>
                        <button onClick={() => setActiveTab('activity')} className={`pb-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'activity' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>Activity</button>
                    </>
                )}
            </div>
        </div>
    );
};
