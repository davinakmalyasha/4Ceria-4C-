import React from 'react';
import { Plus, Trash2, CheckCircle2, Shield } from 'lucide-react';
import { ProposedMilestone } from '../../../../types/project.types';
import { ServiceItem } from '../../Details/ServiceCatalogPicker';

interface Props {
    milestones: ProposedMilestone[];
    onChange: (milestones: ProposedMilestone[]) => void;
}

export const MilestoneRoadmap: React.FC<Props> = ({ milestones, onChange }) => {
    const addMilestone = () => {
        onChange([...milestones, { title: '', description: '', services: [] }]);
    };

    const removeMilestone = (index: number) => {
        onChange(milestones.filter((_, i) => i !== index));
    };

    const updateMilestone = (index: number, updates: Partial<ProposedMilestone>) => {
        const newM = [...milestones];
        newM[index] = { ...newM[index], ...updates };
        onChange(newM);
    };

    return (
        <div className="space-y-4">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Project Milestones (Visual Roadmap)</label>
            <div className="space-y-4">
                {milestones.map((milestone, index) => (
                    <div key={index} className="p-6 bg-slate-900 rounded-[2rem] relative group border border-slate-800 transition-all hover:border-slate-700">
                        <button type="button" onClick={() => removeMilestone(index)} className="absolute top-6 right-6 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={16} />
                        </button>
                        
                        <div className="space-y-2 pr-8">
                            <input 
                                type="text" 
                                required 
                                value={milestone.title}
                                onChange={(e) => updateMilestone(index, { title: e.target.value })}
                                className="w-full px-0 bg-transparent border-none text-white text-base font-black placeholder:text-slate-700 outline-none"
                                placeholder="Milestone Title (e.g. Initial Planning)"
                            />
                            <textarea
                                value={milestone.description}
                                onChange={(e) => updateMilestone(index, { description: e.target.value })}
                                className="w-full px-0 bg-transparent border-none text-slate-400 text-xs font-medium outline-none placeholder:text-slate-800 resize-none"
                                placeholder="What will be delivered at this stage?"
                                rows={2}
                            />
                        </div>

                        {/* Summary of attached services */}
                        {(milestone.services || []).length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-1">
                                {milestone.services?.map((s, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-slate-800 text-slate-500 rounded text-[8px] font-black uppercase">
                                        {s.title}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <button type="button" onClick={addMilestone} className="text-[10px] font-black text-slate-900 flex items-center gap-2 hover:bg-gray-100 px-4 py-2 rounded-xl transition-all">
                <Plus size={14} /> Add Milestone
            </button>
        </div>
    );
};
