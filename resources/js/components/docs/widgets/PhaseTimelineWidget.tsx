import React, { useState } from 'react';
import { Paintbrush, Wrench, HardHat, Key, CheckCircle2 } from 'lucide-react';

interface Phase { label: string; icon: typeof Paintbrush; desc: string; duration: string }

const phases: Phase[] = [
    { label: 'Design', icon: Paintbrush, desc: 'Architectural blueprints, 3D renders, and permit applications prepared.', duration: '2 weeks' },
    { label: 'Engineering', icon: Wrench, desc: 'Structural calculations, MEP plans, and material BOQ finalized.', duration: '3 weeks' },
    { label: 'Construction', icon: HardHat, desc: 'On-site building with milestone inspections at each stage.', duration: '12 weeks' },
    { label: 'Handover', icon: Key, desc: 'Final walkthrough, defect list resolved, keys delivered to client.', duration: '1 week' },
];

export default function PhaseTimelineWidget() {
    const [active, setActive] = useState<number>(0);
    const [completed, setCompleted] = useState<number>(0);

    const handleClick = (i: number) => setActive(i);
    const markDone = () => {
        const next = Math.min(completed + 1, phases.length);
        setCompleted(next);
        if (next < phases.length) setActive(next);
    };

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all hover:shadow-md">
            <h4 className="font-extrabold text-neutral-800 text-sm mb-4">Project Phases</h4>

            <div className="flex items-start gap-0 mb-4">
                {phases.map((p, i) => {
                    const Icon = p.icon;
                    const done = i < completed;
                    const isCurrent = i === active;
                    return (
                        <React.Fragment key={p.label}>
                            {i > 0 && (
                                <div className={`flex-1 h-0.5 mt-3.5 ${i <= completed ? 'bg-emerald-400' : 'bg-neutral-200'}`} />
                            )}
                            <button onClick={() => handleClick(i)} className="flex flex-col items-center gap-1 group">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                                    done ? 'bg-emerald-100' : isCurrent ? 'bg-red-50 ring-2 ring-red-300' : 'bg-neutral-100 group-hover:bg-neutral-200'
                                }`}>
                                    {done
                                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        : <Icon className={`w-3.5 h-3.5 ${isCurrent ? 'text-red-500' : 'text-neutral-400'}`} />
                                    }
                                </div>
                                <span className={`text-[9px] font-bold leading-tight ${
                                    done ? 'text-emerald-600' : isCurrent ? 'text-red-500' : 'text-neutral-400'
                                }`}>{p.label}</span>
                            </button>
                        </React.Fragment>
                    );
                })}
            </div>

            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100 mb-3">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-extrabold text-neutral-800">{phases[active].label}</span>
                    <span className="text-[9px] bg-neutral-200 text-neutral-600 font-bold px-2 py-0.5 rounded-full">
                        {phases[active].duration}
                    </span>
                </div>
                <p className="text-[10px] text-neutral-500 leading-relaxed">{phases[active].desc}</p>
            </div>

            {completed < phases.length ? (
                <button onClick={markDone}
                    className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl transition-all">
                    Complete "{phases[completed].label}" Phase
                </button>
            ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center gap-2 text-emerald-700 text-xs font-extrabold">
                    <CheckCircle2 className="w-4 h-4" /> All Phases Complete!
                </div>
            )}
        </div>
    );
}
