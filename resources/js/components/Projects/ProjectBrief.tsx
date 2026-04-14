import React from 'react';
import { motion } from 'framer-motion';
import { 
    DollarSign, MapPin, Calendar, Info, Users, 
    ArrowUpRight, Shield, Pencil, Hammer, Package, Sofa, KeyRound,
    CheckCircle2, Clock
} from 'lucide-react';
import ProjectLocationMap from './ProjectLocationMap';
import { PHASE_CONFIG, PHASE_ROLE_MAP, PhaseKey } from '../../types/phase.types';

interface ProjectBriefProps {
    project: any;
    onSwitchToProcess: (phase: PhaseKey) => void;
}

const ICON_MAP: Record<string, any> = {
    Shield, Pencil, Hammer, Package, Sofa, Key: KeyRound
};

export default function ProjectBrief({ project, onSwitchToProcess }: ProjectBriefProps) {
    if (!project) return null;

    const stats = [
        { icon: DollarSign, label: 'Budget', value: `Rp ${Number(project.budget || 0).toLocaleString('id-ID')}`, color: 'emerald' },
        { icon: MapPin, label: 'Location', value: project.city || project.lokasi || 'Unknown', color: 'red' },
        { icon: Calendar, label: 'Target Date', value: project.deadline ? new Date(project.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'ASAP', color: 'blue' },
    ];

    const teamPhases: PhaseKey[] = ['legal', 'design', 'build', 'materials', 'interior'];

    return (
        <div className="space-y-8 pb-12">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.map((stat, idx) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4"
                    >
                        <div className={`p-3 rounded-xl ${
                            stat.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                            stat.color === 'red' ? 'bg-red-50 text-red-600' :
                            'bg-blue-50 text-blue-600'
                        }`}>
                            <stat.icon size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-sm font-black text-gray-900 mt-0.5">{stat.value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Brief & Gallery */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Description */}
                    <section className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-1.5 h-6 bg-red-500 rounded-full" />
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Project Information</h3>
                        </div>
                        <p className="text-gray-500 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                            {project.description || 'No detailed description provided for this project.'}
                        </p>
                    </section>

                    {/* Gallery */}
                    {project.images && project.images.length > 0 && (
                        <section className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    Project Gallery <span className="text-gray-300">({project.images.length})</span>
                                </h3>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {project.images.map((img: any, idx: number) => (
                                    <motion.div
                                        key={img.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="aspect-[4/3] rounded-2xl overflow-hidden border border-gray-100 group relative cursor-pointer"
                                    >
                                        <img src={img.url} alt="Project" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                    </motion.div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* Right Column: Team Status & Map */}
                <div className="space-y-8">
                    {/* The Team Grid */}
                    <section className="bg-gray-900 rounded-[2.5rem] p-7 shadow-2xl relative overflow-hidden">
                        {/* Decorative background element */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-[60px] rounded-full translate-x-12 -translate-y-12" />
                        
                        <div className="relative z-10 space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-black text-white tracking-widest uppercase">The Team</h3>
                                <Users size={16} className="text-gray-500" />
                            </div>

                            <div className="space-y-3">
                                {teamPhases.map(key => {
                                    const cfg = PHASE_CONFIG[key];
                                    const roleInfo = PHASE_ROLE_MAP[key];
                                    const hiredPro = roleInfo?.profileKey ? project[roleInfo.profileKey] : null;
                                    const bidCount = project[`${roleInfo?.bidKey}_count`] || 0;
                                    const Icon = ICON_MAP[cfg.icon] || Shield;

                                    return (
                                        <button
                                            key={key}
                                            onClick={() => onSwitchToProcess(key)}
                                            className="w-full group bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-all hover:translate-x-1"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                                                <Icon size={18} />
                                            </div>
                                            <div className="flex-1 text-left min-w-0">
                                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">{cfg.label}</p>
                                                {hiredPro ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <CheckCircle2 size={10} className="text-emerald-400" />
                                                        <p className="text-xs font-bold text-white truncate">{hiredPro.nama || hiredPro.user?.name || 'Assigned'}</p>
                                                    </div>
                                                ) : bidCount > 0 ? (
                                                    <p className="text-xs font-bold text-amber-400">{bidCount} Proposals Sent</p>
                                                ) : (
                                                    <p className="text-xs font-bold text-gray-400">Searching...</p>
                                                )}
                                            </div>
                                            <ArrowUpRight size={14} className="text-gray-600 group-hover:text-white transition-colors shrink-0" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* Location Map Summary */}
                    {(project.latitude && project.longitude) && (
                        <section className="bg-white rounded-[2rem] p-1 border border-gray-100 shadow-sm overflow-hidden">
                            <ProjectLocationMap 
                                latitude={project.latitude} 
                                longitude={project.longitude} 
                                title={project.title} 
                            />
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
