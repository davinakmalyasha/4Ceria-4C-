import React from 'react';
import { motion } from 'framer-motion';
import { Ruler, Maximize, Layers, CheckSquare } from 'lucide-react';
import { WizardFormData, ProjectDimensions } from '../../hooks/useProjectWizard';

interface WizardScaleStepProps {
    form: WizardFormData;
    updateDimensions: (key: keyof ProjectDimensions, value: any) => void;
}

export default function WizardScaleStep({ form, updateDimensions }: WizardScaleStepProps) {
    const dim = form.project_dimensions;

    return (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
            <div className="text-center mb-6">
                <h3 className="text-xl font-black text-gray-900 leading-tight">Spesifikasi Proyek</h3>
                <p className="text-sm text-gray-400 mt-2">Bantu para profesional memahami skala {form.project_category === 'new_build' ? 'pembangunan' : form.project_category === 'renovation' ? 'renovasi' : 'pekerjaan'} Anda.</p>
            </div>

            {form.project_category === 'new_build' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><Maximize size={14} className="text-blue-500" /> Luas Tanah (m²)</label>
                        <input type="number" value={dim.land_size || ''} onChange={e => updateDimensions('land_size', parseInt(e.target.value))} required min="1" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all font-bold" placeholder="Cth: 120" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><Ruler size={14} className="text-blue-500" /> Luas Bangunan (m²)</label>
                        <input type="number" ref={(input) => { /* Auto-focus or validation logic if needed */ }} value={dim.building_size || ''} onChange={e => updateDimensions('building_size', parseInt(e.target.value))} required min="1" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all font-bold" placeholder="Cth: 80" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><Layers size={14} className="text-blue-500" /> Jumlah Lantai</label>
                        <select value={dim.floors || 1} onChange={e => updateDimensions('floors', parseInt(e.target.value))} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all font-bold">
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Lantai</option>)}
                        </select>
                    </div>
                </div>
            )}

            {form.project_category === 'renovation' && (
                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><Ruler size={14} className="text-amber-500" /> Estimasi Luas Area Renovasi (m²)</label>
                        <input type="number" value={dim.renovation_area || ''} onChange={e => updateDimensions('renovation_area', parseInt(e.target.value))} required min="1" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-100 outline-none transition-all font-bold" placeholder="Cth: 30" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5"><CheckSquare size={14} className="text-amber-500" /> Bagian yang direnovasi</label>
                        <div className="flex flex-wrap gap-2">
                            {['Atap', 'Dinding', 'Lantai', 'Fasad / Tampak Depan', 'Kamar Mandi', 'Dapur', 'Tambah Ruangan'].map(tag => {
                                const active = (dim.scope_tags || []).includes(tag);
                                return (
                                    <button
                                        key={tag} type="button"
                                        onClick={() => {
                                            const current = dim.scope_tags || [];
                                            const nextTags = active ? current.filter(t => t !== tag) : [...current, tag];
                                            updateDimensions('scope_tags', nextTags);
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${active ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                                    >
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {form.project_category === 'interior' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><Layers size={14} className="text-purple-500" /> Jumlah Ruangan</label>
                        <input type="number" value={dim.room_count || ''} onChange={e => updateDimensions('room_count', parseInt(e.target.value))} required min="1" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all font-bold" placeholder="Cth: 2" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><Ruler size={14} className="text-purple-500" /> Total Luas (m²)</label>
                        <input type="number" value={dim.area_size || ''} onChange={e => updateDimensions('area_size', parseInt(e.target.value))} required min="1" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all font-bold" placeholder="Cth: 40" />
                    </div>
                </div>
            )}

            {form.project_category === 'maintenance' && (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                    <p className="text-sm font-bold text-slate-700">Tidak perlu spesifikasi ukuran untuk perbaikan.</p>
                    <p className="text-xs text-slate-500 mt-1">Anda cukup menjelaskan kerusakannya di langkah berikutnya dan mengunggah foto.</p>
                </div>
            )}
        </motion.div>
    );
}
