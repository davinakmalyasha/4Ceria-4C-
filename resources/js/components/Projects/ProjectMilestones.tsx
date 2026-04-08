import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Project, ProjectMilestone } from '../../types/project.types';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Plus, Trash2, Calendar, List, LayoutGrid, Info, ChevronDown, ChevronUp } from 'lucide-react';
import ProjectRoadmapGantt from './ProjectRoadmapGantt';

interface Props {
    project: Project;
    user: any;
    isOwnerOrWorker: boolean;
    onUpdate?: () => void;
}

export default function ProjectMilestones({ project, user, isOwnerOrWorker, onUpdate }: Props) {
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
        const canManage = (user?.role_type === 'arsitek' && milestone.arsitek_id === user.arsitek?.id) || 
                         (user?.role_type === 'kontraktor' && milestone.kontraktor_id === user.kontraktor?.id);
        
        if (!canManage) return;
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
        const m = milestones.find(ms => ms.id === id);
        const canManage = (user?.role_type === 'arsitek' && m?.arsitek_id === user.arsitek?.id) || 
                         (user?.role_type === 'kontraktor' && m?.kontraktor_id === user.kontraktor?.id);
        
        if (!canManage) return;
        try {
            await axios.delete(`/projects/${project.id}/milestones/${id}`);
            setMilestones(prev => prev.filter(m => m.id !== id));
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error('Failed to delete milestone', err);
        }
    };

    const archMilestones = milestones.filter(m => m.arsitek_id);
    const contractorMilestones = milestones.filter(m => m.kontraktor_id);
    const generalMilestones = milestones.filter(m => !m.arsitek_id && !m.kontraktor_id);

    const getProgress = (list: ProjectMilestone[]) => {
        if (list.length === 0) return 0;
        return Math.round((list.filter(m => m.is_completed).length / list.length) * 100);
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 p-1 bg-gray-100/50 backdrop-blur-sm rounded-2xl w-fit">
                    <button 
                        onClick={() => setView('list')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <List size={14} /> Side-by-Side View
                    </button>
                    <button 
                        onClick={() => setView('roadmap')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'roadmap' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <LayoutGrid size={14} /> Full Roadmap
                    </button>
                </div>

                {user?.role_type !== 'user' && (
                    <button 
                        onClick={() => setShowAddForm(!showAddForm)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${showAddForm ? 'bg-white border border-gray-200 text-gray-400' : 'bg-gray-900 text-white hover:bg-black shadow-lg shadow-gray-200 active:scale-95'}`}
                    >
                        {showAddForm ? 'Cancel' : <><Plus size={16} strokeWidth={3} /> New Phase</>}
                    </button>
                )}
            </div>

            {/* Compact Progress Summary */}
            <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px] bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Architecture</span>
                        <span className="text-xs font-black text-indigo-600">{getProgress(archMilestones)}%</span>
                    </div>
                    <div className="h-1.5 bg-indigo-100/50 rounded-full overflow-hidden">
                        <motion.div initial={{width:0}} animate={{width: `${getProgress(archMilestones)}%`}} className="h-full bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
                    </div>
                </div>
                <div className="flex-1 min-w-[200px] bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-red-400">Construction</span>
                        <span className="text-xs font-black text-red-600">{getProgress(contractorMilestones)}%</span>
                    </div>
                    <div className="h-1.5 bg-red-100/50 rounded-full overflow-hidden">
                        <motion.div initial={{width:0}} animate={{width: `${getProgress(contractorMilestones)}%`}} className="h-full bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                    </div>
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
                        <form onSubmit={addMilestone} className="bg-white border-2 border-gray-100 rounded-3xl p-6 space-y-4 shadow-xl mb-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Milestone Title</label>
                                <input 
                                    type="text" 
                                    value={title} 
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Enter Phase Title..." 
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-gray-900 outline-none transition-all font-bold text-gray-900"
                                    required
                                />
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                        <Calendar size={10} /> Start Date
                                    </label>
                                    <input 
                                        type="date" 
                                        value={startDate} 
                                        onChange={e => setStartDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none font-bold text-gray-700 text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                        <Calendar size={10} /> Due Date
                                    </label>
                                    <input 
                                        type="date" 
                                        value={dueDate} 
                                        onChange={e => setDueDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none font-bold text-gray-700 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Details</label>
                                <textarea 
                                    value={description} 
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Description of the phase..." 
                                    rows={2}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none font-medium text-gray-600 text-sm resize-none"
                                />
                            </div>

                            <button 
                                type="submit" 
                                disabled={!title.trim() || isLoading}
                                className="w-full px-6 py-4 bg-gray-900 hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-2xl disabled:opacity-50 transition-all shadow-lg"
                            >
                                {isLoading ? 'Saving...' : 'Add Phase'}
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Side-by-Side Milestone Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
                
                {/* ARCHITECTURE COLUMN */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h4 className="font-black text-indigo-900 text-lg flex items-center gap-2">
                            <div className="w-2 h-6 bg-indigo-500 rounded-full"></div>
                            Architecture
                        </h4>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{archMilestones.length} Phases</span>
                    </div>

                    <div className="space-y-3">
                        {archMilestones.length === 0 ? (
                            <div className="py-12 border-2 border-dashed border-indigo-50 rounded-3xl flex flex-col items-center justify-center text-center px-4">
                                <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest">No architecture milestones</p>
                            </div>
                        ) : (
                            archMilestones.map((m, idx) => (
                                <MilestoneCard 
                                    key={m.id} 
                                    milestone={m} 
                                    color="indigo" 
                                    onToggle={() => toggleStatus(m)} 
                                    onDelete={() => deleteMilestone(m.id)}
                                    canManage={(user?.role_type === 'arsitek' && m.arsitek_id === user.arsitek?.id)}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* CONSTRUCTION COLUMN */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h4 className="font-black text-red-900 text-lg flex items-center gap-2">
                            <div className="w-2 h-6 bg-red-500 rounded-full"></div>
                            Construction
                        </h4>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{contractorMilestones.length} Phases</span>
                    </div>

                    <div className="space-y-3">
                        {contractorMilestones.length === 0 ? (
                            <div className="py-12 border-2 border-dashed border-red-50 rounded-3xl flex flex-col items-center justify-center text-center px-4">
                                <p className="text-xs font-bold text-red-300 uppercase tracking-widest">No construction milestones</p>
                            </div>
                        ) : (
                            contractorMilestones.map((m, idx) => (
                                <MilestoneCard 
                                    key={m.id} 
                                    milestone={m} 
                                    color="red" 
                                    onToggle={() => toggleStatus(m)} 
                                    onDelete={() => deleteMilestone(m.id)}
                                    canManage={(user?.role_type === 'kontraktor' && m.kontraktor_id === user.kontraktor?.id)}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* General/Legacy Milestones (if any) */}
            {generalMilestones.length > 0 && (
                <div className="pt-6 border-t border-gray-100/50 mt-2">
                    <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 text-center">Unassigned Milestones</h5>
                    <div className="max-w-2xl mx-auto space-y-3">
                        {generalMilestones.map(m => (
                            <MilestoneCard 
                                key={m.id} 
                                milestone={m} 
                                color="gray" 
                                onToggle={() => toggleStatus(m)} 
                                onDelete={() => deleteMilestone(m.id)}
                                canManage={false} // Unassigned milestones cannot be managed by professionals yet
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-component for individual Milestone Card
function MilestoneCard({ milestone, color, onToggle, onDelete, canManage }: { 
    milestone: ProjectMilestone; 
    color: 'indigo' | 'red' | 'gray'; 
    onToggle: () => void; 
    onDelete: () => void;
    canManage: boolean;
}) {
    const colorClasses = {
        indigo: 'hover:border-indigo-500 hover:shadow-indigo-500/5 text-indigo-500',
        red: 'hover:border-red-500 hover:shadow-red-500/5 text-red-500',
        gray: 'hover:border-gray-500 hover:shadow-gray-500/5 text-gray-500'
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group bg-white border border-gray-100 p-4 rounded-2xl shadow-sm transition-all ${colorClasses[color]}`}
        >
            <div className="flex items-start gap-3">
                <button 
                    onClick={onToggle}
                    disabled={!canManage}
                    title={!canManage ? "Managed by Professional" : ""}
                    className={`mt-1 transition-transform active:scale-90 ${milestone.is_completed ? 'text-emerald-500' : 'text-gray-200 group-hover:text-gray-400'} ${!canManage ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                    {milestone.is_completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                </button>
                <div className="flex-1 min-w-0">
                    <h5 className={`font-black text-sm tracking-tight leading-tight ${milestone.is_completed ? 'text-gray-300 line-through' : 'text-gray-800'}`}>
                        {milestone.title}
                    </h5>
                    <div className="flex items-center gap-2 mt-1">
                        {milestone.due_date && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                                <Calendar size={10} /> {new Date(milestone.due_date).toLocaleDateString()}
                            </span>
                        )}
                        {milestone.is_completed && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Completed</span>
                        )}
                    </div>
                    {milestone.description && (
                        <p className="mt-2 text-xs text-gray-500 line-clamp-2 font-medium opacity-70 group-hover:opacity-100 transition-opacity">
                            {milestone.description}
                        </p>
                    )}
                </div>
                {canManage && (
                    <button 
                        onClick={onDelete}
                        className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 bg-gray-50 rounded-lg transition-all"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>
        </motion.div>
    );
}

