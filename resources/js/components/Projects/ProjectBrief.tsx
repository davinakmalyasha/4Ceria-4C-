import React from 'react';
import { motion } from 'framer-motion';
import { 
    DollarSign, MapPin, Calendar, Info, Users, 
    ArrowUpRight, Shield, Pencil, Hammer, Package, Sofa, KeyRound,
    CheckCircle2, Clock, LogOut
} from 'lucide-react';
import ProjectLocationMap from './ProjectLocationMap';
import { PHASE_CONFIG, PHASE_ROLE_MAP, PhaseKey, getCategoryPhaseLabel } from '../../types/phase.types';
import axios from 'axios';
import { useToast } from '../../context/ToastContext';
import LifecycleActionModal from './Details/LifecycleActionModal';
import RatingModal from './RatingModal';
import OwnerSpecialistAlert from './OwnerSpecialistAlert';
import { Star } from 'lucide-react';

interface ProjectBriefProps {
    project: any;
    user: any;
    onRefresh: () => void;
    onSwitchToProcess: (phase: PhaseKey) => void;
    onSwitchTab?: (tab: string) => void;
    onOpenChat?: () => void;
}

const ICON_MAP: Record<string, any> = {
    Shield, Pencil, Hammer, Package, Sofa, Key: KeyRound
};

