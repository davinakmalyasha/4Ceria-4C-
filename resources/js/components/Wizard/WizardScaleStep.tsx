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

    // Land calculation
    const handleLandLengthChange = (val: number) => {
        updateDimensions('land_length', val);
        const w = dim.land_width || 0;
        if (val && w) {
            updateDimensions('land_size', val * w);
        }
    };
    const handleLandWidthChange = (val: number) => {
        updateDimensions('land_width', val);
        const l = dim.land_length || 0;
        if (val && l) {
            updateDimensions('land_size', l * val);
        }
    };

    // Building calculation
    const handleBuildingLengthChange = (val: number) => {
        updateDimensions('building_length', val);
        const w = dim.building_width || 0;
        if (val && w) {
            updateDimensions('building_size', val * w);
        }
    };
    const handleBuildingWidthChange = (val: number) => {
        updateDimensions('building_width', val);
        const l = dim.building_length || 0;
        if (val && l) {
            updateDimensions('building_size', l * val);
        }
    };

    // Renovation calculation
    const handleRenovationLengthChange = (val: number) => {
        updateDimensions('renovation_length', val);
        const w = dim.renovation_width || 0;
        if (val && w) {
            updateDimensions('renovation_area', val * w);
        }
    };
    const handleRenovationWidthChange = (val: number) => {
        updateDimensions('renovation_width', val);
        const l = dim.renovation_length || 0;
        if (val && l) {
            updateDimensions('renovation_area', l * val);
        }
    };

    // Interior calculation
    const handleInteriorLengthChange = (val: number) => {
        updateDimensions('area_length', val);
        const w = dim.area_width || 0;
        if (val && w) {
            updateDimensions('area_size', val * w);
        }
    };
    const handleInteriorWidthChange = (val: number) => {
        updateDimensions('area_width', val);
        const l = dim.area_length || 0;
        if (val && l) {
            updateDimensions('area_size', l * val);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-4">
            <div className="text-center mb-4">
                <h3 className="text-lg font-black text-gray-900 leading-tight">Spesifikasi Dimensi Proyek</h3>
                <p className="text-xs text-gray-400 mt-1.5">Bantu para profesional memahami skala {form.project_category === 'new_build' ? 'pembangunan' : form.project_category === 'renovation' ? 'renovasi' : 'pekerjaan'} Anda.</p>
            </div>

            {form.project_category === 'new_build' && (
                <div className="space-y-4">
                    {/* Spesifikasi Tanah */}
                    <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2">
                            <Maximize size={14} className="text-blue-500" />
                            <h4 className="text-[10px] font-black uppercase text-slate-800 tracking-wider">Spesifikasi Tanah</h4>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Panjang (m)</label>
                                <input type="number" value={dim.land_length || ''} onChange={e => handleLandLengthChange(parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all font-bold text-xs" placeholder="15" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Lebar (m)</label>
                                <input type="number" value={dim.land_width || ''} onChange={e => handleLandWidthChange(parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all font-bold text-xs" placeholder="8" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Luas (m²)</label>
                                <input type="number" value={dim.land_size || ''} onChange={e => updateDimensions('land_size', parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl outline-none font-bold text-xs text-zinc-600" placeholder="120" />
                            </div>
                        </div>
                    </div>

                    {/* Spesifikasi Bangunan */}
                    <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2">
                            <Ruler size={14} className="text-indigo-500" />
                            <h4 className="text-[10px] font-black uppercase text-slate-800 tracking-wider">Spesifikasi Bangunan</h4>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Panjang (m)</label>
                                <input type="number" value={dim.building_length || ''} onChange={e => handleBuildingLengthChange(parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-indigo-500 outline-none transition-all font-bold text-xs" placeholder="10" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Lebar (m)</label>
                                <input type="number" value={dim.building_width || ''} onChange={e => handleBuildingWidthChange(parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-indigo-500 outline-none transition-all font-bold text-xs" placeholder="8" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Luas (m²)</label>
                                <input type="number" value={dim.building_size || ''} onChange={e => updateDimensions('building_size', parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl outline-none font-bold text-xs text-zinc-600" placeholder="80" />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center gap-1.5"><Layers size={13} className="text-blue-500" /> Jumlah Lantai</label>
                        <select value={dim.floors || 1} onChange={e => updateDimensions('floors', parseInt(e.target.value))} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all font-bold text-xs">
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Lantai</option>)}
                        </select>
                    </div>
                </div>
            )}

            {form.project_category === 'renovation' && (
                <div className="space-y-4">
                    {/* Spesifikasi Area Renovasi */}
                    <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2">
                            <Ruler size={14} className="text-amber-500" />
                            <h4 className="text-[10px] font-black uppercase text-slate-800 tracking-wider">Estimasi Dimensi Renovasi</h4>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Panjang (m)</label>
                                <input type="number" value={dim.renovation_length || ''} onChange={e => handleRenovationLengthChange(parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-amber-500 outline-none transition-all font-bold text-xs" placeholder="6" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Lebar (m)</label>
                                <input type="number" value={dim.renovation_width || ''} onChange={e => handleRenovationWidthChange(parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-amber-500 outline-none transition-all font-bold text-xs" placeholder="5" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Luas (m²)</label>
                                <input type="number" value={dim.renovation_area || ''} onChange={e => updateDimensions('renovation_area', parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl outline-none font-bold text-xs text-zinc-600" placeholder="30" />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1.5 flex items-center gap-1.5"><CheckSquare size={13} className="text-amber-500" /> Bagian yang direnovasi</label>
                        <div className="flex flex-wrap gap-1.5">
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
                                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${active ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
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
                <div className="space-y-4">
                    {/* Spesifikasi Area Interior */}
                    <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2">
                            <Ruler size={14} className="text-purple-500" />
                            <h4 className="text-[10px] font-black uppercase text-slate-800 tracking-wider">Spesifikasi Dimensi Ruangan</h4>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Panjang (m)</label>
                                <input type="number" value={dim.area_length || ''} onChange={e => handleInteriorLengthChange(parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-purple-500 outline-none transition-all font-bold text-xs" placeholder="8" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Lebar (m)</label>
                                <input type="number" value={dim.area_width || ''} onChange={e => handleInteriorWidthChange(parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-purple-500 outline-none transition-all font-bold text-xs" placeholder="5" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Luas (m²)</label>
                                <input type="number" value={dim.area_size || ''} onChange={e => updateDimensions('area_size', parseInt(e.target.value))} required min="1" className="w-full px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl outline-none font-bold text-xs text-zinc-600" placeholder="40" />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center gap-1.5"><Layers size={13} className="text-purple-500" /> Jumlah Ruangan</label>
                        <input type="number" value={dim.room_count || ''} onChange={e => updateDimensions('room_count', parseInt(e.target.value))} required min="1" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-purple-500 outline-none transition-all font-bold text-xs" placeholder="Cth: 2" />
                    </div>
                </div>
            )}

            {form.project_category === 'maintenance' && (
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                    <p className="text-xs font-bold text-slate-700">Tidak perlu spesifikasi ukuran untuk perbaikan.</p>
                    <p className="text-[11px] text-slate-500 mt-1">Anda cukup menjelaskan kerusakannya di langkah berikutnya dan mengunggah foto.</p>
                </div>
            )}
        </motion.div>
    );
}
