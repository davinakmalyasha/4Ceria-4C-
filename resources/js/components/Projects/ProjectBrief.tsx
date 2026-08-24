import React from 'react';
import { motion } from 'framer-motion';
import { 
    DollarSign, MapPin, Calendar, Info, Users, 
    ArrowUpRight, Shield, Pencil, Hammer, Package, Sofa, KeyRound,
    CheckCircle2, Clock, LogOut, Ruler, Maximize, Layers
} from 'lucide-react';
import ProjectLocationMap from './ProjectLocationMap';
import { PHASE_CONFIG, PHASE_ROLE_MAP, PhaseKey, getCategoryPhaseLabel } from '../../types/phase.types';
import axios from 'axios';
import { useToast } from '../../context/ToastContext';
import LifecycleActionModal from './Details/LifecycleActionModal';
import RatingModal from './RatingModal';
import OwnerSpecialistAlert from './OwnerSpecialistAlert';
import { Star } from 'lucide-react';
import ClientContactCard from './Details/ClientContactCard';

interface ProjectBriefProps {
    project: any;
    user: any;
    onRefresh: () => void;
    onSwitchToProcess: (phase: PhaseKey) => void;
    onSwitchTab?: (tab: string) => void;
    onOpenChat?: (user: any) => void;
}

const ICON_MAP: Record<string, any> = {
    Shield, Pencil, Hammer, Package, Sofa, Key: KeyRound
};

