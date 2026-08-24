import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Truck, Package, Calendar, CheckCircle2, Circle, Info } from 'lucide-react';
import { Project, ProjectMilestone, MaterialOrder } from '../../types/project.types';

interface Props {
    project: Project;
    milestones: ProjectMilestone[];
    materialOrders: MaterialOrder[];
}

export default function ProjectRoadmapGantt({ project, milestones, materialOrders }: Props) {
    // 1. Calculate the timeline range
    const timelineData = useMemo(() => {
        const allDates: Date[] = [];
        
        milestones.forEach(m => {
            if (m.start_date) allDates.push(new Date(m.start_date));
            if (m.due_date) allDates.push(new Date(m.due_date));
        });

        materialOrders.forEach(o => {
            allDates.push(new Date(o.created_at));
            if (o.delivered_at) allDates.push(new Date(o.delivered_at));
            if (o.delivery_job?.delivery_time) allDates.push(new Date(o.delivery_job.delivery_time));
        });

        if (allDates.length === 0) {
            // Default range if no dates exist: Today +/- 7 days
            const today = new Date();
            const start = new Date(today);
            start.setDate(today.getDate() - 2);
            const end = new Date(today);
            end.setDate(today.getDate() + 12);
            return { start, end, totalDays: 14 };
        }

        const start = new Date(Math.min(...allDates.map(d => d.getTime())));
        start.setDate(start.getDate() - 1); // Buffer 1 day
        
        const end = new Date(Math.max(...allDates.map(d => d.getTime())));
        end.setDate(end.getDate() + 3); // Buffer 3 days

        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        
        return { start, end, totalDays };
    }, [milestones, materialOrders]);

    const getPosition = (dateStr: string | null | undefined) => {
        if (!dateStr) return 0;
        const date = new Date(dateStr);
        const diff = date.getTime() - timelineData.start.getTime();
        return (diff / (timelineData.end.getTime() - timelineData.start.getTime())) * 100;
    };

    const getWidth = (startDateStr: string | null | undefined, endDateStr: string | null | undefined) => {
        if (!startDateStr || !endDateStr) return '100px'; // Failsafe
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        const diff = end.getTime() - start.getTime();
        return `${(diff / (timelineData.end.getTime() - timelineData.start.getTime())) * 100}%`;
    };

    // Generate day ticks for the top axis
    const ticks = Array.from({ length: Math.min(timelineData.totalDays, 60) }).map((_, i) => {
        const date = new Date(timelineData.start);
        date.setDate(date.getDate() + i);
        return {
            date,
            isToday: date.toDateString() === new Date().toDateString(),
            label: date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        };
    });

    return (
        <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm flex flex-col">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Calendar className="text-red-500 w-5 h-5" /> Visual Project Roadmap
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mt-1">Unified view of construction phases & material logistics.</p>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/40"></div> Construction
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-slate-500/20 border border-slate-500/40"></div> Logistics
                    </div>
                </div>
            </div>

            <div className="relative overflow-x-auto overflow-y-hidden pb-8 pt-12 min-h-[400px]">
                {/* Timeline Grid Background */}
                <div 
                    className="absolute inset-0 flex"
                    style={{ width: `${Math.max(100, timelineData.totalDays * 8)}%`, minWidth: '100%' }}
                >
                    {ticks.map((tick, i) => (
                        <div 
                            key={i} 
                            className={`flex-1 border-l border-gray-100 relative h-full`}
                        >
                            <span className={`absolute top-[-30px] left-1 text-[9px] font-black uppercase tracking-tight ${tick.isToday ? 'text-red-500' : 'text-gray-400'}`}>
                                {tick.label}
                            </span>
                            {tick.isToday && (
                                <div className="absolute inset-y-0 left-0 w-0.5 bg-red-500/30 z-10">
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 rounded-full bg-red-500 shadow-sm" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Milestones (Gantt Bars) */}
                <div 
                    className="relative z-20 space-y-8 px-4"
                    style={{ width: `${Math.max(100, timelineData.totalDays * 8)}%`, minWidth: '100%' }}
                >
                    {milestones.length === 0 ? (
                        <div className="h-20 flex items-center justify-center">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-full border border-gray-100">No dated milestones found</p>
                        </div>
                    ) : (
                        milestones.map((m, i) => {
                            const hasDates = m.start_date && m.due_date;
                            const left = hasDates ? getPosition(m.start_date) : 0;
                            const width = hasDates ? getWidth(m.start_date, m.due_date) : '150px';

                            return (
                                <div key={m.id} className="relative h-12 flex items-center">
                                    {/* Task Name Label (Floating) */}
                                    <div 
                                        className="absolute top-[-20px] text-[10px] font-black text-gray-600 truncate flex items-center gap-1.5"
                                        style={{ left: `${left}%` }}
                                    >
                                        {m.is_completed ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Circle size={12} className="text-gray-300" />}
                                        {m.title}
                                    </div>

                                    {/* Bar */}
                                    <motion.div
                                        initial={{ opacity: 0, scaleX: 0 }}
                                        animate={{ opacity: 1, scaleX: 1 }}
                                        transition={{ delay: i * 0.1 }}
                                        style={{ 
                                            left: `${left}%`, 
                                            width,
                                            transformOrigin: 'left'
                                        }}
                                        className={`absolute h-8 rounded-xl border-2 flex items-center px-3 shadow-sm ${
                                            m.is_completed 
                                                ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                                                : 'bg-red-50 border-red-100 text-red-700'
                                        } transition-all hover:shadow-md hover:scale-[1.02] cursor-default`}
                                    >
                                        <span className="text-[10px] font-black uppercase tracking-widest truncate">
                                            {m.is_completed ? 'Finished' : 'In Progress'}
                                        </span>
                                    </motion.div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Logistics Section Divider */}
                <div className="my-12 px-8">
                    <div className="h-px bg-gray-100 w-full relative">
                        <span className="absolute left-0 -top-2 bg-white pr-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            Procurement & Logistics Timeline
                        </span>
                    </div>
                </div>

                {/* Material Deliveries (Timeline Events) */}
                <div 
                    className="relative z-20 px-8 h-24"
                    style={{ width: `${Math.max(100, timelineData.totalDays * 8)}%`, minWidth: '100%' }}
                >
                    {materialOrders.map((order, i) => {
                        const deliveryDate = order.delivery_job?.delivery_time || order.delivered_at || order.created_at;
                        const left = getPosition(deliveryDate);
                        const isDelivered = order.status === 'delivered' || order.status === 'completed';

                        return (
                            <motion.div
                                key={order.id}
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5 + i * 0.05 }}
                                className="absolute top-0 group"
                                style={{ left: `${left}%` }}
                            >
                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50">
                                    <div className="bg-gray-900 text-white p-3 rounded-2xl shadow-xl text-[10px] min-w-[150px]">
                                        <p className="font-black text-red-400 uppercase mb-1">Order #{order.id}</p>
                                        <p className="font-bold opacity-80 mb-2">{isDelivered ? 'Delivered' : 'In Transit'}</p>
                                        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                                            <Package size={12} className="text-gray-400" />
                                            <span className="font-medium text-gray-300">Material Supply</span>
                                        </div>
                                    </div>
                                    <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1 shadow-xl" />
                                </div>

                                {/* Pin Marker */}
                                <div className="flex flex-col items-center">
                                    <div className={`w-8 h-8 rounded-2xl flex items-center justify-center border-2 shadow-lg transition-all transform group-hover:scale-125 group-hover:-translate-y-2 ${
                                        isDelivered 
                                            ? 'bg-emerald-500 border-emerald-300 text-white ring-4 ring-emerald-500/10' 
                                            : 'bg-zinc-900 border-slate-400 text-white ring-4 ring-slate-600/10'
                                    }`}>
                                        <Truck size={14} strokeWidth={2.5} />
                                    </div>
                                    <div className={`w-px h-12 dashed-border mt-2 ${isDelivered ? 'bg-emerald-500/40' : 'bg-slate-500/40'}`} />
                                    <span className="text-[9px] font-black text-gray-500 mt-1 uppercase whitespace-nowrap">
                                        {new Date(deliveryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                    </span>
                                </div>
                            </motion.div>
                        );
                    })}

                    {materialOrders.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full opacity-30 italic text-xs text-gray-400 font-bold uppercase tracking-widest">
                            <Truck size={24} className="mb-2" /> No logistics tracked for this project
                        </div>
                    )}
                </div>
            </div>

            {/* Footer / Legend */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center gap-6 justify-center">
               <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-gray-200 text-[10px] font-bold text-gray-500">
                    <Info size={12} className="text-red-500" /> Hover over truck icons for delivery details
               </div>
               <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-gray-200 text-[10px] font-bold text-gray-500">
                    <CheckCircle2 size={12} className="text-emerald-500" /> Completed milestones are highlighted in green
               </div>
            </div>
        </div>
    );
}
