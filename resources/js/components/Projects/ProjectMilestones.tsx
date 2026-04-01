import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Project, ProjectMilestone } from '../../types/project.types';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';

interface Props {
    project: Project;
    isOwnerOrWorker: boolean;
}

export default function ProjectMilestones({ project, isOwnerOrWorker }: Props) {
    const [milestones, setMilestones] = useState<ProjectMilestone[]>(project.milestones || []);
    const [newTask, setNewTask] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setMilestones(project.milestones || []);
    }, [project.milestones]);

    const addMilestone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTask.trim() || isLoading) return;
        setIsLoading(true);
        try {
            const res = await axios.post(`/projects/${project.id}/milestones`, { title: newTask });
            setMilestones([...milestones, res.data.data]);
            setNewTask('');
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
            await axios.put(`/milestones/${milestone.id}`, { is_completed: newStatus });
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
        } catch (err) {
            console.error('Failed to delete milestone', err);
        }
    };

    const completedCount = milestones.filter(m => m.is_completed).length;
    const progressPerc = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h4 className="font-bold text-gray-900 text-lg">Project Progress</h4>
                        <p className="text-sm text-gray-500">{completedCount} of {milestones.length} tasks completed</p>
                    </div>
                    <span className="text-2xl font-extrabold text-[#FF2D20]">{progressPerc}%</span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }} 
                        animate={{ width: `${progressPerc}%` }} 
                        className="h-full bg-gradient-to-r from-red-500 to-[#FF2D20]"
                    />
                </div>
            </div>

            {isOwnerOrWorker && (
                <form onSubmit={addMilestone} className="flex gap-3">
                    <input 
                        type="text" 
                        value={newTask} 
                        onChange={e => setNewTask(e.target.value)}
                        placeholder="Add a new project milestone..." 
                        className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#FF2D20]/50 outline-none"
                    />
                    <button 
                        type="submit" 
                        disabled={!newTask.trim() || isLoading}
                        className="px-6 py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-xl disabled:opacity-50 flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-5 h-5" /> Add
                    </button>
                </form>
            )}

            <div className="space-y-3">
                {milestones.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No milestones have been created yet.</p>
                ) : (
                    milestones.map((m) => (
                        <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors group">
                            <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleStatus(m)}>
                                <button className={`flex-shrink-0 transition-colors ${m.is_completed ? 'text-emerald-500' : 'text-gray-300 hover:text-gray-400'}`}>
                                    {m.is_completed ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                                </button>
                                <span className={`font-medium ${m.is_completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                    {m.title}
                                </span>
                            </div>
                            {isOwnerOrWorker && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); deleteMilestone(m.id); }}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 self-end sm:self-auto mt-2 sm:mt-0"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