export default function ProjectBrief({ project, user, onRefresh, onSwitchToProcess, onSwitchTab, onOpenChat }: ProjectBriefProps) {
    const { showToast } = useToast();
    const dims = React.useMemo(() => {
        if (!project?.project_dimensions) return null;
        try {
            return typeof project.project_dimensions === 'string' 
                ? JSON.parse(project.project_dimensions) 
                : project.project_dimensions;
        } catch (e) {
            console.error('Failed to parse project_dimensions', e);
            return null;
        }
    }, [project?.project_dimensions]);
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

            {/* Compact Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <DollarSign size={15} />
                    </div>
                    <div className="min-w-0">
                        <span className="text-[9px] text-gray-400 font-bold block uppercase tracking-wide leading-none">Remaining Budget</span>
                        <span className="text-xs font-black text-gray-950 mt-0.5 block">
                            Rp {Number(project?.budget_summary?.remaining ?? project?.budget ?? 0).toLocaleString('id-ID')}
                            <span className="text-[9px] text-gray-400 font-normal ml-1">/ Rp {Number(project?.budget || 0).toLocaleString('id-ID')}</span>
                        </span>
                    </div>
                </div>

                <div className="bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                        <MapPin size={15} />
                    </div>
                    <div className="min-w-0">
                        <span className="text-[9px] text-gray-400 font-bold block uppercase tracking-wide leading-none">Location</span>
                        <span className="text-xs font-black text-gray-955 mt-0.5 block truncate" title={project?.city || project?.lokasi}>
                            {project?.city || project?.lokasi || 'Unknown'}
                        </span>
                    </div>
                </div>

                <div className="bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
                        <Calendar size={15} />
                    </div>
                    <div className="min-w-0">
                        <span className="text-[9px] text-gray-400 font-bold block uppercase tracking-wide leading-none">Target Date</span>
                        <span className="text-xs font-black text-gray-955 mt-0.5 block">
                            {project?.deadline ? new Date(project.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'ASAP'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Top Row: Picture (Left Top) & Map (Right Top) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                {/* Left Top: Project Gallery */}
                <div className="lg:col-span-2">
                    <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                Project Gallery <span className="text-gray-300">({(project.images || []).length})</span>
                            </h3>
                        </div>
                        {project.images && project.images.length > 0 ? (
                            <div className="grid grid-cols-3 gap-3 flex-1">
                                {project.images.slice(0, 3).map((img: any, idx: number) => (
                                    <motion.div
                                        key={img.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="aspect-[4/3] rounded-xl overflow-hidden border border-gray-50 group relative cursor-pointer"
                                    >
                                        <img src={img.url} alt="Project" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center border border-dashed border-gray-100 rounded-2xl flex-1 py-8">
                                <span className="text-xs text-gray-400 font-bold">No project images uploaded</span>
                            </div>
                        )}
                    </section>
                </div>

                {/* Right Top: Map */}
                <div>
                    {(project.latitude && project.longitude) ? (
                        <div className="h-full min-h-[220px]">
                            <ProjectLocationMap 
                                latitude={project.latitude} 
                                longitude={project.longitude} 
                                title={project.title} 
                                showGoToLocationButton={true}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center bg-white border border-gray-100 rounded-[2rem] shadow-sm p-6 h-full min-h-[220px]">
                            <span className="text-xs text-gray-400 font-bold">No map location available</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Row: Brief (Left) & Team (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Bottom Left: Project Information */}
                <div className="lg:col-span-2 space-y-6">
                    <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-1 h-5 bg-red-500 rounded-full" />
                            <h3 className="text-sm font-black text-gray-900 tracking-tight">Project Information</h3>
                        </div>
                        <p className="text-gray-500 text-xs leading-relaxed whitespace-pre-wrap font-medium">
                            {project.description || 'No detailed description provided for this project.'}
                        </p>
                    </section>

                    {/* Project Specifications */}
                    {dims && (
                        <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Ruler size={14} className="text-gray-400" /> Spesifikasi Proyek
                            </h3>
                            
                            {project.project_category === 'new_build' && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Spesifikasi Tanah */}
                                    {dims.land_size ? (
                                        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
                                            <div className="flex items-center gap-2 text-slate-600 font-bold text-xs uppercase tracking-wide">
                                                <Maximize size={14} />
                                                <span>Spesifikasi Tanah</span>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Luas Tanah</p>
                                                <p className="text-lg font-black text-slate-800">{dims.land_size} m²</p>
                                                {dims.land_length && dims.land_width && (
                                                    <p className="text-xs font-semibold text-slate-500">Dimensi: {dims.land_length}m x {dims.land_width}m</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Spesifikasi Bangunan */}
                                    {dims.building_size ? (
                                        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
                                            <div className="flex items-center gap-2 text-slate-600 font-bold text-xs uppercase tracking-wide">
                                                <Ruler size={14} />
                                                <span>Spesifikasi Bangunan</span>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Luas Bangunan</p>
                                                <p className="text-lg font-black text-slate-800">{dims.building_size} m²</p>
                                                {dims.building_length && dims.building_width && (
                                                    <p className="text-xs font-semibold text-slate-500">Dimensi: {dims.building_length}m x {dims.building_width}m</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Jumlah Lantai */}
                                    {dims.floors ? (
                                        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
                                            <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs uppercase tracking-wide">
                                                <Layers size={14} />
                                                <span>Tingkat Bangunan</span>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Jumlah Lantai</p>
                                                <p className="text-lg font-black text-slate-800">{dims.floors} Lantai</p>
                                                <p className="text-xs font-semibold text-slate-500">Struktur Standar</p>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {project.project_category === 'renovation' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Area Renovasi */}
                                    {dims.renovation_area ? (
                                        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
                                            <div className="flex items-center gap-2 text-amber-600 font-bold text-xs uppercase tracking-wide">
                                                <Maximize size={14} />
                                                <span>Area Renovasi</span>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Estimasi Luas Area</p>
                                                <p className="text-lg font-black text-slate-800">{dims.renovation_area} m²</p>
                                                {dims.renovation_length && dims.renovation_width && (
                                                    <p className="text-xs font-semibold text-slate-500">Dimensi: {dims.renovation_length}m x {dims.renovation_width}m</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Bagian yang Direnovasi */}
                                    {Array.isArray(dims.scope_tags) && dims.scope_tags.length > 0 ? (
                                        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-3">
                                            <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs uppercase tracking-wide">
                                                <Layers size={14} />
                                                <span>Bagian Direnovasi</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {dims.scope_tags.map((tag: string) => (
                                                    <span key={tag} className="px-2.5 py-1 rounded-lg bg-amber-100/50 border border-amber-200/50 text-[10px] font-bold text-amber-800 uppercase tracking-wide">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {project.project_category === 'interior' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Area Interior */}
                                    {dims.area_size ? (
                                        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
                                            <div className="flex items-center gap-2 text-purple-600 font-bold text-xs uppercase tracking-wide">
                                                <Maximize size={14} />
                                                <span>Dimensi Ruangan</span>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Estimasi Luas Ruangan</p>
                                                <p className="text-lg font-black text-slate-800">{dims.area_size} m²</p>
                                                {dims.area_length && dims.area_width && (
                                                    <p className="text-xs font-semibold text-slate-500">Dimensi: {dims.area_length}m x {dims.area_width}m</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Jumlah Ruangan */}
                                    {dims.room_count ? (
                                        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
                                            <div className="flex items-center gap-2 text-zinc-600 font-bold text-xs uppercase tracking-wide">
                                                <Layers size={14} />
                                                <span>Kapasitas Interior</span>
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Jumlah Ruangan</p>
                                                <p className="text-lg font-black text-slate-800">{dims.room_count} Ruangan</p>
                                                <p className="text-xs font-semibold text-slate-500">Desain Komprehensif</p>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {project.project_category === 'maintenance' && (
                                <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl text-center">
                                    <p className="text-xs font-bold text-slate-700">Tidak membutuhkan spesifikasi ukuran untuk perbaikan.</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Tim professional akan menilai kebutuhan berdasarkan foto dan deskripsi yang dicantumkan.</p>
                                </div>
                            )}
                        </section>
                    )}
                </div>

                {/* Bottom Right: The Team */}
                <div className="space-y-6">
                    {project.owner && (
                        <ClientContactCard 
                            owner={project.owner} 
                            user={user}
                            onOpenChat={onOpenChat} 
                            isOwner={isOwner}
                            onRefresh={onRefresh}
                        />
                    )}
                    <section className="bg-gray-900 rounded-[2rem] p-6 shadow-xl relative overflow-hidden">
                        {/* Decorative background element */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-[50px] rounded-full translate-x-8 -translate-y-8 pointer-events-none" />
                        
                        <div className="relative z-10 space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                <h3 className="text-xs font-black text-white tracking-widest uppercase">The Team</h3>
                                <Users size={14} className="text-gray-500" />
                            </div>

                            <div className="space-y-2">
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
                                                className="w-full bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-3 flex items-center gap-3 transition-all hover:translate-x-0.5 cursor-pointer"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0">
                                                    <Icon size={14} />
                                                </div>
                                                <div className="flex-1 text-left min-w-0">
                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none mb-0.5">
                                                        {getCategoryPhaseLabel(key, project?.project_category).label}
                                                    </p>
                                                    {hiredPro ? (
                                                        <div className="flex items-center gap-1">
                                                            <CheckCircle2 size={9} className="text-emerald-400" />
                                                            <p className="text-[11px] font-bold text-white truncate">{hiredPro.nama || hiredPro.user?.name || 'Assigned'}</p>
                                                        </div>
                                                    ) : bidCount > 0 ? (
                                                        <p className="text-[11px] font-bold text-amber-400">{bidCount} Proposals Sent</p>
                                                    ) : (
                                                        <p className="text-[11px] font-bold text-gray-400">Searching...</p>
                                                    )}
                                                </div>
                                                
                                                {/* Action Buttons for Lifecycle */}
                                                {hiredPro && (isOwner || isHiredPro) && (
                                                    <div className="flex items-center gap-1.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                                            className={`p-1.5 rounded-md transition-colors ${
                                                                isOwner ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                                            }`}
                                                        >
                                                            {isOwner ? <Shield size={12} /> : <LogOut size={12} />}
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
                                                                className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                                                            >
                                                                <Star size={12} className="fill-amber-400/20" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                <ArrowUpRight size={12} className="text-gray-600 group-hover:text-white transition-colors shrink-0" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
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
