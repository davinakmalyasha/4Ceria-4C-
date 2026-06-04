import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Calendar, Clock, MessageSquare, Briefcase, Eye, Wallet, MoreHorizontal, Edit2, Copy, Share2, Trash2, ChevronLeft, ChevronRight, CheckCircle, Ruler, Maximize, Layers } from 'lucide-react';
import { Project, getStatusConfig, getProjectTypeConfig, formatCurrency } from '../../types/project.types';

export const ProjectCardSkeleton = () => (
    <div className="bg-white rounded-[1.5rem] overflow-hidden shadow-sm border border-gray-100 flex flex-col md:flex-row animate-pulse p-5 gap-5 h-48">
        <div className="w-full md:w-48 bg-gray-200 rounded-2xl h-full shrink-0" />
        <div className="flex-1 py-2 space-y-4 w-full">
            <div className="w-3/4 h-6 bg-gray-200 rounded-lg" />
            <div className="w-1/2 h-4 bg-gray-200 rounded-lg" />
            <div className="w-full h-12 bg-gray-100 rounded-xl mt-auto" />
        </div>
    </div>
);

interface ProjectCardProps {
    project: Project;
    onClick: (id: number) => void;
    userRole?: string;
    viewMode?: 'grid' | 'list';
    onEdit?: (project: Project) => void;
    onDelete?: (project: Project) => void;
}

