import React from 'react';
import { Plus, Trash2, Link as LinkIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ProjectMilestone, Termin } from '../../../types/project.types';
import { formatCurrency } from '../../../types/project.types';

interface TerminBuilderProps {
    termins: Partial<Termin>[];
    onUpdate: (termins: Partial<Termin>[]) => void;
    totalFee: number;
    milestones: ProjectMilestone[];
    isEditable: boolean;
}

const TerminBuilder: React.FC<TerminBuilderProps> = ({ 
    termins, 
    onUpdate, 
    totalFee, 
    milestones, 
    isEditable 
}) => {
    const totalPercentage = termins.reduce((sum, t) => sum + Number(t.percentage || 0), 0);
    const isBalanced = Math.round(totalPercentage) === 100;

    const handleAddTermin = () => {
        const remaining = 100 - totalPercentage;
        const newTermin: Partial<Termin> = {
            label: `Termin ${termins.length + 1}`,
            percentage: remaining > 0 ? remaining : 0,
            amount: totalFee * ((remaining > 0 ? remaining : 0) / 100),
            status: 'locked',
            milestone_id: null
        };
        onUpdate([...termins, newTermin]);
    };

    const handleRemoveTermin = (index: number) => {
        onUpdate(termins.filter((_, i) => i !== index));
    };

    const handleChange = (index: number, field: keyof Termin, value: any) => {
        const newTermins = [...termins];
        newTermins[index] = { ...newTermins[index], [field]: value };

        // Recalculate amount if percentage changed
        if (field === 'percentage') {
            newTermins[index].amount = totalFee * (Number(value) / 100);
        }
        // Recalculate percentage if amount changed
        if (field === 'amount') {
            newTermins[index].percentage = totalFee > 0 ? (Number(value) / totalFee) * 100 : 0;
        }

        onUpdate(newTermins);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-2">
                    Progressive Payment Schedule
                    {isBalanced ? (
                        <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full lowercase">
                            <CheckCircle2 size={10} /> 100% allocated
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full lowercase animate-pulse">
                            <AlertCircle size={10} /> {totalPercentage}% allocated
                        </span>
                    )}
                </h4>
                {isEditable && (
                    <button 
                        onClick={handleAddTermin}
                        className="text-[10px] font-black text-amber-600 hover:text-amber-700 uppercase tracking-widest flex items-center gap-1"
                    >
                        <Plus size={12} /> Add Termin
                    </button>
                )}
            </div>

            <div className="space-y-3">
                {termins.map((termin, idx) => (
                    <div 
                        key={idx} 
                        className={`p-4 rounded-2xl border transition-all ${
                            isEditable ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-50 border-zinc-100'
                        }`}
                    >
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 space-y-3">
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        placeholder="Label (e.g. Down Payment)"
                                        value={termin.label || ''}
                                        disabled={!isEditable}
                                        onChange={(e) => handleChange(idx, 'label', e.target.value)}
                                        className="flex-1 bg-transparent border-none p-0 text-sm font-bold text-zinc-900 focus:ring-0 placeholder:text-zinc-300"
                                    />
                                    {isEditable && (
                                        <button 
                                            onClick={() => handleRemoveTermin(idx)}
                                            className="text-zinc-300 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Weight (%)</label>
                                        <div className="relative">
                                            <input 
                                                type="number"
                                                value={termin.percentage || 0}
                                                disabled={!isEditable}
                                                onChange={(e) => handleChange(idx, 'percentage', Number(e.target.value))}
                                                className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-amber-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Amount (IDR)</label>
                                        <div className="text-xs font-black text-zinc-900 mb-2">
                                            {formatCurrency(termin.amount || 0)}
                                        </div>
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                                            <LinkIcon size={10} /> Linked Milestone
                                        </label>
                                        <select
                                            value={termin.milestone_id || ''}
                                            disabled={!isEditable}
                                            onChange={(e) => handleChange(idx, 'milestone_id', e.target.value ? Number(e.target.value) : null)}
                                            className="w-full bg-zinc-50 border-none rounded-lg px-3 py-2 text-[10px] font-bold focus:ring-1 focus:ring-amber-500"
                                        >
                                            <option value="">No Link (Manual Release)</option>
                                            {milestones.map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {m.title}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Termin Notes */}
                                <div className="pt-3 mt-3 border-t border-zinc-50">
                                    <div className="flex items-center justify-between mb-1.5 px-1">
                                        <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Additional Notes / Instructions</label>
                                        <span className={`text-[8px] font-bold ${(termin.notes?.length || 0) > 240 ? 'text-amber-500' : 'text-zinc-300'}`}>
                                            {termin.notes?.length || 0}/250
                                        </span>
                                    </div>
                                    <textarea 
                                        value={termin.notes || ''}
                                        disabled={!isEditable}
                                        maxLength={250}
                                        onChange={(e) => handleChange(idx, 'notes', e.target.value)}
                                        placeholder="Add specific instructions for this payment (e.g. 'transfer via mandiri', 'needs site visit proof')..."
                                        className="w-full bg-zinc-50/50 border border-transparent focus:border-zinc-100 focus:bg-white rounded-xl p-3 text-[10px] leading-relaxed text-zinc-600 resize-none h-16 transition-all focus:ring-0 placeholder:text-zinc-300"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                
                {termins.length === 0 && (
                    <div className="p-8 border-2 border-dashed border-zinc-100 rounded-3xl text-center">
                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">No Payment Terms Defined</p>
                        <p className="text-[10px] text-zinc-300 mt-1">Payments will be handled as a single 100% bulk payment if none added.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TerminBuilder;
