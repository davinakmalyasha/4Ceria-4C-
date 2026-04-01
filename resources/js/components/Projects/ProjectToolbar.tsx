import React from 'react';
import { Search, SlidersHorizontal, ArrowDownAZ, LayoutGrid, List, KanbanSquare } from 'lucide-react';

interface Props {
    search: string;
    onSearchChange: (val: string) => void;
    statusFilter: string;
    onStatusChange: (val: string) => void;
    sortBy: string;
    onSortChange: (val: any) => void;
    viewMode: 'grid' | 'list' | 'board';
    onViewModeChange: (val: 'grid' | 'list' | 'board') => void;
    stats: { all: number; open: number; inProgress: number; completed: number };
    totalCount: number;
    showPostButton?: boolean;
    onPostProject?: () => void;
}

export default function ProjectToolbar({
    search, onSearchChange, statusFilter, onStatusChange, 
    sortBy, onSortChange, viewMode, onViewModeChange, stats, totalCount, 
    showPostButton, onPostProject
}: Props) {
    const tabs = [
        { id: 'all', label: 'All Projects', count: stats.all },
        { id: 'open', label: 'Open', count: stats.open },
        { id: 'in_progress', label: 'In Progress', count: stats.inProgress },
        { id: 'completed', label: 'Completed', count: stats.completed },
    ];

    return (
        <div className="space-y-6 mb-8 w-full">
            {/* Header / Search row */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                        type="text"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search projects..."
                        className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] transition-shadow shadow-sm"
                    />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-between md:justify-end">
                    <div className="relative bg-white border border-gray-200 rounded-xl shadow-sm text-sm group flex items-center pr-2 pl-1">
                        <div className="pl-2 pr-1 border-r border-gray-100 flex items-center text-gray-400 pointer-events-none gap-2">
                            <ArrowDownAZ className="w-4 h-4" />
                            <span className="text-xs font-semibold mr-1 uppercase">Sort</span>
                        </div>
                        <select 
                            value={sortBy}
                            onChange={(e) => onSortChange(e.target.value as any)}
                            className="bg-transparent border-none outline-none py-2.5 pl-3 pr-8 focus:ring-0 font-medium text-gray-700 cursor-pointer appearance-none"
                        >
                            <option value="newest">Newest First</option>
                            <option value="budget_desc">Highest Budget</option>
                            <option value="budget_asc">Lowest Budget</option>
                            <option value="deadline_asc">Deadline (Soonest)</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <SlidersHorizontal className="w-3 h-3 text-gray-400" />
                        </div>
                    </div>

                    <div className="hidden md:flex items-center bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200/60">
                        <button
                            onClick={() => onViewModeChange('grid')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-[#FF2D20] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button
                            onClick={() => onViewModeChange('list')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-[#FF2D20] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <List size={18} />
                        </button>
                        <button
                            onClick={() => onViewModeChange('board')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'board' ? 'bg-white text-[#FF2D20] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <KanbanSquare size={18} />
                        </button>
                    </div>

                    {showPostButton && onPostProject && (
                        <button 
                            onClick={onPostProject} 
                            className="bg-[#FF2D20] text-white px-5 py-2.5 rounded-xl font-bold hover:bg-red-700 transition-all shadow-[0_4px_14px_0_rgba(255,45,32,0.2)] hover:shadow-[0_6px_20px_rgba(255,45,32,0.3)] hover:-translate-y-0.5"
                        >
                            + Post Project
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-gray-200">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => onStatusChange(tab.id)}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 font-semibold text-sm transition-colors whitespace-nowrap ${
                            statusFilter === tab.id 
                                ? 'border-[#FF2D20] text-[#FF2D20]' 
                                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                        }`}
                    >
                        {tab.label}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            statusFilter === tab.id ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            <div className="text-sm text-gray-500 font-medium mt-1">
                Showing {totalCount} matching {totalCount === 1 ? 'project' : 'projects'}
            </div>
        </div>
    );
}
