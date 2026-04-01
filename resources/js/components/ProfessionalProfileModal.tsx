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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 pointer-events-none">
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
                className="bg-white w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden pointer-events-auto relative flex flex-col"
            >
                {/* Custom Close Button (Floating Top Right) */}
                <button 
                    onClick={onClose}
                    className="absolute top-6 right-6 z-[110] p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-xl text-white transition-all hover:rotate-90"
                >
                    <X size={24} />
                </button>

                {/* Profile Content (Scrollable) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pt-0 px-0">
                    <div className="-mt-6"> {/* Compensation for Internal Padding of ProfessionalProfileView if any */}
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
