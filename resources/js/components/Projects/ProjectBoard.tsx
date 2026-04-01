import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Project } from '../../types/project.types';
import { useProjectFilters } from '../../hooks/useProjectFilters';
import ProjectToolbar from './ProjectToolbar';
import ProjectCard, { ProjectCardSkeleton } from './ProjectCard';
import ProjectEmptyState from './ProjectEmptyState';
import ProjectStatsDashboard from './ProjectStatsDashboard';
import ProjectKanban from './ProjectKanban';

interface ProjectBoardProps {
    projects: Project[];
    isLoading: boolean;
    onViewProject: (project: Project) => void;
    userRole?: string;
    onPostProject?: () => void;
    onEditProject?: (project: Project) => void;
    onDeleteProject?: (project: Project) => void;
    onStatusChange?: (projectId: number, newStatus: string) => void;
}

export default function ProjectBoard({ 
    projects, isLoading, userRole, onViewProject, onPostProject, onEditProject, onDeleteProject, onStatusChange 
}: ProjectBoardProps) {
    
    const {
        search, setSearch,
        statusFilter, setStatusFilter,
        sortBy, setSortBy,
        viewMode, setViewMode,
        visibleCount, setVisibleCount,
        hasMore, loadMore,
        filteredProjects,
        totalCount,
        stats
    } = useProjectFilters(projects);

    const hasQuery = search.trim() !== '' || statusFilter !== 'all';
    
    return (
        <div className="w-full flex flex-col space-y-6">
            {/* Header Area */}
            <div className="flex flex-col gap-2">
                <h3 className="text-2xl font-bold text-gray-900">
                    {userRole === 'user' ? 'My Project History' : 'Project Bidding Board'}
                </h3>
                <p className="text-gray-500 text-sm">
                    {userRole === 'user' 
                        ? 'Manage your renovation projects, review bids, and track progress.'
                        : 'Browse available projects, submit proposals, and grow your business.'}
                </p>
            </div>

            <ProjectStatsDashboard 
                totalBudget={stats.totalBudget}
                activeBids={stats.activeBids}
                completed={stats.completed}
                userRole={userRole}
            />

            <ProjectToolbar 
                search={search} onSearchChange={setSearch}
                statusFilter={statusFilter} onStatusChange={setStatusFilter}
                sortBy={sortBy} onSortChange={setSortBy}
                viewMode={viewMode} onViewModeChange={setViewMode}
                stats={stats} totalCount={totalCount}
                showPostButton={userRole === 'user'}
                onPostProject={onPostProject}
            />

            {/* Main Content Area */}
            <div className="w-full min-h-[400px] relative">
                {isLoading ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map(i => <ProjectCardSkeleton key={i} />)}
                    </div>
                ) : filteredProjects.length === 0 ? (
                    <ProjectEmptyState 
                        hasQuery={hasQuery} 
                        onClearFilters={() => { setSearch(''); setStatusFilter('all'); }}
                        onPostProject={userRole === 'user' ? onPostProject : undefined}
                    />
                ) : viewMode === 'board' && onStatusChange ? (
                    <ProjectKanban 
                        projects={filteredProjects}
                        onStatusChange={onStatusChange}
                        onViewProject={onViewProject}
                        onEditProject={onEditProject}
                        onDeleteProject={onDeleteProject}
                        userRole={userRole}
                    />
                ) : (
                    <div className="flex flex-col gap-6">
                        <div className={`grid ${viewMode === 'list' ? 'grid-cols-1 gap-4' : 'grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6'}`}>
                            <AnimatePresence mode="popLayout">
                                {filteredProjects.map(project => (
                                    <motion.div
                                        key={project.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <ProjectCard 
                                            project={project} 
                                            onClick={() => onViewProject(project)}
                                            userRole={userRole}
                                            viewMode={viewMode === 'board' ? 'grid' : viewMode}
                                            onEdit={onEditProject}
                                            onDelete={onDeleteProject}
                                        />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                        
                        {hasMore && (
                            <div className="flex justify-center mt-6">
                                <button 
                                    onClick={loadMore}
                                    className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl shadow-sm hover:bg-gray-50 hover:text-[#FF2D20] transition-colors"
                                >
                                    Load More Projects
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
