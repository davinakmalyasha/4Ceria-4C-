import React from 'react';
import { motion } from 'framer-motion';
import ProjectQA from '../ProjectQA';
import { FileText, Layers } from 'lucide-react';

interface BriefDetailPanelProps {
    project: any;
    onRefresh: () => void;
}

export const BriefDetailPanel: React.FC<BriefDetailPanelProps> = ({ project, onRefresh }) => {
    const images = project?.images || [];
    const neededPhases = project?.needed_phases || [];

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

    return (
        <div className="space-y-8">
            {/* Project Overview */}
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-gray-900 rounded-full" />
                    <h3 className="text-lg font-black text-gray-900 tracking-tight uppercase">Project Brief</h3>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                    {project?.description || 'No detailed description provided for this project.'}
                </p>
            </div>

            {/* Scope / Phases Required */}
            {neededPhases.length > 0 && (
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                        <Layers size={18} className="text-gray-400" />
                        <h3 className="text-sm font-black text-gray-900 tracking-tight uppercase">Required Specialties</h3>
                    </div>
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

            {/* Gallery */}
            {images.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-1">
                        Drawings & Photos ({images.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {images.map((img: any, idx: number) => (
                            <motion.div
                                key={img.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                className="aspect-[4/3] rounded-2xl overflow-hidden border border-gray-100 group relative shadow-sm"
                            >
                                <img 
                                    src={img.url} 
                                    alt="Project Scope" 
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* Public Discussion Board */}
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                <ProjectQA project={project} onRefresh={onRefresh} />
            </div>
        </div>
    );
};
