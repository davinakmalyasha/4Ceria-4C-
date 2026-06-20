import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Project } from '../../types/project.types';
import { useProjectFilters } from '../../hooks/useProjectFilters';
import ProjectToolbar from './ProjectToolbar';
import ProjectCard, { ProjectCardSkeleton } from './ProjectCard';
import ProjectEmptyState from './ProjectEmptyState';
import ProjectStatsDashboard from './ProjectStatsDashboard';
import ProjectKanban from './ProjectKanban';
import ProjectMap from './ProjectMap';

interface ProjectBoardProps {
    projects: Project[];
    isLoading: boolean;
    onViewProject: (project: Project) => void;
    userRole?: string;
    onPostProject?: () => void;
    onEditProject?: (project: Project) => void;
    onDeleteProject?: (project: Project) => void;
    onStatusChange?: (projectId: number, newStatus: string) => void;
    myBidsCount?: number;
    onViewMyBids?: () => void;
    onViewActiveBids?: () => void;
    onPrefetch?: (projectId: number) => void;
}

export default function ProjectBoard({ 
    projects, isLoading, userRole, onViewProject, onPostProject, onEditProject, onDeleteProject, onStatusChange, myBidsCount, onViewMyBids, onViewActiveBids, onPrefetch
}: ProjectBoardProps) {
    
    const {
        search, setSearch,
        statusFilter, setStatusFilter,
        sortBy, setSortBy,
        viewMode, setViewMode,
        visibleCount, setVisibleCount,
        hasMore, loadMore,
        filteredProjects,
        allFilteredProjects,
        totalCount,
        stats,
        // Map related
        mapRef, userLocation, selectedCity, setSelectedCity, isDropdownOpen, setIsDropdownOpen, 
        dropdownRef, popupInfo, setPopupInfo, flyToUser, cities
    } = useProjectFilters(projects);

    const hasQuery = search.trim() !== '' || statusFilter !== 'all' || selectedCity !== 'all';

    // Auto-focus map on search results or city selection
    useEffect(() => {
        if (!mapRef.current || allFilteredProjects.length === 0 || (!search && selectedCity === 'all')) return;

        const timer = setTimeout(() => {
            if (allFilteredProjects.length === 1) {
                const p = allFilteredProjects[0];
                if (p.latitude && p.longitude) {
                    mapRef.current?.flyTo({ 
                        center: [parseFloat(p.longitude), parseFloat(p.latitude)], 
                        zoom: 13, 
                        duration: 1200 
                    });
                }
            } else {
                const coords = allFilteredProjects
                    .filter(p => p.latitude && p.longitude)
                    .map(p => [parseFloat(p.longitude!), parseFloat(p.latitude!)]);
                
                if (coords.length > 0) {
                    const lons = coords.map(c => c[0]);
                    const lats = coords.map(c => c[1]);
                    const minLat = Math.min(...lats);
                    const maxLat = Math.max(...lats);
                    const minLng = Math.min(...lons);
                    const maxLng = Math.max(...lons);
                    
                    mapRef.current?.fitBounds(
                        [[minLng, minLat], [maxLng, maxLat]],
                        { padding: 50, duration: 1000 }
                    );
                }
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [allFilteredProjects, search, selectedCity, mapRef]);
    
    return (
        <div className="w-full flex flex-col space-y-4">


            {/* Map Integration for Professionals */}
            {userRole !== 'user' && projects.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <ProjectMap 
                        processedProjects={allFilteredProjects}
                        allProjects={projects}
                        mapRef={mapRef}
                        userLocation={userLocation}
                        selectedCity={selectedCity}
                        setSelectedCity={setSelectedCity}
                        isDropdownOpen={isDropdownOpen}
                        setIsDropdownOpen={setIsDropdownOpen}
                        dropdownRef={dropdownRef}
                        cities={cities}
                        popupInfo={popupInfo}
                        setPopupInfo={setPopupInfo}
                        onFlyToUser={flyToUser}
                        onSelectProject={onViewProject}
                        search={search}
                        onSearchChange={setSearch}
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        totalBudget={stats.totalBudget}
                        activeBidsCount={myBidsCount}
                        completedCount={stats.completed}
                        onViewMyBids={onViewMyBids}
                        onViewActiveBids={onViewActiveBids}
                        userRole={userRole}
                    />
                </motion.div>
            )}

            {userRole === 'user' && (
                <ProjectToolbar 
                    search={search} onSearchChange={setSearch}
                    statusFilter={statusFilter} onStatusChange={setStatusFilter}
                    sortBy={sortBy} onSortChange={setSortBy}
                    viewMode={viewMode} onViewModeChange={setViewMode}
                    stats={stats} totalCount={totalCount}
                    showPostButton={true}
                    onPostProject={onPostProject}
                    totalBudget={stats.totalBudget}
                    completedCount={stats.completed}
                    userRole={userRole}
                />
            )}

            {/* Main Content Area */}
            <div className="w-full min-h-[350px] relative">
                {isLoading ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map(i => <ProjectCardSkeleton key={i} />)}
                    </div>
                ) : filteredProjects.length === 0 ? (
                    <ProjectEmptyState 
                        hasQuery={hasQuery} 
                        onClearFilters={() => { setSearch(''); setStatusFilter('all'); setSelectedCity('all'); }}
                        onPostProject={userRole === 'user' ? onPostProject : undefined}
                        userRole={userRole}
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
                                            onPrefetch={onPrefetch}
                                        />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                        
                        {hasMore && (
                            <div className="flex justify-center mt-6">
                                <button 
                                    onClick={loadMore}
                                    className="px-8 py-3 bg-zinc-900 border border-zinc-800 text-white font-black rounded-xl shadow-xl shadow-black/10 hover:bg-black hover:-translate-y-0.5 transition-all active:scale-95 uppercase tracking-widest text-xs"
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
