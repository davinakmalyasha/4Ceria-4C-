import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import ProfessionalProfileView from './ProfessionalProfileView';
import { Project } from '../types/project.types';

interface ProfessionalProfileModalProps {
    type: 'architect' | 'constructor';
    data: any;
    projects: Project[];
    onClose: () => void;
    onOpenChat: (prof: any) => void;
}

export default function ProfessionalProfileModal({ type, data, projects, onClose, onOpenChat }: ProfessionalProfileModalProps) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-16 md:p-32 pointer-events-none">
            {/* Backdrop */}
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm pointer-events-auto cursor-pointer"
            />

            {/* Modal Content */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[48px] shadow-2xl overflow-hidden pointer-events-auto relative flex flex-col"
            >
                {/* Custom Close Button (Floating Top Right) */}
                <button 
                    onClick={onClose}
                    className="absolute top-8 right-8 z-[110] p-4 bg-white/20 hover:bg-white/40 backdrop-blur-xl rounded-2xl text-white transition-all hover:rotate-90 hover:scale-110 active:scale-95 shadow-2xl border border-white/30"
                >
                    <X size={28} />
                </button>

                {/* Profile Content (Scrollable) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-20">
                    <div className="rounded-[40px] overflow-hidden shadow-2xl border border-gray-100 bg-white"> 
                        {/* Normal container with its own rounding and shadow */}
                        <ProfessionalProfileView 
                            type={type}
                            data={data}
                            projects={projects}
                            onClose={onClose}
                            onOpenChat={onOpenChat}
                        />
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
