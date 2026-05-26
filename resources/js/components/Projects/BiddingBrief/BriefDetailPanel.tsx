import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProjectQA from '../ProjectQA';
import { Layers, ArrowLeft, DollarSign, MapPin, Calendar, X, ZoomIn } from 'lucide-react';
import { User } from '../../../context/AuthContext';
import { Project } from '../../../types/project.types';

interface BriefDetailPanelProps {
    project: Project;
    user?: User | null;
    onRefresh: () => void;
    onBack: () => void;
}

export const BriefDetailPanel: React.FC<BriefDetailPanelProps> = ({ project, user, onRefresh, onBack }) => {
    const [selectedImgUrl, setSelectedImgUrl] = useState<string | null>(null);
    const images = project?.images || [];
    const neededPhases = project?.needed_phases || [];
    const formattedBudget = Number(project?.budget || 0).toLocaleString('id-ID');
    const deadlineDate = project?.deadline 
        ? new Date(project.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'ASAP';

    const getPhaseLabel = (phase: string) => {
        const labels: Record<string, string> = {
            legal: 'Legalities',
            design: 'Architecture Design',
            technical: 'Engineering',
            materials: 'Procurement',
            interior: 'Interior Design',
            build: 'Construction'
        };
        return labels[phase] || phase.toUpperCase();
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedImgUrl(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="space-y-6">
            {/* Project Overview Card */}
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-5">
                {/* Header inside Card */}
                <div className="pb-4 border-b border-gray-100/60 space-y-3">
                    {/* Back Button Row */}
                    <div>
                        <button 
                            onClick={onBack} 
                            className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-all active:scale-95 border border-gray-100/50 shadow-sm bg-white flex items-center gap-1.5 text-xs font-bold"
                            title="Back to board"
                        >
                            <ArrowLeft size={14} />
                            <span>Back to Board</span>
                        </button>
                    </div>
                    
                    {/* Title & Metadata Row */}
                    <div className="space-y-1">
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">{project?.title}</h1>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 font-semibold">
                            <span className="flex items-center gap-1">
                                <DollarSign size={13} className="text-emerald-500" />
                                Target Budget: <span className="text-emerald-600 font-bold">Rp {formattedBudget}</span>
                            </span>
                            <span className="w-1 h-1 rounded-full bg-gray-200" />
                            <span className="flex items-center gap-1">
                                <MapPin size={13} className="text-red-400" />
                                {project?.city || project?.lokasi || 'Unknown'}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-gray-200" />
                            <span className="flex items-center gap-1">
                                <Calendar size={13} className="text-blue-400" />
                                {deadlineDate}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Brief Description */}
                <div className="space-y-2">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Project Brief</h3>
                    <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                        {project?.description || 'No detailed description provided for this project.'}
                    </p>
                </div>
            </div>

            {/* Gallery (Drawings & Photos) - Moved UP */}
            {images.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                        Drawings & Photos ({images.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {images.map((img: any, idx: number) => (
                            <motion.div
                                key={img.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => setSelectedImgUrl(img.url)}
                                className="aspect-[4/3] rounded-2xl overflow-hidden border border-gray-100 group relative shadow-sm cursor-zoom-in"
                            >
                                <img 
                                    src={img.url} 
                                    alt="Project Scope" 
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                                  />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <ZoomIn className="text-white drop-shadow-md" size={20} />
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* Scope / Phases Required - Moved DOWN */}
            {neededPhases.length > 0 && (
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Layers size={14} className="text-gray-400" /> Required Specialties
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {neededPhases.map((phase: string) => (
                            <span 
                                key={phase} 
                                className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-100 text-xs font-bold text-gray-600 uppercase tracking-wider"
                            >
                                {getPhaseLabel(phase)}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Public Discussion Board */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <ProjectQA project={project} onRefresh={onRefresh} user={user} />
            </div>

            {/* Image Zoom Modal */}
            <AnimatePresence>
                {selectedImgUrl && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedImgUrl(null)}
                            className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm cursor-zoom-out"
                        />
                        
                        {/* Close Button */}
                        <button
                            onClick={() => setSelectedImgUrl(null)}
                            className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
                        >
                            <X size={20} />
                        </button>
                        
                        {/* Image Wrapper */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                            className="relative z-10 max-w-[90vw] max-h-[85vh] flex items-center justify-center"
                        >
                            <img
                                src={selectedImgUrl}
                                alt="Zoomed View"
                                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
