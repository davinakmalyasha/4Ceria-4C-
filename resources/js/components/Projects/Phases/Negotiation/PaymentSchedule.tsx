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
}

export const PaymentSchedule: React.FC<Props> = ({ 
    termins, 
    milestones, 
    totalOfferValue, 
    onChange,
    availableServices = [],
    onMilestoneUpdate
}) => {
    const totalPercentage = termins.reduce((acc, curr) => acc + Number(curr.percentage || 0), 0);

    const addTermin = () => {
        const nextMilestoneIndex = milestones.length;
        const newMilestone = { 
            title: `Milestone for Phase ${termins.length + 1}`, 
            description: '', 
            services: [] 
        };
        
        // Update milestones first
        const updatedMilestones = [...milestones, newMilestone];
        // We can't easily batch update here without changing props, 
        // so we'll rely on the parent state update in the next tick or update termins last.
        
        const remainder = 100 - totalPercentage;
        
        if (remainder > 0) {
            const newTermin: ProposedTermin = { 
                trigger_description: '', 
                percentage: remainder, 
                milestone_index: nextMilestoneIndex 
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
            newTermins.push({ trigger_description: '', percentage: half2, milestone_index: nextMilestoneIndex });
            
            onChange(newTermins);
        }
        
        // Also trigger the milestone creation in parent
        onMilestoneUpdate(nextMilestoneIndex, newMilestone);
    };

    const removeTermin = (index: number) => {
        onChange(termins.filter((_, i) => i !== index));
    };

    const updateTermin = (index: number, updates: Partial<ProposedTermin>) => {
        const newTermins = [...termins];
        newTermins[index] = { ...newTermins[index], ...updates };
        onChange(newTermins);
    };

    const toggleService = (terminIndex: number, service: ServiceItem) => {
        let mIndex = termins[terminIndex].milestone_index ?? -1;
        
        // MAGIC DECOUPLER: 
        // If this milestone is shared with another termin, create a unique one for this card
        const isShared = termins.some((t, idx) => idx !== terminIndex && t.milestone_index === mIndex);
        
        if (mIndex < 0 || isShared) {
            const nextIdx = milestones.length;
            const newMilestone = { 
                title: termins[terminIndex].trigger_description || `Phase ${terminIndex + 1} Delivery`, 
                description: '', 
                services: isShared && mIndex >= 0 ? [...(milestones[mIndex].services || [])] : []
            };
            
            // Link termin to new unique milestone
            updateTermin(terminIndex, { milestone_index: nextIdx });
            onMilestoneUpdate(nextIdx, newMilestone);
            mIndex = nextIdx;
        }

        const milestone = milestones[mIndex];
        const currentServices = milestone?.services || [];
        
        // Ensure the service is removed from all other milestones (the "Move" logic)
        milestones.forEach((m, idx) => {
            if (idx !== mIndex && m.services?.some(s => s.title === service.title)) {
                onMilestoneUpdate(idx, { 
                    services: m.services.filter(s => s.title !== service.title) 
                });
            }
        });

        const exists = currentServices.some(s => s.title === service.title);
        const nextServices = exists 
            ? currentServices.filter(s => s.title !== service.title)
            : [...currentServices, { ...service, milestone_index: mIndex }]; // Tag service with its phase index
            
        onMilestoneUpdate(mIndex, { services: nextServices });
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
                    const milestoneIndex = termin.milestone_index ?? -1;
                    const connectedMilestone = milestoneIndex >= 0 ? milestones[milestoneIndex] : null;
                    const milestoneServices = connectedMilestone?.services || [];

                    return (
                        <div key={index} className="space-y-3 p-5 bg-white border-2 border-gray-100 rounded-[2rem] shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex gap-3 items-center">
                                <input 
                                    type="text" 
                                    required 
                                    value={termin.trigger_description}
                                    onChange={(e) => updateTermin(index, { trigger_description: e.target.value })}
                                    className="flex-1 px-4 py-2 bg-gray-50 border border-transparent focus:border-slate-900 rounded-xl font-bold text-xs outline-none"
                                    placeholder="Phase description (e.g. DP)"
                                />
                                <div className="relative w-20">
                                    <input 
                                        type="number" 
                                        required 
                                        min="0" max="100"
                                        value={termin.percentage || ''}
                                        onChange={(e) => updateTermin(index, { percentage: Number(e.target.value) })}
                                        className="w-full pl-4 pr-8 py-2 bg-gray-50 border border-transparent focus:border-slate-900 rounded-xl font-bold text-xs outline-none"
                                        placeholder="0"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-gray-400 text-[10px]">%</span>
                                </div>
                                <button type="button" onClick={() => removeTermin(index)} className="p-2 text-gray-300 hover:text-red-500">
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <select
                                    value={termin.milestone_index}
                                    onChange={(e) => updateTermin(index, { milestone_index: Number(e.target.value) })}
                                    className="flex-1 px-3 py-1.5 bg-zinc-100 border-none rounded-lg text-[10px] font-bold outline-none text-slate-600"
                                >
                                    <option value={-1}>No specific milestone</option>
                                    {milestones.map((m, i) => (
                                        <option key={i} value={i}>Triggered by: {m.title || `Milestone ${i+1}`}</option>
                                    ))}
                                </select>
                                <span className="text-[10px] font-black text-slate-400 min-w-[80px] text-right">
                                    {(() => {
                                        const baseAmount = ((totalOfferValue || 0) * (termin.percentage || 0)) / 100;
                                        const servicesCost = milestoneServices.reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);
                                        
                                        if (servicesCost > 0) {
                                            return (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-slate-900 font-black">Rp {(baseAmount + servicesCost).toLocaleString('id-ID')}</span>
                                                    <span className="text-[8px] text-slate-400 uppercase tracking-tighter">
                                                        (Rp {baseAmount.toLocaleString('id-ID')} + Rp {servicesCost.toLocaleString('id-ID')} Service)
                                                    </span>
                                                </div>
                                            );
                                        }
                                        
                                        return `Rp ${baseAmount.toLocaleString('id-ID')}`;
                                    })()}
                                </span>
                            </div>

                            {/* Service Picker inside Termin Card - ALWAYS VISIBLE if services available */}
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
                                                    onClick={() => toggleService(index, service)}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all border ${
                                                        isSelected 
                                                        ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/20' 
                                                        : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'
                                                    }`}
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
            
            <button type="button" onClick={addTermin} className="text-[10px] font-black text-slate-900 flex items-center gap-2 hover:bg-gray-100 px-4 py-2 rounded-xl transition-all">
                <Plus size={14} /> Add Payment Phase
            </button>
        </div>
    );
};
