import React from 'react';
import { FileSearch } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
    hasQuery: boolean;
    onClearFilters: () => void;
    onPostProject?: () => void;
}

export default function ProjectEmptyState({ hasQuery, onClearFilters, onPostProject }: Props) {
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
                    : "Your project history is empty. Start by posting a new project to get bids from professionals."}
            </p>

            {hasQuery ? (
                <button 
                    onClick={onClearFilters}
                    className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                >
                    Clear Filters
                </button>
            ) : onPostProject ? (
                <button 
                    onClick={onPostProject}
                    className="px-6 py-2.5 bg-[#FF2D20] hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition-colors hover:shadow-md"
                >
                    + Post First Project
                </button>
            ) : null}
        </motion.div>
    );
}
