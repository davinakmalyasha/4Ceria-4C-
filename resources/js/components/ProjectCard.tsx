import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin, ExternalLink } from 'lucide-react';
import { Project } from '../types/project.types';

interface ProjectCardProps {
    project: Project;
    onClick: (project: Project) => void;
}

export default function ProjectCard({ project, onClick }: ProjectCardProps) {
    const getImageUrl = (path: string | null) => {
        if (!path) return 'https://images.unsplash.com/photo-1541888946425-d81bb19480c5?q=80&w=2070&auto=format&fit=crop';
        if (path.startsWith('http')) return path;
        return `/storage/${path}`;
    };

    const primaryImage = project.images?.[0]?.image_path || null;
    const date = project.created_at ? new Date(project.created_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : 'Recent';

    return (
        <motion.div 
            whileHover={{ y: -8 }}
            onClick={() => onClick(project)}
            className="group relative h-[300px] bg-zinc-100 rounded-[32px] overflow-hidden cursor-pointer shadow-sm hover:shadow-2xl hover:shadow-red-500/10 transition-all duration-500"
        >
            <img 
                src={getImageUrl(primaryImage)} 
                alt={project.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
            
            {/* Glassmorphism Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
            
            <div className="absolute inset-x-0 bottom-0 p-8 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                <div className="flex items-center gap-2 mb-3">
                    <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase tracking-widest border border-white/20">
                        {project.status === 'completed' ? 'Success' : 'Active'}
                    </span>
                    <div className="flex items-center gap-1.5 text-zinc-300 text-[10px] font-bold uppercase tracking-widest">
                        <Calendar size={12} className="text-red-500" />
                        {date}
                    </div>
                </div>
                
                <h4 className="text-xl font-black text-white mb-2 leading-tight group-hover:text-red-400 transition-colors">
                    {project.title}
                </h4>
                
                <div className="flex items-center justify-between mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                        <MapPin size={14} />
                        {project.lokasi || 'Proyek Exhibition'}
                    </div>
                    <div className="w-10 h-10 bg-white/10 backdrop-blur-lg rounded-2xl flex items-center justify-center text-white border border-white/20 group-hover:bg-red-600 group-hover:border-red-500 transition-all">
                        <ExternalLink size={18} />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
