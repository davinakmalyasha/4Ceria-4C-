import React, { useState } from 'react';
import { Calendar, Clock, CheckSquare } from 'lucide-react';

interface Task { day: number; row: number; label: string; time: string; color: string; bg: string }

const TASKS: Task[] = [
    { day: 0, row: 0, label: 'Design Review', time: '09:00 - 11:00', color: 'text-blue-700', bg: 'bg-blue-100' },
    { day: 2, row: 0, label: 'Site Inspection', time: '13:00 - 15:00', color: 'text-amber-700', bg: 'bg-amber-100' },
    { day: 4, row: 0, label: 'Client Meeting', time: '10:00 - 11:30', color: 'text-red-700', bg: 'bg-red-100' },
    { day: 1, row: 1, label: 'Material Check', time: '08:00 - 09:00', color: 'text-emerald-700', bg: 'bg-emerald-100' },
    { day: 3, row: 1, label: 'Progress Report', time: '14:00 - 16:00', color: 'text-purple-700', bg: 'bg-purple-100' },
    { day: 0, row: 2, label: 'Safety Audit', time: '09:00 - 10:00', color: 'text-rose-700', bg: 'bg-rose-100' },
    { day: 4, row: 2, label: 'Budget Review', time: '15:00 - 17:00', color: 'text-sky-700', bg: 'bg-sky-100' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const WEEKS = ['Week 1', 'Week 2', 'Week 3'];

export default function PMScheduleWidget() {
    const [selected, setSelected] = useState<Task | null>(null);

    const getTask = (day: number, row: number): Task | undefined =>
        TASKS.find(t => t.day === day && t.row === row);

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-red-500" />
                    <h4 className="font-extrabold text-neutral-800 text-sm">PM Schedule</h4>
                </div>
                <span className="text-[10px] bg-red-50 text-red-500 font-extrabold px-2 py-0.5 rounded-full">
                    June 2026
                </span>
            </div>

            {/* Header */}
            <div className="grid grid-cols-6 gap-1 mb-1">
                <div className="text-[9px] text-neutral-400 font-bold" />
                {DAYS.map(d => <div key={d} className="text-[9px] text-neutral-400 font-bold text-center">{d}</div>)}
            </div>

            {/* Grid */}
            <div className="space-y-1 mb-3">
                {WEEKS.map((week, row) => (
                    <div key={week} className="grid grid-cols-6 gap-1">
                        <div className="text-[8px] text-neutral-400 font-bold flex items-center">{week}</div>
                        {DAYS.map((_, day) => {
                            const task = getTask(day, row);
                            return (
                                <button
                                    key={day}
                                    onClick={() => task && setSelected(selected?.label === task.label ? null : task)}
                                    className={`h-7 rounded-lg text-[8px] font-bold transition-all truncate px-0.5 ${
                                        task ? `${task.bg} ${task.color} hover:ring-2 hover:ring-offset-1 hover:ring-neutral-300 cursor-pointer` : 'bg-neutral-50 border border-neutral-100'
                                    } ${selected?.label === task?.label ? 'ring-2 ring-neutral-400' : ''}`}
                                >
                                    {task ? task.label.split(' ')[0] : ''}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Detail */}
            {selected ? (
                <div className={`p-3 ${selected.bg} rounded-xl border border-neutral-100 transition-all`}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <CheckSquare className={`w-3.5 h-3.5 ${selected.color}`} />
                        <span className={`text-xs font-extrabold ${selected.color}`}>{selected.label}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-neutral-500">
                        <Clock className="w-3 h-3" /> {selected.time}
                    </div>
                </div>
            ) : (
                <p className="text-[10px] text-neutral-400 text-center">Click a task block to view details</p>
            )}
        </div>
    );
}
