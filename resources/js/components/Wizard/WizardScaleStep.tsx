import React from 'react';
import { motion } from 'framer-motion';
import { Ruler, Maximize, Layers, CheckSquare } from 'lucide-react';
import { WizardFormData, ProjectDimensions } from '../../hooks/useProjectWizard';

interface WizardScaleStepProps {
    form: WizardFormData;
    updateDimensions: (key: keyof ProjectDimensions, value: any) => void;
}

const sanitizeDecimalInput = (val: string) => {
    let clean = val.replace(',', '.');
    clean = clean.replace(/[^0-9.]/g, '');
    const parts = clean.split('.');
    if (parts.length > 2) {
        clean = parts[0] + '.' + parts.slice(1).join('');
    }
    return clean;
};

const sanitizeIntegerInput = (val: string) => {
    return val.replace(/[^0-9]/g, '');
};

export default function WizardScaleStep({ form, updateDimensions }: WizardScaleStepProps) {
    const dim = form.project_dimensions;

    // Land calculation
    const handleLandLengthChange = (val: string) => {
        updateDimensions('land_length', val);
        const lNum = parseFloat(val) || 0;
        const wNum = parseFloat(dim.land_width?.toString() || '0') || 0;
        if (lNum > 0 && wNum > 0) {
            const size = Math.round(lNum * wNum * 100) / 100;
            updateDimensions('land_size', size);
        } else {
            updateDimensions('land_size', 0);
        }
    };
    const handleLandWidthChange = (val: string) => {
        updateDimensions('land_width', val);
        const wNum = parseFloat(val) || 0;
        const lNum = parseFloat(dim.land_length?.toString() || '0') || 0;
        if (lNum > 0 && wNum > 0) {
            const size = Math.round(lNum * wNum * 100) / 100;
            updateDimensions('land_size', size);
        } else {
            updateDimensions('land_size', 0);
        }
    };

    // Building calculation
    const handleBuildingLengthChange = (val: string) => {
        updateDimensions('building_length', val);
        const lNum = parseFloat(val) || 0;
        const wNum = parseFloat(dim.building_width?.toString() || '0') || 0;
        if (lNum > 0 && wNum > 0) {
            const size = Math.round(lNum * wNum * 100) / 100;
            updateDimensions('building_size', size);
        } else {
            updateDimensions('building_size', 0);
        }
    };
    const handleBuildingWidthChange = (val: string) => {
        updateDimensions('building_width', val);
        const wNum = parseFloat(val) || 0;
        const lNum = parseFloat(dim.building_length?.toString() || '0') || 0;
        if (lNum > 0 && wNum > 0) {
            const size = Math.round(lNum * wNum * 100) / 100;
            updateDimensions('building_size', size);
        } else {
            updateDimensions('building_size', 0);
        }
    };

    // Renovation calculation
    const handleRenovationLengthChange = (val: string) => {
        updateDimensions('renovation_length', val);
        const lNum = parseFloat(val) || 0;
        const wNum = parseFloat(dim.renovation_width?.toString() || '0') || 0;
        if (lNum > 0 && wNum > 0) {
            const size = Math.round(lNum * wNum * 100) / 100;
            updateDimensions('renovation_area', size);
        } else {
            updateDimensions('renovation_area', 0);
        }
    };
    const handleRenovationWidthChange = (val: string) => {
        updateDimensions('renovation_width', val);
        const wNum = parseFloat(val) || 0;
        const lNum = parseFloat(dim.renovation_length?.toString() || '0') || 0;
        if (lNum > 0 && wNum > 0) {
            const size = Math.round(lNum * wNum * 100) / 100;
            updateDimensions('renovation_area', size);
        } else {
            updateDimensions('renovation_area', 0);
        }
    };

    // Interior calculation
    const handleInteriorLengthChange = (val: string) => {
        updateDimensions('area_length', val);
        const lNum = parseFloat(val) || 0;
        const wNum = parseFloat(dim.area_width?.toString() || '0') || 0;
        if (lNum > 0 && wNum > 0) {
            const size = Math.round(lNum * wNum * 100) / 100;
            updateDimensions('area_size', size);
        } else {
            updateDimensions('area_size', 0);
        }
    };
    const handleInteriorWidthChange = (val: string) => {
        updateDimensions('area_width', val);
        const wNum = parseFloat(val) || 0;
        const lNum = parseFloat(dim.area_length?.toString() || '0') || 0;
        if (lNum > 0 && wNum > 0) {
            const size = Math.round(lNum * wNum * 100) / 100;
            updateDimensions('area_size', size);
        } else {
            updateDimensions('area_size', 0);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-4">

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
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={dim.land_length || ''} 
                                    onChange={e => handleLandLengthChange(sanitizeDecimalInput(e.target.value))} 
                                    required 
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all font-bold text-xs" 
                                    placeholder="15" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Lebar (m)</label>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={dim.land_width || ''} 
                                    onChange={e => handleLandWidthChange(sanitizeDecimalInput(e.target.value))} 
                                    required 
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all font-bold text-xs" 
                                    placeholder="8" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Luas (m²)</label>
                                <input 
                                    type="text" 
                                    value={dim.land_size || ''} 
                                    readOnly 
                                    className="w-full px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl outline-none font-bold text-xs text-zinc-655 cursor-not-allowed select-none" 
                                    placeholder="120" 
                                />
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
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={dim.building_length || ''} 
                                    onChange={e => handleBuildingLengthChange(sanitizeDecimalInput(e.target.value))} 
                                    required 
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-indigo-500 outline-none transition-all font-bold text-xs" 
                                    placeholder="10" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Lebar (m)</label>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={dim.building_width || ''} 
                                    onChange={e => handleBuildingWidthChange(sanitizeDecimalInput(e.target.value))} 
                                    required 
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-indigo-500 outline-none transition-all font-bold text-xs" 
                                    placeholder="8" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Luas (m²)</label>
                                <input 
                                    type="text" 
                                    value={dim.building_size || ''} 
                                    readOnly 
                                    className="w-full px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl outline-none font-bold text-xs text-zinc-655 cursor-not-allowed select-none" 
                                    placeholder="80" 
                                />
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
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={dim.renovation_length || ''} 
                                    onChange={e => handleRenovationLengthChange(sanitizeDecimalInput(e.target.value))} 
                                    required 
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-amber-500 outline-none transition-all font-bold text-xs" 
                                    placeholder="6" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Lebar (m)</label>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={dim.renovation_width || ''} 
                                    onChange={e => handleRenovationWidthChange(sanitizeDecimalInput(e.target.value))} 
                                    required 
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-amber-500 outline-none transition-all font-bold text-xs" 
                                    placeholder="5" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Luas (m²)</label>
                                <input 
                                    type="text" 
                                    value={dim.renovation_area || ''} 
                                    readOnly 
                                    className="w-full px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl outline-none font-bold text-xs text-zinc-655 cursor-not-allowed select-none" 
                                    placeholder="30" 
                                />
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
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={dim.area_length || ''} 
                                    onChange={e => handleInteriorLengthChange(sanitizeDecimalInput(e.target.value))} 
                                    required 
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-purple-500 outline-none transition-all font-bold text-xs" 
                                    placeholder="8" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Lebar (m)</label>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={dim.area_width || ''} 
                                    onChange={e => handleInteriorWidthChange(sanitizeDecimalInput(e.target.value))} 
                                    required 
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl focus:border-purple-500 outline-none transition-all font-bold text-xs" 
                                    placeholder="5" 
                                />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Luas (m²)</label>
                                <input 
                                    type="text" 
                                    value={dim.area_size || ''} 
                                    readOnly 
                                    className="w-full px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl outline-none font-bold text-xs text-zinc-655 cursor-not-allowed select-none" 
                                    placeholder="40" 
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1 flex items-center gap-1.5"><Layers size={13} className="text-purple-500" /> Jumlah Ruangan</label>
                        <input 
                                type="text" 
                                inputMode="numeric"
                                value={dim.room_count || ''} 
                                onChange={e => updateDimensions('room_count', sanitizeIntegerInput(e.target.value))} 
                                required 
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-purple-500 outline-none transition-all font-bold text-xs" 
                                placeholder="Cth: 2" 
                            />
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
