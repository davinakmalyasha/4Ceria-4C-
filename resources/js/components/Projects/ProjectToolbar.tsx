import React from 'react';
import { 
    Search, SlidersHorizontal, ArrowDownAZ, LayoutGrid, 
    List, KanbanSquare, Plus, Wallet, MessageSquare, CheckCircle 
} from 'lucide-react';
import { formatCurrency } from '../../types/project.types';

interface Props {
    search: string;
    onSearchChange: (val: string) => void;
    statusFilter: string;
    onStatusChange: (val: string) => void;
    sortBy: 'newest' | 'budget_desc' | 'budget_asc' | 'deadline_asc';
    onSortChange: (val: 'newest' | 'budget_desc' | 'budget_asc' | 'deadline_asc') => void;
    viewMode: 'grid' | 'list' | 'board';
    onViewModeChange: (val: 'grid' | 'list' | 'board') => void;
    stats: { all: number; open: number; inProgress: number; completed: number };
    totalCount: number;
    showPostButton?: boolean;
    onPostProject?: () => void;
    
    // Dense Stats Capsule Props
    totalBudget?: number;
    activeBidsCount?: number;
    completedCount?: number;
    userRole?: string;
    onViewMyBids?: () => void;
    onViewActiveBids?: () => void;
}

export default function ProjectToolbar({
    search, onSearchChange, statusFilter, onStatusChange, 
    sortBy, onSortChange, viewMode, onViewModeChange, stats, totalCount, 
    showPostButton, onPostProject,
    totalBudget, activeBidsCount, completedCount, userRole,
    onViewMyBids, onViewActiveBids
}: Props) {
    const isUser = userRole === 'user';
    const isClickable = (isUser && (activeBidsCount || 0) > 0 && onViewActiveBids) || (!isUser && onViewMyBids);



    return (
        <div className="space-y-5 w-full">
            {/* Header / Search & Stats row */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 w-full">
                
                {/* Search & Stats grouped together */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 w-full max-w-4xl">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text"
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Search projects..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200/80 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/10 focus:border-[#FF2D20] transition-all shadow-sm font-medium text-gray-800"
                        />
                    </div>

                    {/* Ultra-dense Stats Capsule */}
                    {totalBudget !== undefined && (
                        <div className="flex items-center bg-zinc-50 border border-gray-200/50 rounded-xl px-3 py-1.5 gap-3.5 text-[11px] font-bold text-gray-500 shadow-sm whitespace-nowrap overflow-x-auto scrollbar-hide shrink-0">
                            {/* Budget */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                <div className="p-1 rounded-md bg-white border border-gray-100 shadow-xs">
                                    <Wallet size={12} className="text-zinc-650" />
                                </div>
                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Budget:</span>
                                <span className="text-gray-900 font-extrabold">{formatCurrency(totalBudget)}</span>
                            </div>
                            
                            <div className="w-[1px] h-3.5 bg-gray-200 shrink-0" />
                            
                            {/* Active Bids / Proposals */}
                            <div 
                                onClick={isClickable ? (isUser ? onViewActiveBids : onViewMyBids) : undefined} 
                                className={`flex items-center gap-1.5 shrink-0 ${
                                    isClickable 
                                        ? 'cursor-pointer hover:text-[#FF2D20] transition-colors group' 
                                        : ''
                                }`}
                            >
                                <div className={`p-1 rounded-md bg-white border border-gray-105 shadow-xs ${
                                    isClickable ? 'group-hover:border-[#FF2D20]/30 transition-colors' : ''
                                }`}>
                                    <MessageSquare size={12} className="text-zinc-650 group-hover:text-[#FF2D20] transition-colors" />
                                </div>
                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                                    {isUser ? 'Bids:' : 'Proposals:'}
                                </span>
                                <span className="text-gray-900 font-extrabold group-hover:text-[#FF2D20] transition-colors">
                                    {activeBidsCount || 0}
                                </span>
                                {isClickable && (
                                    <span className="text-[10px] text-gray-400 group-hover:text-[#FF2D20] transition-colors ml-0.5">&rarr;</span>
                                )}
                            </div>
                            
                            <div className="w-[1px] h-3.5 bg-gray-200 shrink-0" />
                            
                            {/* Completed */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                <div className="p-1 rounded-md bg-white border border-gray-100 shadow-xs">
                                    <CheckCircle size={12} className="text-zinc-650" />
                                </div>
                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Done:</span>
                                <span className="text-gray-900 font-extrabold">{completedCount || 0}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Filters, View mode & Post button grouped on the right */}
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto shrink-0 justify-between sm:justify-end">
                    {/* Sort Dropdown */}
                    <div className="relative bg-white border border-gray-200/80 rounded-xl shadow-sm text-xs sm:text-sm group flex items-center pr-2 pl-1">
                        <div className="pl-2 pr-1.5 border-r border-gray-100 flex items-center text-gray-400 pointer-events-none gap-2">
                            <ArrowDownAZ className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-extrabold mr-1 uppercase tracking-wider text-gray-500">Sort</span>
                        </div>
                        <select 
                            value={sortBy}
                            onChange={(e) => onSortChange(e.target.value as any)}
                            className="bg-transparent border-none outline-none py-2 pl-2 pr-8 focus:ring-0 font-bold text-gray-700 cursor-pointer appearance-none text-xs"
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

                    {/* View Modes */}
                    <div className="hidden md:flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200/60 shadow-xs">
                        <button
                            onClick={() => onViewModeChange('grid')}
                            className={`p-1.5 rounded-lg transition-all ${
                                viewMode === 'grid' 
                                    ? 'bg-white text-[#FF2D20] shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                            title="Grid View"
                        >
                            <LayoutGrid size={15} />
                        </button>
                        <button
                            onClick={() => onViewModeChange('list')}
                            className={`p-1.5 rounded-lg transition-all ${
                                viewMode === 'list' 
                                    ? 'bg-white text-[#FF2D20] shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                            title="List View"
                        >
                            <List size={15} />
                        </button>
                        <button
                            onClick={() => onViewModeChange('board')}
                            className={`p-1.5 rounded-lg transition-all ${
                                viewMode === 'board' 
                                    ? 'bg-white text-[#FF2D20] shadow-sm' 
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                            title="Kanban Board"
                        >
                            <KanbanSquare size={15} />
                        </button>
                    </div>

                    {/* Post Project Button */}
                    {showPostButton && onPostProject && (
                        <button 
                            onClick={onPostProject} 
                            className="bg-zinc-900 text-white px-5 py-2.5 rounded-xl font-extrabold text-[10px] sm:text-xs uppercase tracking-widest hover:bg-black hover:shadow-[0_8px_25px_-5px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 transition-all active:scale-95 shadow-lg shadow-black/10 flex items-center gap-1.5 shrink-0"
                        >
                            <Plus size={13} className="stroke-[3px]" />
                            Post Project
                        </button>
                    )}
                </div>
            </div>


        </div>
    );
}

