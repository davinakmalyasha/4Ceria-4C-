import React from 'react';
import { 
    Activity, Clock, CheckCircle2, 
    AlertTriangle, TrendingUp, BarChart3 
} from 'lucide-react';

interface ConstructionProgressStatsProps {
    project: any;
}

export default function ConstructionProgressStats({ project }: ConstructionProgressStatsProps) {
    // These would ideally come from a real analytics endpoint, but for now we derive from project state
    const stats = [
        { label: 'Work Days', value: '42', sub: 'of 120 days', icon: Clock, color: 'text-slate-500', bg: 'bg-slate-50' },
        { label: 'Completion', value: '35%', sub: 'On Schedule', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        { label: 'Milestones', value: '4/12', sub: 'Next: Slab Pouring', icon: CheckCircle2, color: 'text-purple-500', bg: 'bg-purple-50' },
        { label: 'Safety', value: '100%', sub: 'Zero Incidents', icon: Activity, color: 'text-amber-500', bg: 'bg-amber-50' },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                        <div key={idx} className="bg-white border border-slate-100 p-5 rounded-[1.5rem] hover:shadow-lg transition-all group">
                            <div className={`${stat.bg} ${stat.color} w-10 h-10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                                <Icon size={20} />
                            </div>
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</h5>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-xl font-black text-slate-900">{stat.value}</span>
                                <span className="text-[9px] font-bold text-slate-400 truncate">{stat.sub}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Visual Chart Placeholder */}
            <div className="bg-slate-900 rounded-[2rem] p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <BarChart3 size={120} className="text-white" />
                </div>
                <div className="relative z-10">
                    <h4 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp size={18} className="text-emerald-400" />
                        S-Curve Projection
                    </h4>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mt-1">Planned vs Actual Progress</p>
                    
                    <div className="mt-8 h-32 flex items-end gap-1">
                        {[40, 45, 42, 48, 55, 60, 58, 65, 75, 80, 85, 90].map((h, i) => (
                            <div key={i} className="flex-1 group relative">
                                <div 
                                    className="w-full bg-white/10 rounded-t-lg group-hover:bg-emerald-500/50 transition-all cursor-pointer" 
                                    style={{ height: `${h}%` }}
                                />
                                <div 
                                    className="absolute bottom-0 w-full bg-emerald-500 rounded-t-lg opacity-80" 
                                    style={{ height: `${h * 0.7}%` }}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-4">
                        <span className="text-[8px] font-black text-slate-500 uppercase">Jan</span>
                        <span className="text-[8px] font-black text-slate-500 uppercase">Jun</span>
                        <span className="text-[8px] font-black text-slate-500 uppercase">Dec</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
