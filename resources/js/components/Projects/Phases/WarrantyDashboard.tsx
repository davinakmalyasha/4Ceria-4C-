import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Shield, Clock, AlertCircle, CheckCircle, FilePlus, ChevronRight } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { WarrantyClaim } from '../../../types/phase.types';

interface WarrantyDashboardProps {
    project: any;
    currentUser: any;
    isOwner: boolean;
    isContractor: boolean;
}

export default function WarrantyDashboard({ project, currentUser, isOwner, isContractor }: WarrantyDashboardProps) {
    const [claims, setClaims] = useState<WarrantyClaim[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newClaim, setNewClaim] = useState({ title: '', description: '' });
    const [newClaimFiles, setNewClaimFiles] = useState<FileList | null>(null);
    const { showToast } = useToast();

    const fetchClaims = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/warranty-claims`);
            setClaims(res.data.data);
        } catch (error) {
            console.error('Failed to fetch claims');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchClaims(); }, [project.id]);

    const handleFileClaim = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const formData = new FormData();
            formData.append('title', newClaim.title);
            formData.append('description', newClaim.description);
            if (newClaimFiles) {
                Array.from(newClaimFiles).slice(0, 5).forEach((file, idx) => {
                    formData.append(`images[${idx}]`, file);
                });
            }
            await axios.post(`/projects/${project.id}/warranty-claims`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast('Warranty claim filed successfully', 'success');
            setShowForm(false);
            setNewClaim({ title: '', description: '' });
            setNewClaimFiles(null);
            fetchClaims();
        } catch (error) {
            showToast('Failed to file claim', 'error');
        }
    };

    const handleUpdateStatus = async (claimId: number, status: string) => {
        try {
            await axios.put(`/projects/${project.id}/warranty-claims/${claimId}/status`, { status });
            showToast('Claim status updated', 'success');
            fetchClaims();
        } catch (error) {
            showToast('Update failed', 'error');
        }
    };

    if (loading) return null;

    return (
        <div className="space-y-6">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem] flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
                        <Shield size={24} />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Warranty Status</h4>
                        <p className="text-sm font-black text-emerald-600">Active (180 Days)</p>
                    </div>
                </div>
                <div className="bg-slate-900 p-6 rounded-[2rem] flex items-center gap-4 text-white">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                        <Clock size={24} />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Retention Held</h4>
                        <p className="text-sm font-black">Rp {project.retention_balance?.toLocaleString() || '0'}</p>
                    </div>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-[2rem] flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm">
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Active Claims</h4>
                        <p className="text-sm font-black text-amber-600">{claims.filter(c => c.status !== 'closed').length} Issues</p>
                    </div>
                </div>
            </div>

            {/* Claims List */}
            <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Warranty Claim Log</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Post-handover maintenance tracking</p>
                    </div>
                    {isOwner && (
                        <button 
                            onClick={() => setShowForm(!showForm)}
                            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                        >
                            <FilePlus size={14} /> Report New Issue
                        </button>
                    )}
                </div>

                {showForm && (
                    <form onSubmit={handleFileClaim} className="mb-8 p-6 bg-slate-50 rounded-3xl space-y-4 border border-slate-100">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Issue Title</label>
                            <input 
                                type="text" 
                                value={newClaim.title}
                                onChange={e => setNewClaim({...newClaim, title: e.target.value})}
                                required
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-slate-900 text-sm font-bold"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</label>
                            <textarea 
                                value={newClaim.description}
                                onChange={e => setNewClaim({...newClaim, description: e.target.value})}
                                required
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-slate-900 text-sm font-bold h-24"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Photo Evidence</label>
                            <input 
                                type="file" 
                                multiple 
                                accept="image/*"
                                onChange={e => setNewClaimFiles(e.target.files)}
                                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
                            />
                        </div>
                        <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Submit Claim</button>
                    </form>
                )}

                <div className="space-y-3">
                    {claims.length === 0 ? (
                        <div className="text-center py-12 text-slate-300 font-bold uppercase tracking-widest text-[10px]">No claims filed yet. House is in good condition.</div>
                    ) : (
                        claims.map(claim => (
                            <div key={claim.id} className="p-5 border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-slate-50 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        claim.status === 'open' ? 'bg-red-100 text-red-600' : 
                                        claim.status === 'fixing' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                                    }`}>
                                        {claim.status === 'resolved' || claim.status === 'closed' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                                    </div>
                                    <div>
                                        <h5 className="text-xs font-black text-slate-900">{claim.title}</h5>
                                        <p className="text-[10px] text-slate-500 font-medium line-clamp-1">{claim.description}</p>
                                        {(claim as any).images && (claim as any).images.length > 0 && (
                                            <div className="flex gap-2 mt-2">
                                                {(claim as any).images.map((img: string, idx: number) => (
                                                    <a key={idx} href={img.startsWith('http') ? img : `/storage/${img}`} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 block hover:scale-110 transition-transform">
                                                        <img src={img.startsWith('http') ? img : `/storage/${img}`} alt="Evidence" className="w-full h-full object-cover" />
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                        claim.status === 'open' ? 'bg-red-100 text-red-600' : 
                                        claim.status === 'fixing' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                                    }`}>
                                        {claim.status.replace('_', ' ')}
                                    </span>
                                    {isContractor && claim.status === 'open' && (
                                        <button onClick={() => handleUpdateStatus(claim.id, 'fixing')} className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Fix Issue</button>
                                    )}
                                    {isContractor && claim.status === 'fixing' && (
                                        <button onClick={() => handleUpdateStatus(claim.id, 'resolved')} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Mark Resolved</button>
                                    )}
                                    {isOwner && claim.status === 'resolved' && (
                                        <button onClick={() => handleUpdateStatus(claim.id, 'closed')} className="px-3 py-1 bg-zinc-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Close Claim</button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
