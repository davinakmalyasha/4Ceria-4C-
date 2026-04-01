import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Project, STATUS_CONFIG } from '../../types/project.types';
import ProjectCard from './ProjectCard';

const COLUMNS = [
    { id: 'open', title: 'Open For Bidding', color: 'bg-emerald-500', bg: 'bg-emerald-50/50', border: 'border-emerald-200' },
    { id: 'in_progress', title: 'In Progress', color: 'bg-amber-500', bg: 'bg-amber-50/50', border: 'border-amber-200' },
    { id: 'completed', title: 'Completed', color: 'bg-blue-500', bg: 'bg-blue-50/50', border: 'border-blue-200' },
];

interface KanbanProps {
    projects: Project[];
    onStatusChange: (projectId: number, newStatus: string) => void;
    onViewProject: (project: Project) => void;
    onEditProject?: (project: Project) => void;
    onDeleteProject?: (project: Project) => void;
    userRole?: string;
}

export default function ProjectKanban({ 
    projects, onStatusChange, onViewProject, onEditProject, onDeleteProject, userRole 
}: KanbanProps) {
    const [draggedProjectId, setDraggedProjectId] = useState<number | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent, projectId: number) => {
        setDraggedProjectId(projectId);
        e.dataTransfer.effectAllowed = 'move';
        // Required for Firefox
        e.dataTransfer.setData('text/plain', projectId.toString());
    };

    const handleDragOver = (e: React.DragEvent, colId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverColumn !== colId) {
            setDragOverColumn(colId);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        setDragOverColumn(null);
    };

    const handleDrop = (e: React.DragEvent, colId: string) => {
        e.preventDefault();
        setDragOverColumn(null);
        if (draggedProjectId !== null) {
            const project = projects.find(p => p.id === draggedProjectId);
            if (project && project.status !== colId) {
                onStatusChange(draggedProjectId, colId);
            }
        }
        setDraggedProjectId(null);
    };

    return (
        <div className="flex gap-6 overflow-x-auto pb-6 pt-2 snap-x w-full min-h-[600px] items-start">
            {COLUMNS.map(column => {
                const columnProjects = projects.filter(p => p.status === column.id);
                const isDragOver = dragOverColumn === column.id;
                
                return (
                    <div 
                        key={column.id}
                        className={`flex flex-col flex-none w-[350px] lg:w-[400px] snap-center rounded-2xl border-2 transition-colors ${
                            isDragOver ? `${column.border} bg-gray-50/80` : `border-transparent ${column.bg}`
                        }`}
                        onDragOver={(e) => handleDragOver(e, column.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, column.id)}
                    >
                        {/* Column Header */}
                        <div className="p-4 flex items-center justify-between border-b border-gray-200/50 bg-white/50 rounded-t-2xl">
                            <div className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${column.color}`} />
                                <h3 className="font-black text-gray-800 tracking-tight">{column.title}</h3>
                            </div>
                            <span className="bg-white text-gray-600 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm">
                                {columnProjects.length}
                            </span>
                        </div>

                        {/* Column Body */}
                        <div className="p-3 flex flex-col gap-4 min-h-[200px]">
                            <AnimatePresence>
                                {columnProjects.map(project => (
                                    <motion.div
                                        key={project.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.2 }}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e as any, project.id)}
                                        onDragEnd={() => setDraggedProjectId(null)}
                                        className={`cursor-grab active:cursor-grabbing ${draggedProjectId === project.id ? 'opacity-50 scale-95' : ''}`}
                                    >
                                        <ProjectCard 
                                            project={project}
                                            onClick={() => onViewProject(project)}
                                            onEdit={onEditProject}
                                            onDelete={onDeleteProject}
                                            userRole={userRole}
                                            viewMode="grid"
                                        />
                                    </motion.div>
                                ))}
                                {columnProjects.length === 0 && (
                                    <div className="h-24 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-sm font-semibold text-gray-400">
                                        Drop projects here
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
