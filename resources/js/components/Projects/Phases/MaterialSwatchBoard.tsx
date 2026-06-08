import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Palette, Plus, Trash2, CheckCircle2, 
    AlertCircle, Image as ImageIcon, Filter,
    Layers, Home, Droplets, Grid3X3, ShieldCheck
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { ProjectRequirement } from '../../../types/phase.types';

interface MaterialSwatchBoardProps {
    project: any;
    isPro: boolean;
    isOwner: boolean;
}

const CATEGORIES = [
    { id: 'interior', label: 'Furniture/Joinery', icon: Home },
    { id: 'architecture', label: 'Finishes/Flooring', icon: Grid3X3 },
    { id: 'general', label: 'Paint/Wall', icon: Droplets },
    { id: 'structural', label: 'Hardscape', icon: Layers },
];

export default function MaterialSwatchBoard({ project, isPro, isOwner }: MaterialSwatchBoardProps) {
    const [materials, setMaterials] = useState<ProjectRequirement[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('interior');
    const [showForm, setShowForm] = useState(false);
    const { showToast } = useToast();

    // Form State
    const [name, setName] = useState('');
    const [cat, setCat] = useState('interior');
    const [quality, setQuality] = useState('premium');
    const [notes, setNotes] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const fetchMaterials = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/requirements`);
            setMaterials(res.data.data);
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    useEffect(() => { fetchMaterials(); }, [project.id]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        const formData = new FormData();
        formData.append('name', name);
        formData.append('category', cat);
        formData.append('quality_level', quality);
        formData.append('notes', notes);
        formData.append('quantity_required', '1'); // Default for swatch
        formData.append('unit', 'selection');
        if (image) formData.append('image', image);

        try {
            await axios.post(`/projects/${project.id}/requirements`, formData);
            showToast('Swatch added to board', 'success');
            setShowForm(false);
            setName('');
            setNotes('');
            fetchMaterials();
        } catch (err) {
            showToast('Failed to add swatch', 'error');
        } finally { setSubmitting(false); }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Remove this swatch?')) return;
        try {
            await axios.delete(`/projects/${project.id}/requirements/${id}`);
            showToast('Swatch removed', 'success');
            fetchMaterials();
        } catch (err) { showToast('Action failed', 'error'); }
    };

    const filtered = materials.filter(m => m.category === filter);

    if (loading) return <div className="py-10 text-center animate-pulse text-[10px] font-black uppercase text-slate-400">Loading Swatches...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <Palette size={18} className="text-purple-500" />
                        Material Swatch Board
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Visual selection of finishes & materials</p>
                </div>
                {isPro && !showForm && (
                    <button 
                        onClick={() => setShowForm(true)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-purple-100"
                    >
                        <Plus size={14} className="inline mr-1" /> Add Swatch
                    </button>
                )}
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                {CATEGORIES.map((c) => {
                    const Icon = c.icon;
                    const active = filter === c.id;
                    return (
                        <button
                            key={c.id}
                            onClick={() => setFilter(c.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                                active ? 'bg-purple-600 text-white shadow-lg shadow-purple-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                        >
                            <Icon size={12} />
                            {c.label}
                        </button>
                    );
                })}
            </div>

            {showForm && (
                <motion.form 
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    onSubmit={handleAdd} 
                    className="bg-white border-2 border-purple-100 rounded-[2rem] p-6 space-y-4"
                >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Material Name</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Oak Wood Veneer - Dark" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black outline-none focus:border-purple-500" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                                    <select value={cat} onChange={e => setCat(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black">
                                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Grade</label>
                                    <select value={quality} onChange={e => setQuality(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-black">
                                        <option value="standard">Standard</option>
                                        <option value="premium">Premium</option>
                                        <option value="luxury">Luxury</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Notes</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Brand details, finish type, etc..." className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:border-purple-500 min-h-[60px]" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Photo / Texture</label>
                            <label className="aspect-square flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl cursor-pointer hover:bg-slate-100 transition-all overflow-hidden group">
                                {image ? (
                                    <img src={URL.createObjectURL(image)} className="w-full h-full object-cover" alt="Preview" />
                                ) : (
                                    <div className="text-center p-4">
                                        <ImageIcon size={32} className="mx-auto text-slate-300 group-hover:scale-110 transition-transform" />
                                        <p className="text-[8px] font-black uppercase text-slate-400 mt-2">Upload Sample Image</p>
                                    </div>
                                )}
                                <input type="file" className="hidden" accept="image/*" onChange={e => setImage(e.target.files?.[0] || null)} />
                            </label>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" disabled={submitting} className="flex-1 py-3 bg-purple-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Save to Swatch Board</button>
                        <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancel</button>
                    </div>
                </motion.form>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filtered.length === 0 ? (
                    <div className="col-span-full py-20 text-center bg-slate-50 border-2 border-dashed border-slate-100 rounded-[2rem]">
                        <Palette className="mx-auto text-slate-200 mb-2" size={40} />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No swatches in this category</p>
                    </div>
                ) : (
                    filtered.map(swatch => (
                        <div key={swatch.id} className="group relative bg-white border border-slate-100 rounded-[1.5rem] overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1">
                            <div className="aspect-[4/3] bg-slate-100">
                                {(swatch.image_url || swatch.image_path) ? (
                                    <img src={swatch.image_url || `/storage/${swatch.image_path}`} className="w-full h-full object-cover" alt={swatch.name} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                        <ImageIcon size={40} />
                                    </div>
                                )}
                            </div>
                            <div className="p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <h5 className="text-[11px] font-black text-slate-900 truncate">{swatch.name}</h5>
                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                        swatch.quality_level === 'luxury' ? 'bg-amber-100 text-amber-600' :
                                        swatch.quality_level === 'premium' ? 'bg-purple-100 text-purple-600' :
                                        'bg-slate-100 text-slate-500'
                                    }`}>
                                        {swatch.quality_level}
                                    </span>
                                </div>
                                <p className="text-[9px] text-slate-400 font-medium mt-1 line-clamp-2">{swatch.notes || 'No specific notes'}</p>
                            </div>

                            {isPro && (
                                <button 
                                    onClick={() => handleDelete(swatch.id)}
                                    className="absolute top-2 right-2 p-2 bg-white/80 backdrop-blur-sm text-slate-400 hover:text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
