import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, MapPin, Calendar, ArrowRight, Shield, Pencil, Hammer, Package, Armchair, KeyRound } from 'lucide-react';
import { PHASE_CONFIG, PhaseKey } from '../../types/phase.types';

const ICON_MAP: Record<string, React.ElementType> = {
    Shield, Pencil, Hammer, Package, Sofa: Armchair, Key: KeyRound,
};

interface ProjectPreviewModalProps {
    project: any;
    isOpen: boolean;
    onClose: () => void;
    onManage: () => void;
}

export default function ProjectPreviewModal({ project, isOpen, onClose, onManage }: ProjectPreviewModalProps) {
    if (!project) return null;
    const phases: PhaseKey[] = project.needed_phases || ['design', 'build'];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-x-4 top-[15%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-md bg-white rounded-3xl shadow-2xl z-[201] overflow-hidden"
                    >
                        <div className="p-6">
                            <div className="flex items-start justify-between mb-4">
                                <h2 className="text-lg font-black text-gray-900 leading-tight pr-4">{project.title}</h2>
                                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
                            </div>

                            <div className="flex flex-wrap gap-3 mb-5">
                                <MetaBadge icon={DollarSign} text={`Rp ${Number(project.budget || 0).toLocaleString('id-ID')}`} color="emerald" />
                                <MetaBadge icon={MapPin} text={project.city || project.lokasi || '-'} color="red" />
                                {project.deadline && <MetaBadge icon={Calendar} text={new Date(project.deadline).toLocaleDateString('id-ID')} color="blue" />}
                            </div>

                            {project.description && (
                                <p className="text-xs text-gray-400 leading-relaxed mb-5 line-clamp-3">{project.description}</p>
                            )}

                            <div className="mb-6">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Phases</p>
                                <div className="flex flex-wrap gap-2">
                                    {phases.map(key => {
                                        const cfg = PHASE_CONFIG[key];
                                        if (!cfg) return null;
                                        const Icon = ICON_MAP[cfg.icon] || Shield;
                                        return (
                                            <span key={key} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 text-xs font-semibold text-gray-600">
                                                <Icon size={12} /> {cfg.label}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            <button
                                onClick={onManage}
                                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:bg-black transition-all active:scale-[0.98] shadow-lg shadow-black/10"
                            >
                                Manage Project <ArrowRight size={16} />
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function MetaBadge({ icon: Icon, text, color }: { icon: React.ElementType; text: string; color: string }) {
    const colorMap: Record<string, string> = {
        emerald: 'text-emerald-600 bg-emerald-50',
        red: 'text-red-500 bg-red-50',
        blue: 'text-blue-600 bg-blue-50',
    };
    return (
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${colorMap[color] || 'text-gray-500 bg-gray-50'}`}>
            <Icon size={11} /> {text}
        </span>
    );
}
