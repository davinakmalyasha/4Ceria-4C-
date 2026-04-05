import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Project, ProjectMilestone } from '../../types/project.types';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Plus, Trash2, Calendar, List, LayoutGrid, Info, ChevronDown, ChevronUp } from 'lucide-react';
import ProjectRoadmapGantt from './ProjectRoadmapGantt';

interface Props {
    project: Project;
    isOwnerOrWorker: boolean;
    onUpdate?: () => void;
}

export default function ProjectMilestones({ project, isOwnerOrWorker, onUpdate }: Props) {
    const [milestones, setMilestones] = useState<ProjectMilestone[]>(project.milestones || []);
    const [view, setView] = useState<'list' | 'roadmap'>('list');
    const [isLoading, setIsLoading] = useState(false);
    
    // Form States
    const [showAddForm, setShowAddForm] = useState(false);
    const [title, setTitle] = useState('');
    const [startDate, setStartDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        setMilestones(project.milestones || []);
    }, [project.milestones]);

    const addMilestone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || isLoading) return;
        setIsLoading(true);
        try {
            const res = await axios.post(`/projects/${project.id}/milestones`, { 
                title,
                start_date: startDate || null,
                due_date: dueDate || null,
                description: description || null
            });
            setMilestones([...milestones, res.data.data]);
            setTitle('');
            setStartDate('');
            setDueDate('');
            setDescription('');
            setShowAddForm(false);
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error('Failed to add milestone', err);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleStatus = async (milestone: ProjectMilestone) => {
        if (!isOwnerOrWorker) return;
        const newStatus = !milestone.is_completed;
        
        // Optimistic UI update
        setMilestones(prev => prev.map(m => m.id === milestone.id ? { ...m, is_completed: newStatus } : m));

        try {
            await axios.put(`/projects/${project.id}/milestones/${milestone.id}`, { is_completed: newStatus });
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error('Failed to update milestone', err);
            // Revert
            setMilestones(prev => prev.map(m => m.id === milestone.id ? { ...m, is_completed: milestone.is_completed } : m));
        }
    };

    const deleteMilestone = async (id: number) => {
        if (!isOwnerOrWorker) return;
        try {
            await axios.delete(`/projects/${project.id}/milestones/${id}`);
            setMilestones(prev => prev.filter(m => m.id !== id));
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error('Failed to delete milestone', err);
        }
    };

    const completedCount = milestones.filter(m => m.is_completed).length;
    const progressPerc = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

    return (
        <div className="space-y-6 pb-12">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-2xl w-fit">
                    <button 
                        onClick={() => setView('list')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <List size={14} /> List View
                    </button>
                    <button 
                        onClick={() => setView('roadmap')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'roadmap' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <LayoutGrid size={14} /> Visual Roadmap
                    </button>
                </div>

                {isOwnerOrWorker && (
                    <button 
                        onClick={() => setShowAddForm(!showAddForm)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${showAddForm ? 'bg-white border border-gray-200 text-gray-400' : 'bg-gray-900 text-white hover:bg-black shadow-lg shadow-gray-200 active:scale-95'}`}
                    >
                        {showAddForm ? 'Cancel' : <><Plus size={16} strokeWidth={3} /> Add Milestone</>}
                    </button>
                )}
            </div>

            {/* Progress Card */}
            <div className="bg-white p-6 rounded-3xl border-2 border-gray-100 shadow-sm">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <h4 className="font-black text-gray-900 text-xl tracking-tight">Project Momentum</h4>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
                            {completedCount} of {milestones.length} phases completed
                        </p>
                    </div>
                    <div className="text-right">
                        <span className="text-3xl font-black text-red-600 tracking-tighter">{progressPerc}%</span>
                    </div>
                </div>
                <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden p-1 border border-gray-50">
                    <motion.div 
                        initial={{ width: 0 }} 
                        animate={{ width: `${progressPerc}%` }} 
                        className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                    />
                </div>
            </div>

            {/* Add Milestone Form */}
            <AnimatePresence>
                {showAddForm && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <form onSubmit={addMilestone} className="bg-white border-2 border-red-100 rounded-3xl p-6 space-y-4 shadow-xl shadow-red-50/50">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Milestone Title</label>
                                <input 
                                    type="text" 
                                    value={title} 
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Phase name (e.g. Foundation Pouring)" 
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-bold text-gray-900"
                                    required
                                />
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                        <Calendar size={10} /> Planned Start
                                    </label>
                                    <input 
                                        type="date" 
                                        value={startDate} 
                                        onChange={e => setStartDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-red-500 outline-none transition-all font-bold text-gray-700 text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                        <Calendar size={10} /> Expected Completion
                                    </label>
                                    <input 
                                        type="date" 
                                        value={dueDate} 
                                        onChange={e => setDueDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-red-500 outline-none transition-all font-bold text-gray-700 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Description (Optional)</label>
                                <textarea 
                                    value={description} 
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="What exactly will be done in this phase?" 
                                    rows={2}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-red-500 outline-none transition-all font-medium text-gray-600 text-sm resize-none"
                                />
                            </div>

                            <button 
                                type="submit" 
                                disabled={!title.trim() || isLoading}
                                className="w-full px-6 py-4 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-100"
                            >
                                {isLoading ? 'Creating Milestone...' : <><Plus size={16} strokeWidth={3} /> Create Detailed Milestone</>}
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Views */}
            <div className="min-h-[300px]">
                {view === 'roadmap' ? (
                    <ProjectRoadmapGantt 
                        project={project} 
                        milestones={milestones}
                        materialOrders={project.material_orders || []}
                    />
                ) : (
                    <div className="space-y-3">
                        {milestones.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white border-2 border-dashed border-gray-100 rounded-3xl">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                    <List className="text-gray-300" size={32} />
                                </div>
                                <h5 className="font-black text-gray-900 tracking-tight">No milestones yet</h5>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Break your project down into actionable phases.</p>
                            </div>
                        ) : (
                            milestones.map((m, idx) => (
                                <motion.div 
                                    key={m.id} 
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="group relative bg-white border border-gray-200 rounded-2xl p-5 hover:border-red-500 hover:shadow-xl hover:shadow-red-500/5 transition-all overflow-hidden"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4 cursor-pointer flex-1" onClick={() => toggleStatus(m)}>
                                            <button className={`mt-1 flex-shrink-0 transition-all transform hover:scale-110 ${m.is_completed ? 'text-emerald-500' : 'text-gray-200 group-hover:text-red-300'}`}>
                                                {m.is_completed ? <CheckCircle2 className="w-7 h-7" /> : <Circle className="w-7 h-7" />}
                                            </button>
                                            <div className="flex-1">
                                                <h5 className={`font-black tracking-tight text-lg ${m.is_completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                                    {m.title}
                                                </h5>
                                                {(m.start_date || m.due_date) && (
                                                    <div className="flex items-center gap-3 mt-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                        {m.start_date && <span>Start: {new Date(m.start_date).toLocaleDateString()}</span>}
                                                        {m.due_date && <span className="text-red-500/60">• Due: {new Date(m.due_date).toLocaleDateString()}</span>}
                                                    </div>
                                                )}
                                                {m.description && (
                                                    <p className="text-sm text-gray-500 mt-2 font-medium leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">
                                                        {m.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {isOwnerOrWorker && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); deleteMilestone(m.id); }}
                                                className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 active:scale-90"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Completion Glow Bar */}
                                    {m.is_completed && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>}
                                </motion.div>
                            ))
                        )}
                    </div>
                )}
            </div>
            
            {/* Legend / Tips */}
            <div className="mt-8 flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div> Construction</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Logistics</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Done</div>
            </div>
        </div>
    );
}

