import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Briefcase, MessageSquare, ArrowRight } from 'lucide-react';
import { Project } from '../../types/project.types';

interface Props {
    projects: Project[];
    onSelect: (project: Project) => void;
    onClose: () => void;
    formatCurrency: (amount: number) => string;
}

export default function ProjectQuickSelectModal({ projects, onSelect, onClose, formatCurrency }: Props) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100"
            >
                <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 italic">Quick Select</h3>
                        <p className="text-xs text-gray-500 font-medium mt-1">Which project would you like to review?</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-900">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
                    <div className="space-y-3">
                        {projects.map((project) => (
                            <button
                                key={project.id}
                                onClick={() => {
                                    onSelect(project);
                                    onClose();
                                }}
                                className="w-full group flex items-center gap-4 p-4 rounded-2xl bg-gray-50 hover:bg-orange-50 border border-transparent hover:border-orange-100 transition-all text-left"
                            >
                                <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
                                    <Briefcase size={22} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-gray-900 truncate group-hover:text-orange-700 transition-colors">{project.title}</h4>
                                    <div className="flex items-center gap-3 mt-1">
                                        <p className="text-xs font-bold text-orange-600">{formatCurrency(project.budget)}</p>
                                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                                        <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400 flex items-center gap-1">
                                            <MessageSquare size={10} /> {(project.bids_arsitek_count || 0) + (project.bids_kontraktor_count || 0)} Bids
                                        </p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-orange-600 transition-all transform translate-x-2 group-hover:translate-x-0 shadow-sm border border-orange-50">
                                    <ArrowRight size={14} />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="p-6 bg-gray-50/50 flex justify-center">
                    <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-[0.2em]">Select a project to view proposals</p>
                </div>
            </motion.div>
        </div>
    );
}