export default function ProjectBrief({ project, user, onRefresh, onSwitchToProcess }: ProjectBriefProps) {
    const { showToast } = useToast();
    const [terminationModal, setTerminationModal] = React.useState<{
        isOpen: boolean;
        type: 'fire' | 'resign';
        roleType: string;
        roleLabel: string;
        proName: string;
    }>({
        isOpen: false,
        type: 'fire',
        roleType: '',
        roleLabel: '',
    });

    const [ratingModal, setRatingModal] = React.useState<{
        isOpen: boolean;
        roleType: any;
        proName: string;
    }>({
        isOpen: false,
        roleType: 'arsitek',
        proName: ''
    });

    if (!project) return null;

    const isOwner = user?.id === project.user_id;

    const handleTerminate = async (reason: string) => {
        try {
            const endpoint = terminationModal.type === 'fire' ? 'terminate' : 'resign';
            const payload = terminationModal.type === 'fire' 
                ? { role_type: terminationModal.roleType, reason }
                : { reason };

            await axios.post(`/projects/${project.id}/${endpoint}`, payload);
            
            showToast(
                terminationModal.type === 'fire' 
                    ? `Kontrak ${terminationModal.roleLabel} berhasil diputus.` 
                    : 'Anda berhasil mengundurkan diri dari proyek.',
                'success'
            );
            
            const wasFired = terminationModal.type === 'fire';
            const firedRole = terminationModal.roleType;
            const firedName = terminationModal.proName;

            setTerminationModal(prev => ({ ...prev, isOpen: false }));
            onRefresh();

            // R7: Immediately trigger rating modal if owner fired someone
            if (isOwner && wasFired) {
                setRatingModal({
                    isOpen: true,
                    roleType: firedRole,
                    proName: firedName
                });
            }
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Gagal memproses permintaan.', 'error');
            throw error;
        }
    };

    const stats = [
        { icon: DollarSign, label: 'Budget', value: `Rp ${Number(project.budget || 0).toLocaleString('id-ID')}`, color: 'emerald' },
        { icon: MapPin, label: 'Location', value: project.city || project.lokasi || 'Unknown', color: 'red' },
        { icon: Calendar, label: 'Target Date', value: project.deadline ? new Date(project.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'ASAP', color: 'blue' },
    ];

    const allTeamPhases: PhaseKey[] = ['legal', 'design', 'build', 'materials', 'interior'];
    const teamPhases = allTeamPhases.filter(k => 
        (project?.needed_phases || []).includes(k)
    );

    const recommendedBids = [
        ...(project.bids_structural || []).filter((b: any) => b.is_recommended && !['contract_pending', 'accepted'].includes(b.status)).map((b: any) => ({ ...b, bid_type: 'structural' as const })),
        ...(project.bids_mep || []).filter((b: any) => b.is_recommended && !['contract_pending', 'accepted'].includes(b.status)).map((b: any) => ({ ...b, bid_type: 'mep' as const })),
    ];

    return (
        <div className="space-y-8 pb-12">
            {/* Owner: Architect Specialist Recommendations */}
            {isOwner && recommendedBids.length > 0 && (
                <OwnerSpecialistAlert
                    projectId={project.id}
                    projectBudget={project.budget}
                    bids={recommendedBids}
                    onRefresh={onRefresh}
                />
            )}

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

                                    const isHiredPro = user?.role_type === cfg.roleNeeded && 
                                                      (hiredPro?.user_id === user?.id || hiredPro?.user?.id === user?.id);

                                    return (
                                        <div key={key} className="relative group">
                                            <div
                                                onClick={() => onSwitchToProcess(key)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => { if (e.key === 'Enter') onSwitchToProcess(key); }}
                                                className="w-full bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-all hover:translate-x-1 cursor-pointer"
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                                                    <Icon size={18} />
                                                </div>
                                                <div className="flex-1 text-left min-w-0">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">
                                                        {getCategoryPhaseLabel(key, project?.project_category).label}
                                                    </p>
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
                                                
                                                {/* Action Buttons for Lifecycle */}
                                                {hiredPro && (isOwner || isHiredPro) && (
                                                    <div className="flex items-center gap-2 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTerminationModal({
                                                                    isOpen: true,
                                                                    type: isOwner ? 'fire' : 'resign',
                                                                    roleType: cfg.roleNeeded === 'arsitek' ? 'arsitek' : 
                                                                             cfg.roleNeeded === 'kontraktor' ? 'kontraktor' :
                                                                             cfg.roleNeeded === 'interior' ? 'interior' : 
                                                                             cfg.roleNeeded === 'notaris' ? 'notaris' : 'pm',
                                                                    roleLabel: cfg.label,
                                                                    proName: hiredPro.nama || hiredPro.user?.name || 'Professional'
                                                                });
                                                            }}
                                                            title={isOwner ? 'Putus Kontrak' : 'Mengundurkan Diri'}
                                                            className={`p-2 rounded-lg transition-colors ${
                                                                isOwner ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                                            }`}
                                                        >
                                                            {isOwner ? <Shield size={14} /> : <LogOut size={14} />}
                                                        </button>

                                                        {/* Rate button if project is completed */}
                                                        {project.status === 'completed' && isOwner && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setRatingModal({
                                                                        isOpen: true,
                                                                        roleType: cfg.roleNeeded === 'arsitek' ? 'arsitek' : 
                                                                                cfg.roleNeeded === 'kontraktor' ? 'kontraktor' :
                                                                                cfg.roleNeeded === 'interior' ? 'interior' : 
                                                                                cfg.roleNeeded === 'notaris' ? 'notaris' : 'pm',
                                                                        proName: hiredPro.nama || hiredPro.user?.name || 'Professional'
                                                                    });
                                                                }}
                                                                title="Beri Penilaian"
                                                                className="p-2 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                                                            >
                                                                <Star size={14} className="fill-amber-400/20" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                <ArrowUpRight size={14} className="text-gray-600 group-hover:text-white transition-colors shrink-0" />
                                            </div>
                                        </div>
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

            <LifecycleActionModal
                isOpen={terminationModal.isOpen}
                onClose={() => setTerminationModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleTerminate}
                type={terminationModal.type}
                title={terminationModal.type === 'fire' ? 'Putus Kontrak Professional' : 'Undur Diri dari Proyek'}
                description={terminationModal.type === 'fire' 
                    ? `Apakah Anda yakin ingin memutus kontrak dengan ${terminationModal.proName}? Tindakan ini akan membuka kembali bidding untuk peran ini.`
                    : 'Apakah Anda yakin ingin mengundurkan diri? Pastikan Anda telah mengomunikasikan hal ini dengan Project Owner.'
                }
                roleLabel={terminationModal.roleLabel}
                proName={terminationModal.proName}
            />

            {ratingModal.isOpen && (
                <RatingModal 
                    projectId={project.id}
                    projectTitle={project.title}
                    roleType={ratingModal.roleType}
                    professionalName={ratingModal.proName}
                    onClose={() => setRatingModal(prev => ({ ...prev, isOpen: false }))}
                    onRated={() => {
                        setRatingModal(prev => ({ ...prev, isOpen: false }));
                        onRefresh();
                    }}
                />
            )}
        </div>
    );
}
