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
                         (user?.role_type === 'kontraktor' && milestone.kontraktor_id === user.kontraktor?.id) ||
                         (user?.role_type === 'notaris' && milestone.notaris_id === user.notaris_profile?.id) ||
                         (user?.role_type === 'interior' && milestone.interior_id === user.interior_profile?.id) ||
                         (user?.role_type === 'project_manager' && milestone.pm_id === user.project_manager?.id);
        
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
                         (user?.role_type === 'kontraktor' && m?.kontraktor_id === user.kontraktor?.id) ||
                         (user?.role_type === 'notaris' && m?.notaris_id === user.notaris_profile?.id) ||
                         (user?.role_type === 'interior' && m?.interior_id === user.interior_profile?.id) ||
                         (user?.role_type === 'project_manager' && m?.pm_id === user.project_manager?.id);
        
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
    const notaryMilestones = milestones.filter(m => m.notaris_id);
    const interiorMilestones = milestones.filter(m => m.interior_id);
    const pmMilestones = milestones.filter(m => m.pm_id);
    const generalMilestones = milestones.filter(m => !m.arsitek_id && !m.kontraktor_id && !m.notaris_id && !m.interior_id && !m.pm_id);

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
                        <List size={14} /> Grid View
                    </button>
                    <button 
                        onClick={() => setView('roadmap')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'roadmap' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <LayoutGrid size={14} /> Timeline
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">Arch</span>
                        <span className="text-xs font-black text-blue-600">{getProgress(archMilestones)}%</span>
                    </div>
                    <div className="h-1.5 bg-blue-100/50 rounded-full overflow-hidden">
                        <motion.div initial={{width:0}} animate={{width: `${getProgress(archMilestones)}%`}} className="h-full bg-blue-500 rounded-full" />
                    </div>
                </div>
                <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-red-400">Const</span>
                        <span className="text-xs font-black text-red-600">{getProgress(contractorMilestones)}%</span>
                    </div>
                    <div className="h-1.5 bg-red-100/50 rounded-full overflow-hidden">
                        <motion.div initial={{width:0}} animate={{width: `${getProgress(contractorMilestones)}%`}} className="h-full bg-red-500 rounded-full" />
                    </div>
                </div>
                <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Legal</span>
                        <span className="text-xs font-black text-indigo-600">{getProgress(notaryMilestones)}%</span>
                    </div>
                    <div className="h-1.5 bg-indigo-100/50 rounded-full overflow-hidden">
                        <motion.div initial={{width:0}} animate={{width: `${getProgress(notaryMilestones)}%`}} className="h-full bg-indigo-500 rounded-full" />
                    </div>
                </div>
                <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-purple-400">Interior</span>
                        <span className="text-xs font-black text-purple-600">{getProgress(interiorMilestones)}%</span>
                    </div>
                    <div className="h-1.5 bg-purple-100/50 rounded-full overflow-hidden">
                        <motion.div initial={{width:0}} animate={{width: `${getProgress(interiorMilestones)}%`}} className="h-full bg-purple-500 rounded-full" />
                    </div>
                </div>
                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">PM</span>
                        <span className="text-xs font-black text-emerald-600">{getProgress(pmMilestones)}%</span>
                    </div>
                    <div className="h-1.5 bg-emerald-100/50 rounded-full overflow-hidden">
                        <motion.div initial={{width:0}} animate={{width: `${getProgress(pmMilestones)}%`}} className="h-full bg-emerald-500 rounded-full" />
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

            {/* Grid View for Milestones */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                
                {/* ARCHITECTURE */}
                <div className="space-y-4">
                    <h4 className="font-black text-blue-900 text-sm flex items-center gap-2 px-2">
                        <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div> Arch
                    </h4>
                    <div className="space-y-3">
                        {archMilestones.map(m => (
                            <MilestoneCard 
                                key={m.id} milestone={m} color="blue" 
                                onToggle={() => toggleStatus(m)} 
                                onDelete={() => deleteMilestone(m.id)}
                                canManage={(user?.role_type === 'arsitek' && m.arsitek_id === user.arsitek?.id)}
                            />
                        ))}
                    </div>
                </div>

                {/* CONSTRUCTION */}
                <div className="space-y-4">
                    <h4 className="font-black text-red-900 text-sm flex items-center gap-2 px-2">
                        <div className="w-1.5 h-4 bg-red-500 rounded-full"></div> Const
                    </h4>
                    <div className="space-y-3">
                        {contractorMilestones.map(m => (
                            <MilestoneCard 
                                key={m.id} milestone={m} color="red" 
                                onToggle={() => toggleStatus(m)} 
                                onDelete={() => deleteMilestone(m.id)}
                                canManage={(user?.role_type === 'kontraktor' && m.kontraktor_id === user.kontraktor?.id)}
                            />
                        ))}
                    </div>
                </div>

                {/* LEGAL */}
                <div className="space-y-4">
                    <h4 className="font-black text-indigo-900 text-sm flex items-center gap-2 px-2">
                        <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div> Legal
                    </h4>
                    <div className="space-y-3">
                        {notaryMilestones.map(m => (
                            <MilestoneCard 
                                key={m.id} milestone={m} color="indigo" 
                                onToggle={() => toggleStatus(m)} 
                                onDelete={() => deleteMilestone(m.id)}
                                canManage={(user?.role_type === 'notaris' && m.notaris_id === user.notaris_profile?.id)}
                            />
                        ))}
                    </div>
                </div>

                {/* INTERIOR */}
                <div className="space-y-4">
                    <h4 className="font-black text-purple-900 text-sm flex items-center gap-2 px-2">
                        <div className="w-1.5 h-4 bg-purple-500 rounded-full"></div> Interior
                    </h4>
                    <div className="space-y-3">
                        {interiorMilestones.map(m => (
                            <MilestoneCard 
                                key={m.id} milestone={m} color="purple" 
                                onToggle={() => toggleStatus(m)} 
                                onDelete={() => deleteMilestone(m.id)}
                                canManage={(user?.role_type === 'interior' && m.interior_id === user.interior_profile?.id)}
                            />
                        ))}
                    </div>
                </div>

                {/* PROJECT MANAGER */}
                <div className="space-y-4">
                    <h4 className="font-black text-emerald-900 text-sm flex items-center gap-2 px-2">
                        <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div> PM
                    </h4>
                    <div className="space-y-3">
                        {pmMilestones.map(m => (
                            <MilestoneCard 
                                key={m.id} milestone={m} color="emerald" 
                                onToggle={() => toggleStatus(m)} 
                                onDelete={() => deleteMilestone(m.id)}
                                canManage={(user?.role_type === 'project_manager' && m.pm_id === user.project_manager?.id)}
                            />
                        ))}
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
        emerald: 'hover:border-emerald-500 hover:shadow-emerald-500/5 text-emerald-500',
        purple: 'hover:border-purple-500 hover:shadow-purple-500/5 text-purple-500',
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

