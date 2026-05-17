import React, { useState } from 'react';
import { Save, X, Info, Zap, ShieldCheck, Layers, Layout } from 'lucide-react';
import { 
    ARCHITECT_STYLES, 
    ARCHITECT_SERVICE_SCOPES, 
    ARCHITECT_DELIVERABLES 
} from '../../../constants/ArchitectStandardPresets';
import { DesignDetails } from '../../../types/project.types';

interface TechSpecFormProps {
    initialData: DesignDetails;
    isUpdating: boolean;
    onSave: (data: Partial<DesignDetails>) => void;
    onCancel: () => void;
}

export default function TechSpecForm({ initialData, isUpdating, onSave, onCancel }: TechSpecFormProps) {
    const [style, setStyle] = useState(initialData.style || 'Modern');
    const [revisions, setRevisions] = useState(initialData.revisions || 3);
    const [scopes, setScopes] = useState<string[]>(initialData.scopes || ['schematic']);
    const [deliverables, setDeliverables] = useState<string[]>(initialData.deliverables || ['3d_render']);
    const [floorCount, setFloorCount] = useState(initialData.floorCount || 1);
    const [targetArea, setTargetArea] = useState(initialData.targetArea || 0);

    const toggleScope = (id: string) => {
        setScopes(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    };

    const toggleDeliverable = (id: string) => {
        setDeliverables(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
    };

    const needsStructural = floorCount > 2 || targetArea > 200;

    return (
        <div className="bg-zinc-50 rounded-3xl p-8 border border-zinc-200 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-zinc-900 tracking-tight">Configure Technical Specifications</h3>
                <div className="flex gap-2">
                    <button 
                        onClick={onCancel}
                        className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => onSave({ style, revisions, scopes, deliverables, floorCount, targetArea })}
                        disabled={isUpdating}
                        className="px-6 py-2 bg-zinc-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {isUpdating ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                        Save Specifications
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Style & Revisions */}
                <div className="space-y-6">
                    <div>
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Primary Aesthetic Style</label>
                        <select 
                            value={style} 
                            onChange={(e) => setStyle(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zinc-900 outline-none"
                        >
                            {ARCHITECT_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Revision Limit</label>
                        <input 
                            type="number" 
                            value={revisions} 
                            onChange={(e) => setRevisions(parseInt(e.target.value))}
                            className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zinc-900 outline-none"
                        />
                    </div>
                </div>

                {/* Building Data */}
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 text-center">Floor Count</label>
                            <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-zinc-200">
                                <button onClick={() => setFloorCount(Math.max(1, floorCount - 1))} className="w-10 h-10 flex items-center justify-center bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors">-</button>
                                <span className="flex-1 text-center font-black">{floorCount}</span>
                                <button onClick={() => setFloorCount(floorCount + 1)} className="w-10 h-10 flex items-center justify-center bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors">+</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 text-center">Target Area (sqm)</label>
                            <input 
                                type="number" 
                                value={targetArea} 
                                onChange={(e) => setTargetArea(parseInt(e.target.value))}
                                className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-bold text-center outline-none"
                                placeholder="e.g. 150"
                            />
                        </div>
                    </div>
                    
                    {needsStructural && (
                        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
                            <ShieldCheck className="text-amber-600 mt-1" size={18} />
                            <div>
                                <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Engineering Advisory</p>
                                <p className="text-[10px] text-amber-700 font-bold leading-tight mt-1">
                                    Based on the height/area, a Structural Engineer is legally recommended for this plan.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <hr className="border-zinc-200" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Service Scopes */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Layers size={18} className="text-zinc-400" />
                        <h4 className="text-xs font-black text-zinc-900 uppercase tracking-widest">Service Scopes</h4>
                    </div>
                    <div className="space-y-2">
                        {ARCHITECT_SERVICE_SCOPES.map(scope => (
                            <button
                                key={scope.id}
                                onClick={() => toggleScope(scope.id)}
                                className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3 ${
                                    scopes.includes(scope.id) 
                                        ? 'bg-white border-zinc-900 shadow-sm ring-1 ring-zinc-900' 
                                        : 'bg-transparent border-zinc-200 opacity-60 hover:opacity-100'
                                }`}
                            >
                                <div className={`mt-1 w-4 h-4 rounded border flex items-center justify-center transition-colors ${scopes.includes(scope.id) ? 'bg-zinc-900 border-zinc-900' : 'bg-white border-zinc-300'}`}>
                                    {scopes.includes(scope.id) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                                <div>
                                    <p className="text-xs font-black text-zinc-900 leading-none">{scope.label}</p>
                                    <p className="text-[10px] text-zinc-500 font-bold mt-1 leading-tight">{scope.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Deliverables */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Layout size={18} className="text-zinc-400" />
                        <h4 className="text-xs font-black text-zinc-900 uppercase tracking-widest">Expected Deliverables</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {ARCHITECT_DELIVERABLES.map(del => (
                            <button
                                key={del.id}
                                onClick={() => toggleDeliverable(del.id)}
                                className={`text-left p-4 rounded-2xl border transition-all flex items-center gap-3 ${
                                    deliverables.includes(del.id) 
                                        ? 'bg-white border-zinc-900 shadow-sm ring-1 ring-zinc-900' 
                                        : 'bg-transparent border-zinc-200 opacity-60 hover:opacity-100'
                                }`}
                            >
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${deliverables.includes(del.id) ? 'bg-zinc-900 border-zinc-900' : 'bg-white border-zinc-300'}`}>
                                    {deliverables.includes(del.id) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                                <span className="text-xs font-black text-zinc-900">{del.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

const RefreshCw = ({ className, size }: { className?: string; size?: number }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M3 21v-5h5" />
    </svg>
);
