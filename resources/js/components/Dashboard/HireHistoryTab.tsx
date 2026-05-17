import React from 'react';
import { motion } from 'framer-motion';
import { Search, Users, Filter, ArrowRight } from 'lucide-react';
import { HireHistoryCard } from './HireHistoryCard';
import { HireHistory } from '../../types/hire_history.types';

interface HireHistoryTabProps {
    history: HireHistory[];
    isLoading: boolean;
    onOpenChat: (userId: number) => void;
    onBrowseProfessionals: () => void;
}

export const HireHistoryTab: React.FC<HireHistoryTabProps> = ({ 
    history, 
    isLoading, 
    onOpenChat,
    onBrowseProfessionals
}) => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedRole, setSelectedRole] = React.useState('All');

    const filteredHistory = history.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             item.project_title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = selectedRole === 'All' || item.role === selectedRole;
        return matchesSearch && matchesRole;
    });

    const roles = ['All', ...Array.from(new Set(history.map(h => h.role)))];

    if (isLoading) {
        return (
            <div className="space-y-8 animate-pulse">
                <div className="h-12 bg-gray-100 rounded-2xl w-full" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-64 bg-gray-50 rounded-[2.5rem]" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tight">Hire History</h2>
                    <p className="text-sm text-gray-400 font-medium mt-1">Manage all professionals you've worked with previously.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text"
                            placeholder="Search names or projects..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-12 pr-6 py-3.5 bg-white border border-gray-100 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-red-50 focus:border-red-500 transition-all w-full md:w-64 shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Role Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <div className="p-1.5 bg-white border border-gray-100 rounded-2xl flex gap-1 shadow-sm">
                    {roles.map(role => (
                        <button
                            key={role}
                            onClick={() => setSelectedRole(role)}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                                selectedRole === role 
                                ? 'bg-red-50 text-[#FF2D20]' 
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {role}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {filteredHistory.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredHistory.map((item, index) => (
                        <HireHistoryCard 
                            key={`${item.id}-${index}`} 
                            hire={item} 
                            onOpenChat={onOpenChat} 
                        />
                    ))}
                </div>
            ) : (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-20 flex flex-col items-center justify-center text-center bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200"
                >
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl shadow-gray-200/50 mb-6">
                        <Users size={40} className="text-gray-300" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">No Hired Professionals Yet</h3>
                    <p className="text-sm text-gray-500 font-medium max-w-xs mx-auto mt-2 leading-relaxed">
                        Your professional network starts here. Browse and hire top talent for your architectural projects.
                    </p>
                    <button 
                        onClick={onBrowseProfessionals}
                        className="mt-8 flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-2xl shadow-slate-900/20 group"
                    >
                        Browse Architects
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </motion.div>
            )}
        </div>
    );
};
