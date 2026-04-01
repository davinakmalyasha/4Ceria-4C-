import React from 'react';
import { motion } from 'framer-motion';
import { Project } from '../../types/project.types';
import { Briefcase, Calendar, MapPin, ArrowRight, ShieldCheck } from 'lucide-react';

interface ProfessionalProjectsProps {
    projects: Project[];
    isLoading: boolean;
    onViewProject: (project: Project) => void;
    formatCurrency: (amount: number) => string;
}

export default function ProfessionalProjects({ projects, isLoading, onViewProject, formatCurrency }: ProfessionalProjectsProps) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-64 bg-white rounded-3xl animate-pulse border border-gray-100" />
                ))}
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
                    🏗️
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">No Active Projects Yet</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                    Once your proposals are accepted by clients, they will appear here. Keep bidding on the Bidding Board!
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.map((project) => (
                <motion.div
                    key={project.id}
                    layoutId={`project-${project.id}`}
                    className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all group overflow-hidden flex flex-col"
                >
                    {/* Status Banner */}
                    <div className="bg-blue-600 px-6 py-2 flex items-center justify-between">
                        <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                            <ShieldCheck size={12} /> Active Collaboration
                        </span>
                        <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">
                            {project.status.replace('_', ' ')}
                        </span>
                    </div>

                    <div className="p-6 flex-1 flex flex-col">
                        <h3 className="text-lg font-black text-gray-900 mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors">
                            {project.title}
                        </h3>
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-4 font-medium">
                            <span className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
                                <Briefcase size={14} className="text-blue-600" /> 
                                {project.type}
                            </span>
                            <span className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
                                <MapPin size={14} className="text-blue-600" /> 
                                {project.location?.split(',')[0]}
                            </span>
                        </div>

                        <p className="text-sm text-gray-600 line-clamp-2 mb-6 font-medium leading-relaxed">
                            {project.description}
                        </p>

                        <div className="mt-auto pt-6 border-t border-gray-50 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-0.5">Budget</p>
                                <p className="text-lg font-black text-gray-900">{formatCurrency(project.budget)}</p>
                            </div>
                            
                            <button 
                                onClick={() => onViewProject(project)}
                                className="bg-gray-900 text-white p-3 rounded-2xl hover:bg-blue-600 transition-all shadow-lg shadow-black/10 hover:shadow-blue-500/20 group/btn"
                            >
                                <ArrowRight size={20} className="group-hover/btn:translate-x-0.5 transition-transform" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
