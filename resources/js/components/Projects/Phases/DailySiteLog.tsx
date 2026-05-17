import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Camera, Sun, Cloud, CloudRain, CloudLightning, Users, CalendarDays, X, Save, Info, CheckCircle, ShieldCheck } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { WEATHER_OPTIONS } from '../../../constants/ContractorStandardPresets';

interface DailyLogProps {
    project: any;
    isContractor: boolean;
}

interface LogEntry {
    id: number;
    log_date: string;
    weather: string;
    worker_count: number;
    activities: string;
    issues: string | null;
    photos: string[] | null;
    user: { name: string };
    created_at: string;
}

export default function DailySiteLog({ project, isContractor }: DailyLogProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const { showToast } = useToast();

    // Form State
    const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
    const [weather, setWeather] = useState('sunny');
    const [workerCount, setWorkerCount] = useState(10);
    const [activities, setActivities] = useState('');
    const [issues, setIssues] = useState('');
    const [photos, setPhotos] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const fetchLogs = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/daily-logs`);
            setLogs(res.data.data);
        } catch (error) {
            console.error('Failed to fetch logs', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchLogs(); }, [project.id]);

    const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length + photos.length > 4) {
            showToast('Max 4 photos per log entry.', 'error');
            return;
        }
        setPhotos([...photos, ...files]);
    };

    const handleRemovePhoto = (idx: number) => {
        setPhotos(photos.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const formData = new FormData();
        formData.append('log_date', logDate);
        formData.append('weather', weather);
        formData.append('worker_count', String(workerCount));
        formData.append('activities', activities);
        formData.append('issues', issues);
        photos.forEach(p => formData.append('photos[]', p));

        try {
            await axios.post(`/projects/${project.id}/daily-logs`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast('Daily log submitted!', 'success');
            setShowForm(false);
            setActivities('');
            setIssues('');
            setPhotos([]);
            fetchLogs();
        } catch (error) {
            showToast('Failed to submit log entry.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Delete this site log entry?')) return;
        try {
            await axios.delete(`/projects/${project.id}/daily-logs/${id}`);
            showToast('Log entry deleted.', 'success');
            fetchLogs();
        } catch (error) {
            showToast('Failed to delete log.', 'error');
        }
    };

    const getWeatherIcon = (w: string) => {
        switch(w) {
            case 'sunny': return <Sun className="text-amber-500" size={16} />;
            case 'cloudy': return <Cloud className="text-slate-400" size={16} />;
            case 'rainy': return <CloudRain className="text-blue-500" size={16} />;
            case 'stormy': return <CloudLightning className="text-purple-600" size={16} />;
            default: return <Sun size={16} />;
        }
    };

    if (loading) return <div className="py-20 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">Loading Site Logs...</div>;

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                {isContractor && !showForm && (
                    <button 
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
                    >
                        <Plus size={16} /> Log Daily Activity
                    </button>
                )}
            </div>

            {showForm && (
                <motion.form 
                    initial={{ opacity: 0, y: -20 }} 
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={handleSubmit} 
                    className="bg-white border-2 border-slate-900 rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[5rem] -mr-12 -mt-12 -z-10" />
                    
                    <div className="flex items-center justify-between mb-4">
                        <h5 className="text-slate-900 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2">
                            <CalendarDays size={18} /> New Site Log Entry
                        </h5>
                        <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-900"><X size={20} /></button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Log Date</label>
                            <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black focus:border-slate-900 outline-none transition-all" required />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Weather</label>
                            <select value={weather} onChange={e => setWeather(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black focus:border-slate-900 outline-none transition-all appearance-none">
                                {WEATHER_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.emoji} {o.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Worker Count</label>
                            <input type="number" value={workerCount} onChange={e => setWorkerCount(Number(e.target.value))} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black focus:border-slate-900 outline-none transition-all" required min="0" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activities Executed</label>
                        <textarea value={activities} onChange={e => setActivities(e.target.value)} placeholder="What was accomplished today? (e.g. Concrete pouring for column B1-B8...)" className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium h-32 focus:border-slate-900 outline-none transition-all resize-none" required />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Issues / Constraints (Optional)</label>
                        <textarea value={issues} onChange={e => setIssues(e.target.value)} placeholder="Any delays, accidents, or supply shortages?" className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium h-24 focus:border-slate-900 outline-none transition-all resize-none" />
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                            Site Photos (Max 4)
                            <span className="text-slate-300 font-bold lowercase">{photos.length}/4 entries</span>
                        </label>
                        <div className="flex flex-wrap gap-4">
                            {photos.map((p, i) => (
                                <div key={i} className="relative w-24 h-24">
                                    <img src={URL.createObjectURL(p)} className="w-full h-full object-cover rounded-2xl border border-slate-200 shadow-sm" alt="" />
                                    <button type="button" onClick={() => handleRemovePhoto(i)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"><X size={12} /></button>
                                </div>
                            ))}
                            {photos.length < 4 && (
                                <label className="w-24 h-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-all">
                                    <Camera size={20} className="text-slate-300" />
                                    <input type="file" className="hidden" accept="image/*" multiple onChange={handlePhotoAdd} />
                                </label>
                            )}
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={submitting} 
                        className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-[0.4em] flex items-center justify-center gap-2 hover:-translate-y-1 active:scale-95 transition-all shadow-xl disabled:opacity-50"
                    >
                        {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={18} /> Submit Daily Log Entry</>}
                    </button>
                </motion.form>
            )}

            <div className="space-y-6">
                {logs.length === 0 ? (
                    <div className="py-20 text-center bg-slate-50 border-2 border-dashed border-slate-100 rounded-[3rem]">
                        <CalendarDays className="mx-auto text-slate-200 mb-4" size={48} />
                        <p className="text-sm font-black text-slate-300 uppercase tracking-[0.2em]">No log entries recorded yet</p>
                    </div>
                ) : (
                    logs.map(log => (
                        <div key={log.id} className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-md transition-shadow relative group">
                            <div className="flex flex-col md:flex-row gap-8">
                                <div className="md:w-48 shrink-0 flex flex-col gap-2">
                                    <div className="px-4 py-3 bg-slate-900 rounded-2xl text-white">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Log Date</p>
                                        <p className="text-sm font-black">{new Date(log.log_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                    </div>
                                    <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl">
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Weather</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {getWeatherIcon(log.weather)}
                                            <span className="text-xs font-black text-slate-700 capitalize">{log.weather}</span>
                                        </div>
                                    </div>
                                    <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl">
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Workforce</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <Users size={14} className="text-slate-400" />
                                            <span className="text-xs font-black text-slate-700">{log.worker_count} Workers</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Daily Summary</p>
                                        {isContractor && (
                                            <button onClick={() => handleDelete(log.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={16} /></button>
                                        )}
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h6 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <CheckCircle size={12} className="text-emerald-500" /> Site Activities
                                            </h6>
                                            <p className="text-sm text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">{log.activities}</p>
                                        </div>

                                        {log.issues && (
                                            <div className="p-4 bg-red-50/50 border border-red-100 rounded-2xl">
                                                <h6 className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                                    <Info size={12} /> Reported Issues
                                                </h6>
                                                <p className="text-xs text-red-800 font-medium italic">"{log.issues}"</p>
                                            </div>
                                        )}

                                        {log.photos && log.photos.length > 0 && (
                                            <div className="pt-2">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Site Documentation</p>
                                                <div className="flex flex-wrap gap-3">
                                                    {log.photos.map((p, i) => (
                                                        <a key={i} href={`/storage/${p}`} target="_blank" rel="noopener noreferrer" className="relative group/photo">
                                                            <img src={`/storage/${p}`} className="w-24 h-24 object-cover rounded-2xl border border-slate-100 shadow-sm transition-transform group-hover/photo:scale-105" alt="" />
                                                            <div className="absolute inset-0 bg-slate-900/40 rounded-2xl opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity">
                                                                <Info size={16} className="text-white" />
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-6 border-t border-slate-50 flex items-center gap-2">
                                        <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[9px] font-bold text-slate-400 uppercase">
                                            {log.user.name.charAt(0)}
                                        </div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                            Logged by {log.user.name} • {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
