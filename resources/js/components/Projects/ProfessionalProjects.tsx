import React from 'react';
import { motion } from 'framer-motion';
import { Project } from '../../types/project.types';
import { Briefcase, Calendar, MapPin, ArrowRight, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

interface ProfessionalProjectsProps {
    projects: Project[];
    isLoading: boolean;
    onViewProject: (project: Project) => void;
    formatCurrency: (amount: number) => string;
}

const ProfessionalProjectCard = ({ project, onViewProject, formatCurrency }: { 
    project: Project; 
    onViewProject: (p: Project) => void;
    formatCurrency: (amount: number) => string;
}) => {
    const [activeIndex, setActiveIndex] = React.useState(0);
    const images = project.images || [];

    const nextImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    return (
        <motion.div
            layoutId={`project-${project.id}`}
            className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-red-100 transition-all group overflow-hidden flex flex-col"
        >
            {/* Thumbnail Area with Slider */}
            <div className="h-48 relative overflow-hidden bg-zinc-50 border-b border-zinc-100 group/thumb">
                {images.length > 0 ? (
                    <>
                        <AnimatePresence mode="wait">
                            <motion.img 
                                key={activeIndex}
                                src={images[activeIndex].url} 
                                alt={project.title} 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-700" 
                            />
                        </AnimatePresence>

                        {/* Status Overlay Badge */}
                         <div className="absolute top-3 left-3 z-10">
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-600 text-white shadow-lg backdrop-blur-md">
                                <ShieldCheck size={12} /> Active
                            </span>
                        </div>

                        {images.length > 1 && (
                            <>
                                <button 
                                    onClick={prevImage}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 backdrop-blur-md rounded-full shadow-lg opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-white text-zinc-800 z-20"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button 
                                    onClick={nextImage}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 backdrop-blur-md rounded-full shadow-lg opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-white text-zinc-800 z-20"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 px-2.5 py-1.5 bg-black/20 backdrop-blur-md rounded-full z-20">
                                    {images.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={(e) => { e.stopPropagation(); setActiveIndex(i); }}
                                            className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-200 gap-3 group-hover/thumb:text-red-100 transition-colors">
                         <Briefcase size={48} strokeWidth={1} />
                         {/* Status Overlay Badge (Placeholder version) */}
                         <div className="absolute top-3 left-3 z-10">
                            <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-600 text-white shadow-lg">
                                <ShieldCheck size={10} /> Active
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2 gap-4">
                    <h3 className="text-lg font-black text-gray-900 line-clamp-1 group-hover:text-red-600 transition-colors">
                        {project.title}
                    </h3>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 px-2 py-0.5 rounded border border-gray-100 shrink-0">
                        {project.status.replace('_', ' ')}
                    </span>
                </div>
                
                <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4 font-bold">
                    <span className="flex items-center gap-1.5 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-100">
                        <Briefcase size={14} className="text-zinc-400" /> 
                        {project.type}
                    </span>
                    <span className="flex items-center gap-1.5 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-100">
                        <MapPin size={14} className="text-zinc-400" /> 
                        {project.location?.split(',')[0]}
                    </span>
                </div>

                <p className="text-sm text-gray-600 line-clamp-2 mb-4 font-medium leading-relaxed">
                    {project.description}
                </p>

                {/* Milestone Progress Bar */}
                {project.milestones && project.milestones.length > 0 && (
                    <div className="mb-6 space-y-2 group/progress">
                        <div className="flex justify-between items-center text-[9px] uppercase tracking-[0.2em] font-black">
                            <span className="text-gray-400 group-hover/progress:text-gray-600 transition-colors">Progress</span>
                            <span className={Math.round((project.milestones.filter(m => m.is_completed).length / project.milestones.length) * 100) === 100 ? 'text-emerald-600' : 'text-[#FF2D20]'}>
                                {project.milestones.filter(m => m.is_completed).length}/{project.milestones.length}
                            </span>
                        </div>
                        <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden shadow-inner border border-gray-50/50">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.round((project.milestones.filter(m => m.is_completed).length / project.milestones.length) * 100)}%` }}
                                transition={{ duration: 1, ease: "circOut" }}
                                className={`h-full rounded-full ${Math.round((project.milestones.filter(m => m.is_completed).length / project.milestones.length) * 100) === 100 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-[#FF2D20]'}`}
                            />
                        </div>
                    </div>
                )}

                <div className="mt-auto pt-6 border-t border-gray-50 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-0.5">Budget</p>
                        <p className="text-lg font-black text-gray-900">{formatCurrency(project.budget)}</p>
                    </div>
                    
                    <button 
                        onClick={() => onViewProject(project)}
                        className="bg-gray-900 text-white p-3 rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-black/10 hover:shadow-red-500/20 group/btn"
                    >
                        <ArrowRight size={20} className="group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

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
                <div className="w-20 h-20 bg-zinc-50 text-zinc-400 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Briefcase size={32} strokeWidth={1.5} />
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
                <ProfessionalProjectCard 
                    key={project.id} 
                    project={project} 
                    onViewProject={onViewProject} 
                    formatCurrency={formatCurrency} 
                />
            ))}
        </div>
    );
}
