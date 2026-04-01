import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Calendar, Clock, MessageSquare, Briefcase, Eye, Wallet, MoreHorizontal, Edit2, Copy, Share2, Trash2 } from 'lucide-react';
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
    
    const statusCfg = getStatusConfig(project.status);
    const StatusIcon = statusCfg.icon;
    const typeCfg = getProjectTypeConfig(project.type);
    const TypeIcon = typeCfg.icon;
    
    const bidCount = (project.bids_arsitek_count || 0) + (project.bids_kontraktor_count || 0);

    // Calc days remaining or if overdue
    const deadlineRender = () => {
        if (!project.deadline) return null;
        const d = new Date(project.deadline);
        const days = Math.ceil((d.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        const color = days < 0 ? 'text-rose-600 bg-rose-50' : (days <= 7 ? 'text-amber-600 bg-amber-50' : 'text-emerald-700 bg-emerald-50');
        const text = days < 0 ? 'Overdue' : (days === 0 ? 'Due Today' : `${days} days left`);
        return (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${color}`}>
                <Calendar size={13} /> <span>{text}</span>
            </div>
        );
    };

    const isList = viewMode === 'list';

    return (
        <motion.div 
            whileHover={{ y: -4 }}
            onClick={() => onClick(project.id)}
            className={`group relative bg-white rounded-[1.5rem] p-4 lg:p-5 flex gap-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 hover:border-[#FF2D20]/40 hover:shadow-[0_20px_40px_rgb(255,45,32,0.06)] transition-all duration-300 cursor-pointer overflow-visible ${
                isList ? 'flex-col lg:flex-row w-full items-center' : 'flex-col'
            }`}
        >
            {/* Status vertical accent line */}
            <div className={`absolute left-0 top-0 ${isList ? 'bottom-0 w-1 rounded-l-[1.5rem]' : 'right-0 h-1 rounded-t-[1.5rem]'} ${statusCfg.bg} opacity-50 group-hover:opacity-100 transition-opacity`} />

            {/* Thumbnail Area */}
            <div className={`shrink-0 relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 ${
                isList ? 'w-full lg:w-48 h-48 lg:h-40 rounded-[1rem]' : 'w-full h-48 sm:h-56 rounded-xl'
            }`}>
                {project.images && project.images.length > 0 ? (
                    <img src={project.images[0].url} alt={project.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-3 group-hover:text-[#FF2D20]/30 transition-colors">
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
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-900/80 text-white backdrop-blur-md shadow-md w-fit">
                        <TypeIcon size={12} /> {typeCfg.label}
                    </span>
                </div>
            </div>

            {/* Content Area */}
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
                                <h3 className={`font-bold text-gray-900 leading-tight group-hover:text-[#FF2D20] transition-colors break-words ${isList ? 'text-lg line-clamp-1' : 'text-xl line-clamp-2'}`}>{project.title}</h3>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1 sm:mt-0">
                                {project.target_role && project.target_role !== 'both' && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-extrabold uppercase border border-purple-100 shrink-0">
                                        <Briefcase size={10} /> {project.target_role === 'arsitek' ? 'Arch Only' : 'Cont Only'}
                                    </span>
                                )}
                            </div>
                        </div>
                        <p className={`text-sm text-gray-500 leading-relaxed md:pr-4 break-words mt-2 ${isList ? 'line-clamp-2 md:line-clamp-1' : 'line-clamp-2'}`}>{project.description}</p>
                    </div>
                    {/* Budget Section right aligned */}
                    <div className={`text-right shrink-0 bg-emerald-50/40 rounded-2xl border border-emerald-100/50 group-hover:bg-emerald-50 group-hover:border-emerald-200 transition-colors hidden sm:block p-3 ${isList ? 'w-auto' : 'w-auto min-w-[140px]'}`}>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Est. Budget</p>
                        <p className={`text-lg lg:text-xl font-black text-emerald-600 tabular-nums tracking-tight truncate max-w-[160px] md:max-w-full`}>{formatCurrency(project.budget)}</p>
                    </div>
                </div>

                {/* Mobile Budget */}
                <div className="flex sm:hidden items-center justify-between bg-gray-50 p-3 rounded-xl mb-4 border border-gray-100 mt-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Wallet size={14} /> Budget</span>
                    <span className="text-lg font-black text-emerald-600">{formatCurrency(project.budget)}</span>
                </div>

                <div className={`flex flex-wrap items-center gap-3 mt-auto ${isList ? 'pt-3 lg:pt-1' : 'pt-4'}`}>
                    {project.location && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200/50 h-fit">
                            <MapPin size={13} className="text-[#FF2D20]" /> <span className="truncate max-w-[150px]">{project.location}</span>
                        </div>
                    )}
                    {deadlineRender()}
                </div>

                {/* Footer Row */}
                <div className={`mt-4 pt-4 border-t border-gray-100/80 flex flex-wrap gap-4 items-center justify-between`}>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-gray-400">
                        {project.created_at && !isList && (
                            <div className="flex items-center gap-1.5"><Clock size={14} /> {new Date(project.created_at).toLocaleDateString()}</div>
                        )}
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors ${bidCount > 0 ? (userRole === 'user' ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' : 'bg-gray-50 text-gray-700 border-gray-200') : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                            <MessageSquare size={14} /> {bidCount > 0 ? `${bidCount} Bid${bidCount > 1 ? 's' : ''}` : 'No bids yet'}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {userRole === 'user' && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); onEdit?.(project); }} className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors bg-white shadow-sm flex-1 sm:flex-none flex justify-center">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); onDelete?.(project); }} className="p-2.5 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors bg-white shadow-sm flex-1 sm:flex-none flex justify-center">
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                        <button 
                            className={`flex justify-center flex-1 sm:flex-none items-center gap-2 bg-gray-900 group-hover:bg-[#FF2D20] text-white rounded-xl font-bold transition-all shadow-md group-hover:shadow-[0_4px_14px_0_rgba(255,45,32,0.2)] px-5 py-2.5 text-sm`}
                        >
                            <Eye size={16} /> View
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
