import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Lock, Palette, Armchair, Lightbulb, Sparkles, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

interface InteriorBriefManagerProps {
    project: any;
    isInteriorDesigner: boolean;
    onRefresh: () => void;
}

interface FurnitureItem {
    id: string;
    name: string;
    room?: string;
    notes?: string;
}

interface InteriorBrief {
    style_preference: string;
    color_palette: string;
    furniture_budget: string;
    room_priorities: string;
    special_requests: string;
    inspiration_notes: string;
    furniture_wishlist: FurnitureItem[];
}

const STYLE_OPTIONS = [
    'Modern Minimalist', 'Scandinavian', 'Industrial', 'Bohemian',
    'Mid-Century Modern', 'Japanese Zen', 'Art Deco', 'Tropical',
    'Rustic Farmhouse', 'Contemporary Luxe', 'Coastal', 'Other'
];

const DEFAULT_BRIEF: InteriorBrief = {
    style_preference: '',
    color_palette: '',
    furniture_budget: '',
    room_priorities: '',
    special_requests: '',
    inspiration_notes: '',
    furniture_wishlist: [],
};

export default function InteriorBriefManager({ project, isInteriorDesigner, onRefresh }: InteriorBriefManagerProps) {
    const [brief, setBrief] = useState<InteriorBrief>(DEFAULT_BRIEF);
    const [saving, setSaving] = useState(false);
    const [locking, setLocking] = useState(false);
    const { showToast } = useToast();

    const isLocked = !!project?.interior_locked_at;
    const canEdit = isInteriorDesigner && !isLocked;

    useEffect(() => {
        if (project?.interior_details) {
            setBrief({ ...DEFAULT_BRIEF, ...project.interior_details });
        }
    }, [project?.interior_details]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.put(`/projects/${project.id}`, {
                interior_details: brief,
            });
            showToast('Interior brief saved', 'success');
            onRefresh();
        } catch (err) {
            showToast('Failed to save brief', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleLock = async () => {
        if (!confirm('Lock this interior brief? Once locked, details become read-only and serve as the official design contract.')) return;
        setLocking(true);
        try {
            await axios.post(`/projects/${project.id}/lock-brief`, {
                phase: 'interior'
            });
            showToast('Interior brief locked successfully', 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to lock brief', 'error');
        } finally {
            setLocking(false);
        }
    };

    const updateField = (field: keyof InteriorBrief, value: any) => {
        setBrief(prev => ({ ...prev, [field]: value }));
    };

    const addWishlistItem = () => {
        const name = prompt('Furniture Item Name:');
        if (!name) return;
        const newItem: FurnitureItem = {
            id: Math.random().toString(36).substr(2, 9),
            name,
            room: '',
            notes: ''
        };
        updateField('furniture_wishlist', [...brief.furniture_wishlist, newItem]);
    };

    const removeWishlistItem = (id: string) => {
        updateField('furniture_wishlist', brief.furniture_wishlist.filter(i => i.id !== id));
    };

    const updateWishlistItem = (id: string, field: keyof FurnitureItem, value: string) => {
        const updated = brief.furniture_wishlist.map(item => 
            item.id === id ? { ...item, [field]: value } : item
        );
        updateField('furniture_wishlist', updated);
    };

    return (
        <div className="space-y-8">
            {/* Lock Banner */}
            {isLocked && (
                <div className="p-6 bg-purple-900 text-white rounded-3xl flex items-center gap-4">
                    <Lock size={24} className="text-purple-300" />
                    <div>
                        <h4 className="font-black text-lg">Interior Brief Locked</h4>
                        <p className="text-purple-300 text-xs font-bold">Locked on {new Date(project.interior_locked_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                </div>
            )}

            {/* Brief Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Style Preference */}
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-4">
                        <Sparkles size={16} className="text-purple-500" />
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Style Preference</label>
                    </div>
                    {canEdit ? (
                        <select 
                            value={brief.style_preference} 
                            onChange={e => updateField('style_preference', e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold"
                        >
                            <option value="">Select a style...</option>
                            {STYLE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    ) : (
                        <p className="text-sm font-bold text-slate-700">{brief.style_preference || 'Not set'}</p>
                    )}
                </div>

                {/* Color Palette */}
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-4">
                        <Palette size={16} className="text-purple-500" />
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Color Palette</label>
                    </div>
                    {canEdit ? (
                        <input 
                            type="text" 
                            value={brief.color_palette}
                            onChange={e => updateField('color_palette', e.target.value)}
                            placeholder="e.g. Warm neutrals, white, sage green"
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold"
                        />
                    ) : (
                        <p className="text-sm font-bold text-slate-700">{brief.color_palette || 'Not set'}</p>
                    )}
                </div>

                {/* Furniture Budget */}
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-4">
                        <Armchair size={16} className="text-purple-500" />
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Furniture Budget</label>
                    </div>
                    {canEdit ? (
                        <input 
                            type="text" 
                            value={brief.furniture_budget}
                            onChange={e => updateField('furniture_budget', e.target.value)}
                            placeholder="e.g. Rp 50,000,000 - Rp 100,000,000"
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold"
                        />
                    ) : (
                        <p className="text-sm font-bold text-slate-700">{brief.furniture_budget || 'Not set'}</p>
                    )}
                </div>

                {/* Room Priorities */}
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-4">
                        <Lightbulb size={16} className="text-purple-500" />
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Room Priorities</label>
                    </div>
                    {canEdit ? (
                        <input 
                            type="text" 
                            value={brief.room_priorities}
                            onChange={e => updateField('room_priorities', e.target.value)}
                            placeholder="e.g. Kitchen first, then living room"
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold"
                        />
                    ) : (
                        <p className="text-sm font-bold text-slate-700">{brief.room_priorities || 'Not set'}</p>
                    )}
                </div>
            </div>

            {/* Special Requests */}
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 block">Special Requests / Notes</label>
                {canEdit ? (
                    <textarea 
                        value={brief.special_requests}
                        onChange={e => updateField('special_requests', e.target.value)}
                        rows={4}
                        placeholder="Any specific requirements, allergies (pet-safe materials), accessibility needs..."
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold resize-none"
                    />
                ) : (
                    <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap">{brief.special_requests || 'None'}</p>
                )}
            </div>

            {/* Furniture Wishlist Section */}
            <div className="p-8 bg-white border-2 border-slate-100 rounded-3xl space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                            <Armchair size={20} className="text-purple-600" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Furniture & Styling Wishlist</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Initial list of items to be sourced/designed</p>
                        </div>
                    </div>
                    {canEdit && (
                        <button 
                            onClick={addWishlistItem}
                            className="px-4 py-2 bg-purple-50 text-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-100 transition-all flex items-center gap-2"
                        >
                            <Plus size={14} /> Add Item
                        </button>
                    )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-100">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-wider">Item Name</th>
                                <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-wider">Target Room</th>
                                <th className="px-5 py-3 text-[9px] font-black uppercase text-slate-400 tracking-wider">Notes / Spec</th>
                                {canEdit && <th className="px-5 py-3 w-10"></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {brief.furniture_wishlist.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 4 : 3} className="px-5 py-10 text-center text-xs font-bold text-slate-400 italic">
                                        No specific items added to wishlist yet.
                                    </td>
                                </tr>
                            ) : (
                                brief.furniture_wishlist.map(item => (
                                    <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-4">
                                            {canEdit ? (
                                                <input 
                                                    type="text" 
                                                    value={item.name}
                                                    onChange={e => updateWishlistItem(item.id, 'name', e.target.value)}
                                                    className="w-full bg-transparent border-none p-0 text-sm font-bold text-slate-900 focus:ring-0"
                                                />
                                            ) : (
                                                <span className="text-sm font-bold text-slate-900">{item.name}</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            {canEdit ? (
                                                <input 
                                                    type="text" 
                                                    value={item.room}
                                                    onChange={e => updateWishlistItem(item.id, 'room', e.target.value)}
                                                    placeholder="e.g. Living Room"
                                                    className="w-full bg-transparent border-none p-0 text-xs font-bold text-slate-500 focus:ring-0"
                                                />
                                            ) : (
                                                <span className="text-xs font-bold text-slate-500">{item.room || '-'}</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            {canEdit ? (
                                                <input 
                                                    type="text" 
                                                    value={item.notes}
                                                    onChange={e => updateWishlistItem(item.id, 'notes', e.target.value)}
                                                    placeholder="e.g. Velvet finish, L-shape"
                                                    className="w-full bg-transparent border-none p-0 text-xs font-medium text-slate-400 focus:ring-0"
                                                />
                                            ) : (
                                                <span className="text-xs font-medium text-slate-400">{item.notes || '-'}</span>
                                            )}
                                        </td>
                                        {canEdit && (
                                            <td className="px-5 py-4 text-right">
                                                <button 
                                                    onClick={() => removeWishlistItem(item.id)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Save & Lock Actions */}
            {canEdit && (
                <div className="flex gap-3">
                    <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-purple-600 disabled:opacity-50 flex items-center justify-center gap-2">
                        <Save size={16} /> {saving ? 'Saving...' : 'Save Brief'}
                    </button>
                    <button onClick={handleLock} disabled={locking} className="px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black disabled:opacity-50 flex items-center gap-2">
                        <Lock size={16} /> Lock Brief
                    </button>
                </div>
            )}
        </div>
    );
}
