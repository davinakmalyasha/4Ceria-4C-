import React from 'react';
import { FileSearch } from 'lucide-react';
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
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full flex flex-col items-center justify-center p-12 text-center bg-white rounded-3xl border border-gray-100 border-dashed shadow-sm min-h-[400px]"
        >
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                <FileSearch className="w-12 h-12 text-gray-400" />
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 mb-2">
                {hasQuery ? "No matching projects found" : "No projects yet"}
            </h3>
            
            <p className="text-gray-500 max-w-sm mx-auto mb-8 leading-relaxed">
                {hasQuery 
                    ? "We couldn't find any projects matching your current filters or search query." 
                    : userRole === 'user'
                        ? "Your project history is empty. Start by posting a new project to get bids from professionals."
                        : "There are currently no open projects available for bidding in your category. Check back later!"}
            </p>

            {hasQuery ? (
                <button 
                    onClick={onClearFilters}
                    className="px-6 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold rounded-xl transition-all active:scale-95"
                >
                    Clear Filters
                </button>
            ) : onPostProject ? (
                <button 
                    onClick={onPostProject}
                    className="px-8 py-2.5 bg-zinc-900 text-white font-extrabold rounded-xl shadow-xl shadow-black/10 hover:bg-black hover:-translate-y-0.5 transition-all text-sm uppercase tracking-widest"
                >
                    Post First Project
                </button>
            ) : null}
        </motion.div>
    );
}
