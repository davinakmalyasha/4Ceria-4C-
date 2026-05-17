import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { HardHat, Calendar, Clock, Shield, Wrench, MapPin, CheckSquare, AlertTriangle, Box, Package, Users } from 'lucide-react';

// Maps for labels
const MILESTONE_LABELS: Record<string, string> = {
    site_prep: 'Persiapan Lahan', foundation: 'Pondasi', structure: 'Struktur',
    walls_roof: 'Dinding & Atap', mep_install: 'Instalasi MEP', finishing: 'Finishing',
};
const SAFETY_LABELS: Record<string, string> = {
    hardhat: 'Helm Proyek', safety_vest: 'Rompi Safety', safety_net: 'Jaring Pengaman',
    fire_extinguisher: 'APAR', first_aid: 'P3K', scaffolding_check: 'Cek Perancah',
    electrical_safety: 'Keamanan Listrik', ppe_gloves: 'Sarung Tangan', safety_boots: 'Sepatu Safety',
    dust_mask: 'Masker Debu',
};
const WORK_DAY_LABELS: Record<string, string> = {
    mon_sat: 'Senin - Sabtu', mon_fri: 'Senin - Jumat', custom: 'Jadwal Khusus',
};

export default function PublicBrief() {
    const { token } = useParams<{ token: string }>();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchBrief = async () => {
            try {
                // FORCE absolute URL to avoid Laravel SPA redirect issues
                const apiUrl = `${window.location.origin}/api/brief/${token}`;
                console.log("Fetching Site Manual from:", apiUrl);
                
                const res = await axios.get(apiUrl, {
                    headers: { 'Accept': 'application/json' }
                });

                // Validation: If it's HTML, the API path is probably being caught by a web router
                if (typeof res.data === 'string' && res.data.includes('<!DOCTYPE html>')) {
                    throw new Error("Received HTML instead of JSON. Check API route routing.");
                }

                let cleanData = res.data.project || res.data;
                
                // Double-check construction_details isn't double-encoded as a string
                if (typeof cleanData.construction_details === 'string') {
                    try {
                        cleanData.construction_details = JSON.parse(cleanData.construction_details);
                    } catch (e) { console.error("Parse Error", e); }
                }
                
                console.log("Verified Public Data:", cleanData);
                setData(cleanData);
            } catch (err: any) {
                console.error("Critical Fetch Error:", err);
                setError('Problem sinkronisasi data lapangan. Silahkan refresh.');
            } finally {
                setLoading(false);
            }
        };

        if (token) fetchBrief();
    }, [token]);

    // Robust Date Formatter
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch { return dateStr; }
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 border-4 border-white/5 border-t-amber-500 rounded-full animate-spin mb-6" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] animate-pulse">Menghubungkan ke Proyek...</p>
        </div>
    );

    if (error || !data || (Object.keys(data).length < 2)) return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-24 h-24 bg-red-500/10 rounded-[2rem] flex items-center justify-center text-red-500 mb-8 border border-red-500/20 shadow-2xl shadow-red-500/10">
                <AlertTriangle size={48} />
            </div>
            <h1 className="text-2xl font-black text-white mb-3">Brief Tidak Aktif</h1>
            <p className="text-sm text-slate-400 font-medium max-w-xs">{error || 'Maaf, data brief untuk link ini belum disinkronkan atau sudah dinonaktifkan.'}</p>
            <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-white hover:bg-white/10 transition-colors uppercase tracking-widest">Coba Lagi</button>
        </div>
    );

    const brief = data.construction_details || {};
    const milestones = data.milestones || [];
    const requirements = data.requirements || [];
    const comments = data.comments || [];

    return (
        <div className="min-h-screen bg-slate-950 text-white/90 pb-20 selection:bg-amber-500/30">
            {/* Header / Hero */}
            <div className="bg-zinc-900 border-b border-white/5 px-6 py-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] rounded-full -mr-32 -mt-32" />
                <div className="max-w-xl mx-auto relative">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 shadow-inner border border-amber-500/20">
                            <HardHat size={24} />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 block">Project Brief</span>
                            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-500/70">Certified Master Plan</span>
                        </div>
                    </div>
                    <h1 className="text-4xl font-black tracking-tighter leading-none text-white mb-6 uppercase italic">{data.title}</h1>
                    <div className="flex items-center gap-2.5 text-slate-400 bg-white/5 self-start px-5 py-2.5 rounded-2xl border border-white/5 backdrop-blur-md">
                        <MapPin size={14} className="text-emerald-500" />
                        <span className="text-xs font-black uppercase tracking-widest">{data.location || data.city || 'Site Area'}</span>
                    </div>
                </div>
            </div>

            <div className="max-w-xl mx-auto px-6 py-12 space-y-12">
                
                {/* 1. TIMELINE & WORK HOURS */}
                <Section title="Waktu & Jadwal" subtitle="Operational Schedule">
                    <div className="grid grid-cols-2 gap-4">
                        <InfoBox icon={<Calendar size={14} />} label="Mulai" value={formatDate(brief.schedule_start)} />
                        <InfoBox icon={<Calendar size={14} />} label="Selesai" value={formatDate(brief.schedule_end)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <InfoBox icon={<Clock size={14} />} label="Hari Kerja" value={WORK_DAY_LABELS[brief.work_days] || brief.work_days || '-'} />
                        <InfoBox icon={<Clock size={14} />} label="Jam Kerja" value={brief.work_hours_start && brief.work_hours_end ? `${brief.work_hours_start} - ${brief.work_hours_end}` : '-'} />
                    </div>
                </Section>

                {/* 2. PROGRESS PHASES (Milestones) */}
                {milestones.length > 0 && (
                    <Section title="Fase & Progres" subtitle="Construction Milestones">
                        <div className="space-y-6">
                            {milestones.map((ms: any, idx: number) => (
                                <div key={ms.id} className="flex gap-6 group">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-8 h-8 rounded-2xl flex items-center justify-center border-2 transition-all duration-500 shadow-lg ${ms.is_completed ? 'bg-emerald-500 border-emerald-500 text-slate-950 scale-110 shadow-emerald-500/20' : 'border-slate-800 bg-slate-950 text-slate-700'}`}>
                                            {ms.is_completed ? <CheckSquare size={16} strokeWidth={3} /> : <span className="text-[10px] font-black">{idx + 1}</span>}
                                        </div>
                                        <div className="w-[2px] h-full bg-slate-800 group-last:hidden my-2" />
                                    </div>
                                    <div className="flex-1 pb-6 pt-1">
                                        <h3 className={`text-base font-black tracking-tight uppercase italic ${ms.is_completed ? 'text-white' : 'text-slate-600'}`}>
                                            {ms.title}
                                        </h3>
                                        {ms.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">{ms.description}</p>}
                                        {ms.due_date && <p className={`text-[10px] font-black mt-3 uppercase tracking-widest ${ms.is_completed ? 'text-emerald-500/50' : 'text-amber-500/50'}`}>Estimasi: {formatDate(ms.due_date)}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* 3. BILL OF MATERIALS (BOM) */}
                {requirements.length > 0 && (
                    <Section title="Daftar Material" subtitle="Bill of Materials (BOM)">
                        <div className="bg-white/[0.02] rounded-3xl border border-white/5 overflow-hidden">
                            <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex items-center gap-3">
                                <Package size={16} className="text-slate-500" />
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Material Requirement</span>
                            </div>
                            <div className="divide-y divide-white/5">
                                {requirements.map((req: any) => (
                                    <div key={req.id} className="px-6 py-5 flex items-center justify-between hover:bg-white/[0.04] transition-colors">
                                        <div className="flex-1">
                                            <p className="text-sm font-black text-white/90 mb-1">{req.name}</p>
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${req.quality_level === 'premium' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-500/10 text-slate-500'}`}>
                                                {req.quality_level || 'Standard Quality'}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-white">{req.quantity_required}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase">{req.unit}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Section>
                )}

                {/* 4. VENDORS & EQUIPMENT */}
                <Section title="Vendor & Alat" subtitle="Assets & Subcontractors">
                    {/* Equipment Tags */}
                    {brief.equipment?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                            {brief.equipment.map((eq: string) => (
                                <div key={eq} className="px-4 py-2.5 bg-zinc-900 border border-white/5 rounded-2xl flex items-center gap-2.5 shadow-sm hover:border-amber-500/30 transition-all hover:scale-105">
                                    <Wrench size={12} className="text-amber-500 shadow-sm" />
                                    <span className="text-[10px] font-black text-white/70 uppercase tracking-tighter">{eq}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Subcontractor Cards */}
                    {brief.subcontractors?.length > 0 && (
                        <div className="grid gap-3">
                            {brief.subcontractors.map((sub: any, i: number) => (
                                <div key={i} className="p-5 bg-white/5 rounded-3xl border border-white/5 flex items-center gap-5 transition-transform hover:translate-x-1">
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 border border-indigo-500/10">
                                        <Users size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-black text-white leading-tight mb-1">{sub.name || 'Vendor TBD'}</p>
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{sub.type || 'Penyedia Jasa'} • {sub.scope || 'Lingkup Kerja'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                {/* 5. WORKFORCE & SAFETY */}
                <Section title="Keamanan & Pekerja" subtitle="HSSE & Manpower">
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <CountBox label="Mandor" count={brief.workforce?.mandor || 0} />
                        <CountBox label="Tukang" count={brief.workforce?.tukang || 0} />
                        <CountBox label="Kuli" count={brief.workforce?.kuli || 0} />
                    </div>
                    {brief.safety_protocols?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {brief.safety_protocols.map((id: string) => (
                                <div key={id} className="px-4 py-2.5 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-center gap-2.5">
                                    <Shield size={14} className="text-amber-500" />
                                    <span className="text-[10px] font-black uppercase text-amber-500/70 tracking-widest">{SAFETY_LABELS[id] || id}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                {/* 6. LOGS & INSTRUCTIONS */}
                {comments.length > 0 && (
                    <Section title="Instruksi & Q&A" subtitle="Field Communication">
                        <div className="space-y-6">
                            {comments.map((q: any) => (
                                <div key={q.id} className="space-y-5 bg-white/5 p-6 rounded-[2.5rem] border border-white/5 relative">
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex-shrink-0 flex items-center justify-center text-xs font-black uppercase text-slate-500 border border-white/5 shadow-inner">
                                            {q.user?.name?.substring(0, 2)}
                                        </div>
                                        <div className="flex-1 min-w-0 pt-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-xs font-black text-white uppercase tracking-tight">{q.user?.name}</span>
                                                <span className="text-[9px] font-black text-slate-600 uppercase italic">{formatDate(q.created_at)}</span>
                                            </div>
                                            <p className="text-sm text-slate-400 leading-relaxed font-medium">{q.message}</p>
                                        </div>
                                    </div>

                                    {/* Replies */}
                                    {q.replies && q.replies.map((r: any) => (
                                        <div key={r.id} className="flex gap-4 ml-12 pl-6 border-l-2 border-amber-500/10 py-1">
                                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-[9px] font-black uppercase text-emerald-500 border border-emerald-500/10">
                                                {r.user?.name?.substring(0, 2)}
                                            </div>
                                            <div className="flex-1 pt-0.5">
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tight">{r.user?.name}</span>
                                                    <span className="text-[9px] font-black text-slate-700 uppercase italic">{formatDate(r.created_at)}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 leading-relaxed">{r.message}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                <div className="pt-20 text-center opacity-30 pb-10">
                    <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.6em]">System Verification: 4C-MASTER-SYNC</p>
                </div>
            </div>
        </div>
    );
}

// ─── Shared Components ───
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div className="space-y-6">
            <div className="px-2">
                <h2 className="text-2xl font-black text-white tracking-tighter uppercase italic leading-none mb-1">{title}</h2>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.5em]">{subtitle}</span>
            </div>
            <div className="bg-zinc-900/40 border border-white/5 rounded-[3rem] p-8 backdrop-blur-3xl shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.02] rounded-full -mr-16 -mt-16 blur-3xl" />
                {children}
            </div>
        </div>
    );
}

function InfoBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="p-6 bg-white/5 rounded-3xl border border-white/5 transition-all hover:bg-white/[0.08] group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-white/[0.02] rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150" />
            <div className="flex items-center gap-3 text-slate-500 mb-2 relative">
                <span className="text-amber-500/50">{icon}</span>
                <span className="text-[9px] font-black uppercase tracking-[0.2em]">{label}</span>
            </div>
            <p className="text-sm font-black text-white tracking-tight relative leading-none">{value}</p>
        </div>
    );
}

function CountBox({ label, count }: { label: string; count: number }) {
    return (
        <div className="bg-white/5 rounded-3xl p-6 text-center border border-white/5 shadow-xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-3xl font-black text-white tracking-tighter mb-1 relative">{count}</p>
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] relative">{label}</p>
        </div>
    );
}
