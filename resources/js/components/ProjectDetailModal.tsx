import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Calendar, Layout, Info } from 'lucide-react';
import { Project } from '../types/project.types';

interface ProjectDetailModalProps {
    project: Project;
    onClose: () => void;
}

export default function ProjectDetailModal({ project, onClose }: ProjectDetailModalProps) {
    const getImageUrl = (path: string | null) => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        return `/storage/${path}`;
    };

    const date = project.created_at ? new Date(project.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Unknown';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-5xl bg-white rounded-[40px] overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]"
            >
                {/* Image Gallery Side */}
                <div className="md:w-3/5 bg-zinc-100 overflow-y-auto custom-scrollbar p-6">
                    <div className="grid grid-cols-1 gap-4">
                        {project.images && project.images.length > 0 ? (
                            project.images.map((img: any, idx: number) => (
                                <div key={idx} className="rounded-3xl overflow-hidden shadow-sm">
                                    <img 
                                        src={getImageUrl(img.image_path)!} 
                                        alt={`${project.title} - ${idx + 1}`}
                                        className="w-full h-auto object-cover"
                                    />
                                </div>
                            ))
                        ) : (
                            <div className="h-[400px] flex items-center justify-center text-zinc-400">
                                <Layout size={48} className="mb-4 opacity-20" />
                                <p>No specific photos for this project.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Side */}
                <div className="md:w-2/5 p-10 md:p-12 overflow-y-auto bg-white border-l border-zinc-100">
                    <button 
                        onClick={onClose}
                        className="absolute top-8 right-8 w-12 h-12 bg-zinc-100 hover:bg-zinc-200 rounded-2xl flex items-center justify-center text-zinc-600 transition-colors"
                    >
                        <X size={24} />
                    </button>

                    <div className="space-y-8">
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <span className="px-4 py-1.5 bg-red-50 text-red-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-red-100">
                                    Project Detail
                                </span>
                            </div>
                            <h2 className="text-4xl font-black text-zinc-900 leading-tight mb-4">
                                {project.title}
                            </h2>
                            <div className="flex flex-wrap gap-4 text-sm font-medium text-zinc-500">
                                <div className="flex items-center gap-2">
                                    <Calendar size={16} className="text-red-500" />
                                    {date}
                                </div>
                                <div className="flex items-center gap-2">
                                    <MapPin size={16} className="text-red-500" />
                                    {project.lokasi || 'Multiple Locations'}
                                </div>
                            </div>
                        </div>

                        <div className="h-px bg-zinc-100 w-full" />

                        <section>
                            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Info size={14} /> Description
                            </h3>
                            <p className="text-zinc-600 leading-relaxed text-lg font-medium">
                                {project.description || 'A complete project demonstrating professional craftmanship and attention to detail.'}
                            </p>
                        </section>

                        <div className="bg-zinc-50 rounded-3xl p-8 border border-zinc-100">
                            <h4 className="text-xs font-black text-zinc-900 uppercase tracking-widest mb-6 border-b border-zinc-200 pb-4">
                                Technical Specs
                            </h4>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <span className="text-zinc-500">Service Type</span>
                                    <span className="text-zinc-900 font-bold capitalize">{project.target_role || 'General'}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <span className="text-zinc-500">Category</span>
                                    <span className="text-zinc-900 font-bold capitalize">{project.jenis_proyek || 'Standard'}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <span className="text-zinc-500">Status</span>
                                    <span className="text-emerald-600 font-black uppercase text-[10px] tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                                        {project.status || 'Completed'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
