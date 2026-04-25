import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { AlertTriangle, Camera, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface SnagItem {
    id: number;
    title: string;
    description: string | null;
    location: string | null;
    severity: 'minor' | 'major' | 'critical';
    photos: string[] | null;
    status: 'open' | 'in_progress' | 'resolved' | 'accepted';
    assigned_role: string | null;
    resolution_note: string | null;
    resolution_photos: string[] | null;
    reporter?: { id: number; name: string };
    created_at: string;
}

interface SnagListManagerProps {
    project: any;
    user: any;
    onRefresh: () => void;
}

const SEVERITY_STYLES: Record<string, string> = {
    minor: 'bg-yellow-100 text-yellow-800',
    major: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
};

const STATUS_STYLES: Record<string, { bg: string; icon: React.ReactNode }> = {
    open: { bg: 'bg-red-50 border-red-200', icon: <AlertTriangle size={14} className="text-red-500" /> },
    in_progress: { bg: 'bg-amber-50 border-amber-200', icon: <Clock size={14} className="text-amber-500" /> },
    resolved: { bg: 'bg-blue-50 border-blue-200', icon: <CheckCircle2 size={14} className="text-blue-500" /> },
    accepted: { bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle2 size={14} className="text-emerald-500" /> },
};

export default function SnagListManager({ project, user, onRefresh }: SnagListManagerProps) {
    const { showToast } = useToast();
    const [items, setItems] = useState<SnagItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [resolveId, setResolveId] = useState<number | null>(null);
    const [resolveNote, setResolveNote] = useState('');
    const [resolveFiles, setResolveFiles] = useState<FileList | null>(null);
    const [form, setForm] = useState({ title: '', description: '', location: '', severity: 'minor' as const, assigned_role: 'kontraktor' });

    const isOwner = user?.id === project.user_id;
    const isPM = user?.role_type === 'project_manager' && project.pm_id === user?.id;
    const isContractor = user?.role_type === 'kontraktor' && project.selected_kontraktor_id === user?.kontraktor?.id;

    const fetchItems = useCallback(async () => {
        try {
            const res = await axios.get(`/api/projects/${project.id}/snag-items`);
            setItems(res.data.data || []);
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, [project.id]);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    const handleSubmit = async () => {
        if (!form.title.trim()) return;
        setIsSubmitting(true);
        try {
            await axios.post(`/api/projects/${project.id}/snag-items`, form);
            showToast('Defect reported.', 'success');
            setForm({ title: '', description: '', location: '', severity: 'minor', assigned_role: 'kontraktor' });
            setShowForm(false);
            fetchItems();
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStatusUpdate = async (id: number, status: 'in_progress' | 'resolved', note?: string, files?: FileList | null) => {
        setIsSubmitting(true);
        try {
            if (status === 'resolved') {
                const formData = new FormData();
                formData.append('status', status);
                if (note) formData.append('resolution_note', note);
                if (files) {
                    Array.from(files).slice(0, 3).forEach((file, idx) => {
                        formData.append(`resolution_photos[${idx}]`, file);
                    });
                }
                await axios.post(`/api/projects/${project.id}/snag-items/${id}?_method=PUT`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                setResolveId(null);
                setResolveNote('');
                setResolveFiles(null);
            } else {
                await axios.put(`/api/projects/${project.id}/snag-items/${id}`, { status, resolution_note: note });
            }
            showToast('Status updated.', 'success');
            fetchItems();
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAccept = async (id: number) => {
        setIsSubmitting(true);
        try {
            await axios.post(`/api/projects/${project.id}/snag-items/${id}/accept`);
            showToast('Resolution accepted.', 'success');
            fetchItems();
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Daftar Cacat / Snag List</h4>
                {(isOwner || isPM) && (
                    <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all">
                        + Lapor Cacat
                    </button>
                )}
            </div>

            {showForm && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
                    <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Judul cacat (mis: Retakan di dinding kamar utama)" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
                    <div className="grid grid-cols-2 gap-3">
                        <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Lokasi (mis: Kamar Tidur Lt.2)" className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
                        <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value as 'minor' | 'major' | 'critical' }))} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none">
                            <option value="minor">Minor</option>
                            <option value="major">Major</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                    <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Deskripsi detail..." rows={2} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
                    <button onClick={handleSubmit} disabled={isSubmitting || !form.title.trim()} className="w-full py-3 bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 disabled:opacity-50 transition-all">
                        {isSubmitting ? 'Mengirim...' : 'Kirim Laporan'}
                    </button>
                </div>
            )}

            {items.length === 0 ? (
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center">
                    <p className="text-gray-400 text-sm font-medium">Belum ada cacat dilaporkan. Lakukan inspeksi menyeluruh.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map(item => {
                        const style = STATUS_STYLES[item.status];
                        return (
                            <div key={item.id} className={`border rounded-2xl p-4 ${style.bg} transition-all`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        {style.icon}
                                        <h5 className="text-sm font-bold text-gray-900 truncate">{item.title}</h5>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${SEVERITY_STYLES[item.severity]}`}>{item.severity}</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex-shrink-0">{item.status.replace('_', ' ')}</span>
                                </div>
                                {item.location && <p className="text-[10px] text-gray-500 font-medium mt-1 ml-6">📍 {item.location}</p>}
                                {item.description && <p className="text-xs text-gray-600 mt-2 ml-6">{item.description}</p>}
                                {item.resolution_note && (
                                    <div className="mt-3 ml-6 bg-blue-100/50 rounded-xl p-3 border border-blue-200">
                                        <p className="text-xs text-blue-800 font-medium">✅ {item.resolution_note}</p>
                                        {item.resolution_photos && item.resolution_photos.length > 0 && (
                                            <div className="flex gap-2 mt-2">
                                                {item.resolution_photos.map((photo, idx) => (
                                                    <a key={idx} href={`/storage/${photo}`} target="_blank" rel="noreferrer" className="w-12 h-12 rounded-lg overflow-hidden border-2 border-white shadow-sm hover:scale-105 transition-transform block">
                                                        <img src={`/storage/${photo}`} alt="Resolution" className="w-full h-full object-cover" />
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-2 mt-3 ml-6">
                                    {isContractor && item.status === 'open' && (
                                        <button onClick={() => handleStatusUpdate(item.id, 'in_progress')} disabled={isSubmitting} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[10px] font-bold hover:bg-amber-600 disabled:opacity-50">Kerjakan</button>
                                    )}
                                    {isContractor && item.status === 'in_progress' && resolveId !== item.id && (
                                        <button onClick={() => setResolveId(item.id)} disabled={isSubmitting} className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-[10px] font-bold hover:bg-blue-600 disabled:opacity-50">Selesaikan</button>
                                    )}
                                    {(isOwner || isPM) && item.status === 'resolved' && (
                                        <button onClick={() => handleAccept(item.id)} disabled={isSubmitting} className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-600 disabled:opacity-50">Terima</button>
                                    )}
                                </div>
                                
                                {resolveId === item.id && (
                                    <div className="mt-3 ml-6 bg-white border border-blue-200 rounded-xl p-4 space-y-3">
                                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Bukti Perbaikan</p>
                                        <textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)} placeholder="Catatan perbaikan..." className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-300" rows={2} />
                                        <input type="file" multiple accept="image/*" onChange={e => setResolveFiles(e.target.files)} className="text-[10px] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-bold hover:file:bg-blue-100" />
                                        <div className="flex gap-2">
                                            <button onClick={() => setResolveId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-bold hover:bg-gray-200">Batal</button>
                                            <button onClick={() => handleStatusUpdate(item.id, 'resolved', resolveNote, resolveFiles)} disabled={isSubmitting || !resolveNote} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 disabled:opacity-50">Kirim Laporan</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