export default function ProjectCard({ project, onClick, userRole, viewMode = 'grid', onEdit, onDelete }: ProjectCardProps) {
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    
    const images = project.images || [];

    const dims = React.useMemo(() => {
        if (!project.project_dimensions) return null;
        try {
            return typeof project.project_dimensions === 'string' 
                ? JSON.parse(project.project_dimensions) 
                : project.project_dimensions;
        } catch (e) {
            console.error('Failed to parse project_dimensions', e);
            return null;
        }
    }, [project.project_dimensions]);

    const nextImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveImageIndex(prev => (prev + 1) % images.length);
    };

    const prevImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveImageIndex(prev => (prev - 1 + images.length) % images.length);
    };

    const statusCfg = getStatusConfig(project.status);
    const StatusIcon = statusCfg.icon;
    const typeCfg = getProjectTypeConfig(project.type);
    const TypeIcon = typeCfg.icon;
    
    const bidCount = (project.bids_arsitek_count || 0) + (project.bids_kontraktor_count || 0);

    const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
        new_build: { label: 'Bangun Baru', emoji: '🏠' },
        renovation: { label: 'Renovasi', emoji: '🔨' },
        interior: { label: 'Interior', emoji: '🎨' },
        maintenance: { label: 'Perbaikan', emoji: '🔧' },
    };
    const categoryCfg = project.project_category ? CATEGORY_LABELS[project.project_category] : null;
    
    // Progress calculation
    const milestones = project.milestones || [];
    const completedCount = milestones.filter(m => m.is_completed).length;
    const progressPerc = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

    // Calc days remaining or if overdue
    const deadlineRender = () => {
        if (!project.deadline) return null;
        const d = new Date(project.deadline);
        const days = Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        const color = days <= 7 ? 'text-red-600 bg-red-50' : 'text-zinc-600 bg-zinc-50';
        const text = days < 0 ? 'Overdue' : (days === 0 ? 'Due Today' : `${days} days left`);
        return (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold ${color}`}>
                <Calendar size={13} /> <span>{text}</span>
            </div>
        );
    };

    const isList = viewMode === 'list';

    return (
        <motion.div 
            whileHover={{ y: -4 }}
            onClick={() => onClick(project.id)}
            className={`group relative bg-white rounded-[1.5rem] p-4 lg:p-5 flex gap-5 shadow-sm border border-gray-100 hover:border-red-200 transition-all duration-300 cursor-pointer overflow-visible ${
                isList ? 'flex-col lg:flex-row w-full items-center' : 'flex-col'
            }`}
        >
            {/* Status vertical accent line */}
            <div className={`absolute left-0 top-0 ${isList ? 'bottom-0 w-1 rounded-l-[1.5rem]' : 'right-0 h-1 rounded-t-[1.5rem]'} ${statusCfg.bg} opacity-50 group-hover:opacity-100 transition-opacity`} />

            {/* Thumbnail Area */}
            <div className={`shrink-0 relative overflow-hidden bg-zinc-50 border border-zinc-100 group/thumb ${
                isList ? 'w-full lg:w-48 h-48 lg:h-40 rounded-[1rem]' : 'w-full h-48 sm:h-56 rounded-xl'
            }`}>
                {images.length > 0 ? (
                    <>
                        <AnimatePresence mode="wait">
                            <motion.img 
                                key={activeImageIndex}
                                src={images[activeImageIndex].url} 
                                alt={project.title} 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-700" 
                            />
                        </AnimatePresence>

                        {images.length > 1 && (
                            <>
                                <button 
                                    onClick={prevImage}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 backdrop-blur-md rounded-full shadow-lg opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-white text-zinc-800 z-10"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button 
                                    onClick={nextImage}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 backdrop-blur-md rounded-full shadow-lg opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-white text-zinc-800 z-10"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 px-2.5 py-1.5 bg-black/20 backdrop-blur-md rounded-full z-10">
                                    {images.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={(e) => { e.stopPropagation(); setActiveImageIndex(i); }}
                                            className={`h-1.5 rounded-full transition-all ${i === activeImageIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 gap-3 group-hover/thumb:text-red-200 transition-colors">
                        <TypeIcon size={48} strokeWidth={1.5} />
                    </div>
                )}
                
                {/* Overlay Badges */}
                <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-2 pr-10">
                    {!isList && (
                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md backdrop-blur-md bg-white/95 ${statusCfg.colors}`}>
                            <StatusIcon size={12} /> {statusCfg.label}
                        </span>
                    )}
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-900/80 text-white backdrop-blur-md shadow-md w-fit">
                        <TypeIcon size={12} /> {typeCfg.label}
                    </span>
                    {categoryCfg && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-900/80 text-white backdrop-blur-md shadow-md w-fit">
                            {categoryCfg.label}
                        </span>
                    )}
                    {project.has_submitted_bid && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight bg-emerald-500 text-white shadow-lg border-2 border-white/20 backdrop-blur-sm">
                            <CheckCircle size={10} /> Proposal Submitted
                        </span>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-w-0 py-1 justify-center w-full">
                <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0 flex-1 w-full">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1 pr-6 relative">
                            <div className="flex items-center gap-2">
                                {isList && (
                                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusCfg.colors} bg-white h-fit`}>
                                        <StatusIcon size={10} /> {statusCfg.label}
                                    </span>
                                )}
                                <h3 className={`font-bold text-zinc-900 leading-tight group-hover:text-red-600 transition-colors break-words ${isList ? 'text-lg line-clamp-1' : 'text-xl line-clamp-2'}`}>{project.title}</h3>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1 sm:mt-0">
                                {project.target_role && project.target_role !== 'both' && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-50 text-zinc-600 text-[10px] font-extrabold uppercase border border-zinc-100 shrink-0">
                                        <Briefcase size={10} /> {project.target_role === 'arsitek' ? 'Arch Only' : 'Cont Only'}
                                    </span>
                                )}
                            </div>
                        </div>
                        <p className={`text-sm text-zinc-500 leading-relaxed md:pr-4 break-words mt-2 ${isList ? 'line-clamp-2 md:line-clamp-1' : 'line-clamp-2'}`}>{project.description}</p>
                        
                        {/* Project Specifications Summary Row */}
                        {dims && (
                            <div className="flex flex-wrap gap-x-2 gap-y-1.5 mt-3 text-[10px] text-zinc-500 font-bold border-t border-dashed border-zinc-200/60 pt-2.5">
                                {project.project_category === 'new_build' && (
                                    <>
                                        {dims.land_size ? (
                                            <span className="flex items-center gap-1 bg-blue-50/70 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-100/50">
                                                <Maximize size={11} className="text-blue-500 shrink-0" />
                                                <span>Tanah: {dims.land_size} m² {dims.land_length && dims.land_width && `(${dims.land_length}x${dims.land_width}m)`}</span>
                                            </span>
                                        ) : null}
                                        {dims.building_size ? (
                                            <span className="flex items-center gap-1 bg-indigo-50/70 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100/50">
                                                <Ruler size={11} className="text-indigo-500 shrink-0" />
                                                <span>Bangunan: {dims.building_size} m² {dims.building_length && dims.building_width && `(${dims.building_length}x${dims.building_width}m)`}</span>
                                            </span>
                                        ) : null}
                                        {dims.floors ? (
                                            <span className="flex items-center gap-1 bg-slate-50 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-100">
                                                <Layers size={11} className="text-slate-500 shrink-0" />
                                                <span>{dims.floors} Lantai</span>
                                            </span>
                                        ) : null}
                                    </>
                                )}
                                {project.project_category === 'renovation' && (
                                    <>
                                        {dims.renovation_area ? (
                                            <span className="flex items-center gap-1 bg-amber-50/70 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-100/50">
                                                <Maximize size={11} className="text-amber-500 shrink-0" />
                                                <span>Renovasi: {dims.renovation_area} m² {dims.renovation_length && dims.renovation_width && `(${dims.renovation_length}x${dims.renovation_width}m)`}</span>
                                            </span>
                                        ) : null}
                                        {Array.isArray(dims.scope_tags) && dims.scope_tags.length > 0 ? (
                                            <span className="flex items-center gap-1 bg-slate-50 text-slate-600 px-2 py-0.5 rounded-lg border border-slate-150 max-w-[200px] truncate" title={dims.scope_tags.join(', ')}>
                                                <span>Scope: {dims.scope_tags.join(', ')}</span>
                                            </span>
                                        ) : null}
                                    </>
                                )}
                                {project.project_category === 'interior' && (
                                    <>
                                        {dims.area_size ? (
                                            <span className="flex items-center gap-1 bg-purple-50/70 text-purple-700 px-2 py-0.5 rounded-lg border border-purple-100/50">
                                                <Maximize size={11} className="text-purple-500 shrink-0" />
                                                <span>Area: {dims.area_size} m² {dims.area_length && dims.area_width && `(${dims.area_length}x${dims.area_width}m)`}</span>
                                            </span>
                                        ) : null}
                                        {dims.room_count ? (
                                            <span className="flex items-center gap-1 bg-slate-50 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-100">
                                                <Layers size={11} className="text-slate-500 shrink-0" />
                                                <span>{dims.room_count} Ruangan</span>
                                            </span>
                                        ) : null}
                                    </>
                                )}
                            </div>
                        )}
                        
                        {/* Milestone Progress Bar */}
                        {milestones.length > 0 && (
                            <div className="mt-4 space-y-1.5">
                                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-black">
                                    <span className="text-zinc-400">Project Progress</span>
                                    <span className={progressPerc === 100 ? 'text-emerald-600' : 'text-[#FF2D20]'}>
                                        {completedCount}/{milestones.length} Milestones • {progressPerc}%
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden border border-zinc-50 shadow-inner">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progressPerc}%` }}
                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                        className={`h-full rounded-full ${progressPerc === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#FF2D20] to-red-500'}`}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Budget Section right aligned */}
                    <div className={`text-right shrink-0 bg-zinc-50 rounded-2xl border border-zinc-100/50 group-hover:bg-zinc-100 group-hover:border-zinc-200 transition-colors hidden sm:block p-3 ${isList ? 'w-auto' : 'w-auto min-w-[140px]'}`}>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Est. Budget</p>
                        <p className={`text-lg lg:text-xl font-black text-zinc-900 tabular-nums tracking-tight truncate max-w-[160px] md:max-w-full`}>{formatCurrency(project.budget)}</p>
                    </div>
                </div>

                {/* Mobile Budget */}
                <div className="flex sm:hidden items-center justify-between bg-zinc-50 p-3 rounded-xl mb-4 border border-zinc-100 mt-2">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2"><Wallet size={14} /> Budget</span>
                    <span className="text-lg font-black text-zinc-900">{formatCurrency(project.budget)}</span>
                </div>

                <div className={`flex flex-wrap items-center gap-3 mt-auto ${isList ? 'pt-3 lg:pt-1' : 'pt-4'}`}>
                    {project.location && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-100 h-fit">
                            <MapPin size={13} className="text-red-600" /> <span className="truncate max-w-[150px]">{project.location}</span>
                        </div>
                    )}
                    {deadlineRender()}
                </div>

                {/* Footer Row */}
                <div className={`mt-4 pt-4 border-t border-zinc-100 flex flex-wrap gap-4 items-center justify-between`}>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-zinc-400">
                        {project.created_at && !isList && (
                            <div className="flex items-center gap-1.5"><Clock size={14} /> {new Date(project.created_at).toLocaleDateString()}</div>
                        )}
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors ${bidCount > 0 ? 'bg-red-50 text-red-600 border-red-100 font-bold' : 'bg-zinc-50 text-zinc-400 border-zinc-100'}`}>
                            <MessageSquare size={14} /> {bidCount > 0 ? `${bidCount} Bid${bidCount > 1 ? 's' : ''}` : 'No bids yet'}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {userRole === 'user' && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); onEdit?.(project); }} className="p-2.5 rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition-colors bg-white shadow-sm flex-1 sm:flex-none flex justify-center">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); onDelete?.(project); }} className="p-2.5 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors bg-white shadow-sm flex-1 sm:flex-none flex justify-center">
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                        <button 
                            className={`flex justify-center flex-1 sm:flex-none items-center gap-2 bg-zinc-900 group-hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-md px-5 py-2.5 text-sm`}
                        >
                            <Eye size={16} /> View
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
