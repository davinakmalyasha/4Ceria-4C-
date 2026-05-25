import React from 'react';
import { FileSearch, Sparkles, PlusCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
    hasQuery: boolean;
    onClearFilters: () => void;
    onPostProject?: () => void;
    userRole?: string;
}

export default function ProjectEmptyState({ hasQuery, onClearFilters, onPostProject, userRole }: Props) {
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.98 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="w-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-white to-zinc-50/50 rounded-[2.5rem] border-2 border-dashed border-zinc-100 shadow-xl shadow-zinc-100/20 min-h-[350px] relative overflow-hidden"
        >
            {/* Background Accent */}
            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-red-50/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-64 h-64 bg-zinc-100/50 rounded-full blur-3xl pointer-events-none" />

            <div className="relative mb-5">
                <div className="w-28 h-28 bg-white rounded-3xl shadow-2xl shadow-red-100/50 flex items-center justify-center ring-1 ring-zinc-50 group">
                    <FileSearch className="w-12 h-12 text-zinc-900 group-hover:scale-110 transition-transform duration-500" />
                </div>
                <motion.div 
                    animate={{ y: [0, -4, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -top-3 -right-3 w-10 h-10 bg-red-600 rounded-2xl shadow-xl flex items-center justify-center text-white"
                >
                    <Sparkles size={18} />
                </motion.div>
            </div>
            
            <h3 className="text-3xl font-black text-zinc-900 mb-3 tracking-tight">
                {hasQuery ? "No Results Found" : "Starting Fresh?"}
            </h3>
            
            <p className="text-zinc-500 max-w-sm mx-auto mb-6 leading-relaxed font-medium">
                {hasQuery 
                    ? "We couldn't find any projects matching your current filters. Try broadening your search parameters." 
                    : userRole === 'user'
                        ? "Your project pipeline is currently empty. Ready to bring your architectural vision to life?"
                        : "The bidding board is quiet right now. Check back soon for new high-value opportunities."}
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
                {hasQuery ? (
                    <button 
                        onClick={onClearFilters}
                        className="px-10 py-4 bg-zinc-900 hover:bg-black text-white font-black rounded-2xl transition-all active:scale-95 shadow-xl shadow-zinc-200 text-xs uppercase tracking-[0.2em]"
                    >
                        Reset Filters
                    </button>
                ) : onPostProject ? (
                    <button 
                        onClick={onPostProject}
                        className="group flex items-center gap-3 px-10 py-4 bg-red-600 hover:bg-black text-white font-black rounded-2xl shadow-2xl shadow-red-100 transition-all hover:-translate-y-1 active:scale-95 text-xs uppercase tracking-[0.3em]"
                    >
                        <PlusCircle size={18} className="group-hover:rotate-90 transition-transform" />
                        Create New Project
                    </button>
                ) : (
                    <div className="px-8 py-3 bg-zinc-200/50 text-zinc-400 font-black rounded-2xl text-[10px] uppercase tracking-widest">
                        Standing By for Projects
                    </div>
                )}
            </div>
        </motion.div>
    );
}

