import React from 'react';
import { Plus, Trash2, Shield, CheckCircle2 } from 'lucide-react';
import { ProposedTermin, ProposedMilestone } from '../../../../types/project.types';
import { ServiceItem } from '../../Details/ServiceCatalogPicker';

interface Props {
    termins: ProposedTermin[];
    milestones: ProposedMilestone[];
    totalOfferValue: number;
    onChange: (termins: ProposedTermin[]) => void;
    availableServices?: ServiceItem[];
    onMilestoneUpdate: (index: number, updates: Partial<ProposedMilestone>) => void;
    onMilestoneDelete: (index: number) => void;
    readOnly?: boolean;
}

export const PaymentSchedule: React.FC<Props> = ({ 
    termins, 
    milestones, 
    totalOfferValue, 
    onChange,
    availableServices = [],
    onMilestoneUpdate,
    onMilestoneDelete,
    readOnly = false
}) => {
    const totalPercentage = termins.reduce((acc, curr) => acc + Number(curr.percentage || 0), 0);

    const addTermin = () => {
        if (readOnly) return;
        const nextIndex = termins.length;
        const newMilestone = { 
            title: `Phase ${nextIndex + 1}`, 
            description: '', 
            services: [] 
        };
        
        const remainder = 100 - totalPercentage;
        
        if (remainder > 0) {
            const newTermin: ProposedTermin = { 
                trigger_description: `Phase ${nextIndex + 1}`, 
                percentage: remainder, 
                milestone_index: nextIndex 
            };
            onChange([...termins, newTermin]);
        } else {
            const largestIndex = termins.reduce((maxIdx, current, idx, arr) => 
                (current.percentage || 0) > (arr[maxIdx].percentage || 0) ? idx : maxIdx
            , 0);

            const currentVal = termins[largestIndex].percentage || 0;
            const half1 = Math.floor(currentVal / 2);
            const half2 = currentVal - half1;

            const newTermins = [...termins];
            newTermins[largestIndex] = { ...newTermins[largestIndex], percentage: half1 };
            newTermins.push({ trigger_description: `Phase ${nextIndex + 1}`, percentage: half2, milestone_index: nextIndex });
            
            onChange(newTermins);
        }
        
        // Trigger corresponding milestone creation
        onMilestoneUpdate(nextIndex, newMilestone);
    };

    const removeTermin = (index: number) => {
        if (readOnly) return;
        // Filter out termin and shift all subsequent milestone_indexes
        const nextTermins = termins.filter((_, i) => i !== index).map((t, i) => ({
            ...t,
            milestone_index: i
        }));
        onChange(nextTermins);
        
        // Delete corresponding milestone
        onMilestoneDelete(index);
    };

    const updateTermin = (index: number, updates: Partial<ProposedTermin>) => {
        if (readOnly) return;
        const newTermins = [...termins];
        newTermins[index] = { ...newTermins[index], ...updates };
        onChange(newTermins);
    };

    const toggleService = (terminIndex: number, service: ServiceItem) => {
        if (readOnly) return;
        const milestone = milestones[terminIndex];
        if (!milestone) return;
        
        // Ensure the service is removed from all other milestones (Move logic)
        milestones.forEach((m, idx) => {
            if (idx !== terminIndex && m.services?.some(s => s.title === service.title)) {
                onMilestoneUpdate(idx, { 
                    services: m.services.filter(s => s.title !== service.title) 
                });
            }
        });

        const currentServices = milestone.services || [];
        const exists = currentServices.some(s => s.title === service.title);
        const nextServices = exists 
            ? currentServices.filter(s => s.title !== service.title)
            : [...currentServices, { ...service, milestone_index: terminIndex }];
            
        onMilestoneUpdate(terminIndex, { services: nextServices });
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Schedule (Termins)</label>
                <span className={`text-[10px] font-black px-3 py-1 rounded-full ${totalPercentage === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    Total: {totalPercentage}%
                </span>
            </div>
            
            <div className="space-y-3">
                {termins.map((termin, index) => {
                    const milestoneIndex = index;
                    const connectedMilestone = milestones[milestoneIndex];
                    const milestoneServices = connectedMilestone?.services || [];

                    return (
                        <div key={index} className="space-y-3 p-5 bg-white border-2 border-gray-100 rounded-[2rem] shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex gap-3 items-center">
                                <input 
                                    type="text" 
                                    required 
                                    disabled={readOnly}
                                    value={termin.trigger_description}
                                    onChange={(e) => {
                                        updateTermin(index, { trigger_description: e.target.value });
                                        onMilestoneUpdate(index, { title: e.target.value });
                                    }}
                                    className="flex-1 px-4 py-2 bg-gray-50 border border-transparent focus:border-slate-900 rounded-xl font-bold text-xs outline-none disabled:opacity-75 disabled:cursor-not-allowed"
                                    placeholder="Phase description (e.g. DP)"
                                />
                                <div className="relative w-20">
                                    <input 
                                        type="number" 
                                        required 
                                        disabled={readOnly}
                                        min="0" max="100"
                                        value={termin.percentage || ''}
                                        onChange={(e) => updateTermin(index, { percentage: Number(e.target.value) })}
                                        className="w-full pl-4 pr-8 py-2 bg-gray-50 border border-transparent focus:border-slate-900 rounded-xl font-bold text-xs outline-none disabled:opacity-75 disabled:cursor-not-allowed"
                                        placeholder="0"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-gray-400 text-[10px]">%</span>
                                </div>
                                {!readOnly && (
                                    <button type="button" onClick={() => removeTermin(index)} className="p-2 text-gray-300 hover:text-red-500">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>

                            {/* Deliverables Description (Merged Milestone Input) */}
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">What will be delivered at this stage?</label>
                                <textarea
                                    value={connectedMilestone?.description || ''}
                                    disabled={readOnly}
                                    onChange={(e) => onMilestoneUpdate(index, { description: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-slate-900 rounded-xl text-xs font-semibold placeholder:text-gray-300 outline-none resize-none h-16 disabled:opacity-75 disabled:cursor-not-allowed"
                                    placeholder="Explain deliverables (e.g., Drafting legal documents, Gov permit submission, etc.)"
                                    rows={2}
                                />
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculated Price:</span>
                                <span className="text-[11px] font-black text-slate-900">
                                    {(() => {
                                        const baseAmount = ((totalOfferValue || 0) * (termin.percentage || 0)) / 100;
                                        const servicesCost = milestoneServices.reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);
                                        
                                        if (servicesCost > 0) {
                                            return (
                                                <span className="text-right flex flex-col items-end">
                                                    <span className="text-slate-900 font-black">Rp {(baseAmount + servicesCost).toLocaleString('id-ID')}</span>
                                                    <span className="text-[8px] text-slate-400 uppercase tracking-tighter">
                                                        (Rp {baseAmount.toLocaleString('id-ID')} + Rp {servicesCost.toLocaleString('id-ID')} Service)
                                                    </span>
                                                </span>
                                            );
                                        }
                                        
                                        return `Rp ${baseAmount.toLocaleString('id-ID')}`;
                                    })()}
                                </span>
                            </div>

                            {/* Service Picker inside Card */}
                            {availableServices.length > 0 && (
                                <div className="pt-3 border-t border-slate-50 space-y-2">
                                    <div className="flex items-center gap-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                        <Shield size={10} />
                                        Include Legal Service in this Phase
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {availableServices.map((service, sIdx) => {
                                            const isSelected = milestoneServices.some(s => s.title === service.title);
                                            return (
                                                <button
                                                    key={sIdx}
                                                    type="button"
                                                    disabled={readOnly}
                                                    onClick={() => toggleService(index, service)}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all border ${
                                                        isSelected 
                                                        ? 'bg-zinc-900 border-slate-500 text-white shadow-md shadow-slate-900/20' 
                                                        : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'
                                                    } ${readOnly ? 'cursor-not-allowed opacity-90' : ''}`}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <span>{service.title}</span>
                                                        {isSelected && <CheckCircle2 size={10} />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            
            {!readOnly && (
                <button type="button" onClick={addTermin} className="text-[10px] font-black text-slate-900 flex items-center gap-2 hover:bg-gray-100 px-4 py-2 rounded-xl transition-all">
                    <Plus size={14} /> Add Payment Phase
                </button>
            )}
        </div>
    );
};
