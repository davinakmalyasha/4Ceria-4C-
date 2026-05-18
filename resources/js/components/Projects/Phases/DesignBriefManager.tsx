import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { 
    Pencil, CheckCircle, Save, X, Lock, Coins, Layers, Layout, Target, 
    Settings, ShieldCheck, Clock, Zap, RefreshCw, AlertTriangle, 
    MessageSquarePlus, Send, User, FileText, Plus 
} from 'lucide-react';
import { 
    ARCHITECT_STYLES, 
    ARCHITECT_FEE_TYPES
} from '../../../constants/ArchitectStandardPresets';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import BriefingActionCenter from './BriefingActionCenter';
import PlanningNotesBoard from './PlanningNotesBoard';
import TechSpecForm from './TechSpecForm';
import { DesignDetails } from '../../../types/project.types';

interface PMStickyNoteWrapperProps {
    noteKey: string;
    isPM: boolean;
    isReadOnly: boolean;
    brief: any;
    openNotes: string[];
    draftNotes: Record<string, string>;
    toggleNote: (key: string) => void;
    handleDraftNoteChange: (key: string, text: string) => void;
    handleSaveStickyNote: (key: string) => void;
    handleDeleteStickyNote: (key: string) => void;
    children: React.ReactNode;
    className?: string;
}

function PMStickyNoteWrapper({
    noteKey,
    isPM,
    isReadOnly,
    brief,
    openNotes,
    draftNotes,
    toggleNote,
    handleDraftNoteChange,
    handleSaveStickyNote,
    handleDeleteStickyNote,
    children,
    className = ''
}: PMStickyNoteWrapperProps) {
    const hasNote = !!brief[`${noteKey}_sticky_note`];
    const isOpen = openNotes.includes(noteKey);
    const draftText = draftNotes[noteKey] !== undefined ? draftNotes[noteKey] : (brief[`${noteKey}_sticky_note`] || '');

    return (
        <div 
            className={`flex gap-4 items-start relative transition-all duration-300 ${
                (isOpen || hasNote) ? 'col-span-1 sm:col-span-2' : 'col-span-1'
            } ${className}`}
        >
            <div className="flex-1 relative w-full">
                {children}
                
                {/* Sticky Note Tab (Right Edge of card, only visible when note is closed) */}
                {isPM && !isReadOnly && !isOpen && !hasNote && (
                    <div className="absolute -right-3 top-6 z-10">
                        <button 
                            onClick={() => toggleNote(noteKey)}
                            className="w-10 h-10 bg-yellow-300 hover:bg-yellow-400 border border-yellow-400 rounded-l-lg rounded-r-md flex items-center justify-center shadow-lg transition-all group/note animate-in fade-in zoom-in-95"
                            title="Add Sticky Note"
                        >
                            <FileText size={16} className="text-yellow-700" />
                            <Plus size={10} className="absolute bottom-1 right-1 text-yellow-800 font-black" />
                        </button>
                    </div>
                )}
            </div>

            {/* Yellow Sticky Note Panel */}
            {(isOpen || hasNote) && (
                <div className="w-80 shrink-0 bg-yellow-50 border border-yellow-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 relative animate-in slide-in-from-right duration-300">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-yellow-700 uppercase tracking-widest flex items-center gap-1.5">
                            📌 PM Sticky Note
                        </span>
                        <div className="flex gap-1">
                            {isPM && !isReadOnly && hasNote && (
                                <button 
                                    onClick={() => handleDeleteStickyNote(noteKey)}
                                    className="p-1 hover:bg-yellow-100 rounded text-red-600 transition-colors"
                                    title="Delete note"
                                >
                                    <X size={12} className="stroke-[3]" />
                                </button>
                            )}
                            {isPM && !isReadOnly && (
                                <button 
                                    onClick={() => toggleNote(noteKey)}
                                    className="p-1 hover:bg-yellow-100 rounded text-yellow-700 transition-colors"
                                    title="Close panel"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {isPM && !isReadOnly ? (
                        <div className="flex flex-col gap-2">
                            <textarea
                                className="w-full bg-yellow-100/50 border-none rounded-xl p-2.5 text-xs text-yellow-900 placeholder-yellow-600/60 focus:ring-1 focus:ring-yellow-400 focus:bg-yellow-100/80 resize-none h-28"
                                placeholder="Write sticky note here..."
                                value={draftText}
                                onChange={(e) => handleDraftNoteChange(noteKey, e.target.value)}
                            />
                            <button
                                onClick={() => handleSaveStickyNote(noteKey)}
                                className="w-full py-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
                            >
                                Pin Note
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-yellow-900 font-medium leading-relaxed bg-yellow-100/30 p-3 rounded-xl border border-yellow-200/50 whitespace-pre-wrap">
                            {brief[`${noteKey}_sticky_note`]}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

interface DesignBriefManagerProps {
    project: any;
    isArchitect: boolean;
    isOwner: boolean;
    isPM: boolean;
    onRefresh: () => void;
}

export default function DesignBriefManager({ project, isArchitect, isOwner, isPM, onRefresh }: DesignBriefManagerProps) {
    const { showToast } = useToast();
    const { user } = useAuth();
    const [isConfiguring, setIsConfiguring] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const [feedbackInputType, setFeedbackInputType] = useState<'style' | 'revisions' | null>(null);
    const [feedbackContent, setFeedbackContent] = useState('');

    const [openNotes, setOpenNotes] = useState<string[]>([]);
    const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

    const brief = project.design_details || {};

    const toggleNote = (key: string) => {
        if (openNotes.includes(key)) {
            setOpenNotes(prev => prev.filter(k => k !== key));
        } else {
            setOpenNotes(prev => [...prev, key]);
            setDraftNotes(prev => ({
                ...prev,
                [key]: brief[`${key}_sticky_note`] || ''
            }));
        }
    };

    const handleDraftNoteChange = (key: string, text: string) => {
        setDraftNotes(prev => ({
            ...prev,
            [key]: text
        }));
    };

    const handleSaveStickyNote = async (key: string) => {
        const text = draftNotes[key] || '';
        await handleUpdateBrief({
            [`${key}_sticky_note`]: text || undefined
        });
        setOpenNotes(prev => prev.filter(k => k !== key));
        showToast(text ? 'Sticky note pinned!' : 'Sticky note deleted!', 'success');
    };

    const handleDeleteStickyNote = async (key: string) => {
        if (window.confirm('Delete this sticky note?')) {
            await handleUpdateBrief({
                [`${key}_sticky_note`]: undefined
            });
            setOpenNotes(prev => prev.filter(k => k !== key));
            setDraftNotes(prev => {
                const copy = { ...prev };
                delete copy[key];
                return copy;
            });
            showToast('Sticky note deleted!', 'success');
        }
    };
    const isLocked = !!project.design_locked_at;

    // Form States
    const [theme, setTheme] = useState(brief.style || ARCHITECT_STYLES[0]);
    const [revisions, setRevisions] = useState(brief.revisions || '3');
    const [notes, setNotes] = useState(brief.notes || '');

    const [floorCount, setFloorCount] = useState(brief.floorCount || 1);
    const [maxClearSpan, setMaxClearSpan] = useState(brief.maxClearSpan || 3);
    const [cantileverLength, setCantileverLength] = useState(brief.cantileverLength || 0);

    const handleSyncFromBid = () => {
        const hiredBid = project.accepted_arsitek_bid || 
                        project.bids_arsitek?.find((b: any) => b.status === 'accepted' || b.status === 'hired');
                        
        if (!hiredBid) {
            showToast('Could not find your accepted bid to sync from.', 'error');
            return;
        }

        handleUpdateBrief({
            style: hiredBid.style,
            revisions: hiredBid.revisions,
            scopes: hiredBid.scopes,
            deliverables: hiredBid.deliverables
        });
        
        showToast('Specifications synced from your proposal!', 'success');
    };

    const isReadOnly = project.planning_status === 'proposed' || project.planning_status === 'approved';
    const canAddFeedback = isPM || isOwner;

    const handleUpdateBrief = async (data: Partial<DesignDetails>) => {
        setIsUpdating(true);
        try {
            await axios.post(`/projects/${project.id}/update`, {
                design_details: {
                    ...brief,
                    ...data,
                    updated_at: new Date().toISOString()
                }
            });
            showToast('Design specification updated successfully!', 'success');
            setIsConfiguring(false);
            onRefresh();
        } catch (error) {
            showToast('Failed to update design specifications.', 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleAddFeedback = async (type: string) => {
        if (!feedbackContent.trim()) return;

        setIsUpdating(true);
        const newFeedback = {
            id: Math.random().toString(36).substr(2, 9),
            author_id: user?.id || 0,
            author_name: user?.name || 'Anonymous',
            author_role: user?.role_type || 'user',
            content: feedbackContent,
            created_at: new Date().toISOString()
        };

        const key = `${type}_feedback`;
        const updatedDesignDetails = {
            ...(project.design_details || {}),
            [key]: [...(project.design_details?.[key] || []), newFeedback]
        };

        try {
            await axios.post(`/projects/${project.id}/update`, {
                design_details: updatedDesignDetails
            });
            showToast('Feedback added', 'success');
            setFeedbackContent('');
            setFeedbackInputType(null);
            onRefresh();
        } catch (error) {
            showToast('Failed to add feedback', 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-500">
            <PlanningNotesBoard 
                project={project}
                isArchitect={isArchitect}
                onProjectUpdate={() => onRefresh()}
            />

            <div className={`space-y-8 ${isReadOnly ? 'opacity-70' : ''}`}>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                            <Settings className="w-5 h-5 text-zinc-400" />
                            Technical Specifications
                        </h3>
                        <p className="text-sm text-zinc-500">Define the core parameters of the architectural contract.</p>
                    </div>
                    {isArchitect && !isConfiguring && !isReadOnly && (
                        <button 
                            onClick={() => setIsConfiguring(true)}
                            className="px-6 py-2 bg-zinc-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg shadow-zinc-200"
                        >
                            <Settings className="w-3.5 h-3.5" />
                            Configure Specs
                        </button>
                    )}
                </div>

                {isConfiguring ? (
                    <TechSpecForm 
                        initialData={brief}
                        isUpdating={isUpdating}
                        onSave={handleUpdateBrief}
                        onCancel={() => setIsConfiguring(false)}
                    />
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Aesthetic Style Card */}
                            <PMStickyNoteWrapper
                                noteKey="style"
                                isPM={isPM}
                                isReadOnly={isReadOnly}
                                brief={brief}
                                openNotes={openNotes}
                                draftNotes={draftNotes}
                                toggleNote={toggleNote}
                                handleDraftNoteChange={handleDraftNoteChange}
                                handleSaveStickyNote={handleSaveStickyNote}
                                handleDeleteStickyNote={handleDeleteStickyNote}
                            >
                                <div className="group p-6 bg-white border border-zinc-100 rounded-3xl shadow-sm space-y-3 flex flex-col w-full h-full">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Aesthetic Style</span>
                                            <p className="font-bold text-zinc-900">{brief.style || 'Standard'}</p>
                                        </div>
                                        {canAddFeedback && (
                                            <button 
                                                onClick={() => setFeedbackInputType(feedbackInputType === 'style' ? null : 'style')}
                                                className={`p-1.5 rounded-lg transition-all ${feedbackInputType === 'style' ? 'bg-amber-100 text-amber-600' : 'opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-amber-600 hover:bg-amber-50'}`}
                                            >
                                                <MessageSquarePlus size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {brief.style_feedback?.map((f: any) => (
                                            <div key={f.id} className={`p-2 rounded-xl text-[10px] flex flex-col gap-1 border ${f.author_role === 'project_manager' ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-amber-50 text-amber-900 border-amber-100'}`}>
                                                <div className="flex items-center gap-1 opacity-80 font-bold uppercase tracking-tighter">
                                                    <User size={10} /> {f.author_role.replace('_', ' ')}
                                                </div>
                                                <p>{f.content}</p>
                                            </div>
                                        ))}
                                        {feedbackInputType === 'style' && (
                                            <div className="flex gap-2 animate-in fade-in slide-in-from-bottom-1">
                                                <input 
                                                    autoFocus
                                                    className="flex-1 bg-zinc-50 border-none rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-amber-500"
                                                    placeholder="Add feedback..."
                                                    value={feedbackContent}
                                                    onChange={(e) => setFeedbackContent(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddFeedback('style')}
                                                />
                                                <button onClick={() => handleAddFeedback('style')} disabled={isUpdating || !feedbackContent.trim()} className="text-amber-600 disabled:opacity-50"><Send size={12}/></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </PMStickyNoteWrapper>

                            {/* Revision Limit Card */}
                            <PMStickyNoteWrapper
                                noteKey="revisions"
                                isPM={isPM}
                                isReadOnly={isReadOnly}
                                brief={brief}
                                openNotes={openNotes}
                                draftNotes={draftNotes}
                                toggleNote={toggleNote}
                                handleDraftNoteChange={handleDraftNoteChange}
                                handleSaveStickyNote={handleSaveStickyNote}
                                handleDeleteStickyNote={handleDeleteStickyNote}
                            >
                                <div className="group p-6 bg-white border border-zinc-100 rounded-3xl shadow-sm space-y-3 flex flex-col w-full h-full">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Revision Limit</span>
                                            <p className="font-bold text-zinc-900">{brief.revisions || '3'} Iterations</p>
                                        </div>
                                        {canAddFeedback && (
                                            <button 
                                                onClick={() => setFeedbackInputType(feedbackInputType === 'revisions' ? null : 'revisions')}
                                                className={`p-1.5 rounded-lg transition-all ${feedbackInputType === 'revisions' ? 'bg-amber-100 text-amber-600' : 'opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-amber-600 hover:bg-amber-50'}`}
                                            >
                                                <MessageSquarePlus size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {brief.revisions_feedback?.map((f: any) => (
                                            <div key={f.id} className={`p-2 rounded-xl text-[10px] flex flex-col gap-1 border ${f.author_role === 'project_manager' ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-amber-50 text-amber-900 border-amber-100'}`}>
                                                <div className="flex items-center gap-1 opacity-80 font-bold uppercase tracking-tighter">
                                                    <User size={10} /> {f.author_role.replace('_', ' ')}
                                                </div>
                                                <p>{f.content}</p>
                                            </div>
                                        ))}
                                        {feedbackInputType === 'revisions' && (
                                            <div className="flex gap-2 animate-in fade-in slide-in-from-bottom-1">
                                                <input 
                                                    autoFocus
                                                    className="flex-1 bg-zinc-50 border-none rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-amber-500"
                                                    placeholder="Add feedback..."
                                                    value={feedbackContent}
                                                    onChange={(e) => setFeedbackContent(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddFeedback('revisions')}
                                                />
                                                <button onClick={() => handleAddFeedback('revisions')} disabled={isUpdating || !feedbackContent.trim()} className="text-amber-600 disabled:opacity-50"><Send size={12}/></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </PMStickyNoteWrapper>

                            {/* Building Stats Card */}
                            <PMStickyNoteWrapper
                                noteKey="stats"
                                isPM={isPM}
                                isReadOnly={isReadOnly}
                                brief={brief}
                                openNotes={openNotes}
                                draftNotes={draftNotes}
                                toggleNote={toggleNote}
                                handleDraftNoteChange={handleDraftNoteChange}
                                handleSaveStickyNote={handleSaveStickyNote}
                                handleDeleteStickyNote={handleDeleteStickyNote}
                            >
                                <div className="group p-6 bg-white border border-zinc-100 rounded-3xl shadow-sm space-y-3 flex flex-col w-full h-full">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Building Stats</span>
                                            <p className="font-bold text-zinc-900">
                                                {brief.floorCount || 1} Floors • {brief.targetArea || '?'} sqm
                                            </p>
                                        </div>
                                        {canAddFeedback && (
                                            <button 
                                                onClick={() => setFeedbackInputType(feedbackInputType === 'stats' ? null : 'stats')}
                                                className={`p-1.5 rounded-lg transition-all ${feedbackInputType === 'stats' ? 'bg-amber-100 text-amber-600' : 'opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-amber-600 hover:bg-amber-50'}`}
                                            >
                                                <MessageSquarePlus size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {brief.stats_feedback?.map((f: any) => (
                                            <div key={f.id} className={`p-2 rounded-xl text-[10px] flex flex-col gap-1 border ${f.author_role === 'project_manager' ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-amber-50 text-amber-900 border-amber-100'}`}>
                                                <div className="flex items-center gap-1 opacity-80 font-bold uppercase tracking-tighter">
                                                    <User size={10} /> {f.author_role.replace('_', ' ')}
                                                </div>
                                                <p>{f.content}</p>
                                            </div>
                                        ))}
                                        {feedbackInputType === 'stats' && (
                                            <div className="flex gap-2 animate-in fade-in slide-in-from-bottom-1">
                                                <input 
                                                    autoFocus
                                                    className="flex-1 bg-zinc-50 border-none rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-amber-500"
                                                    placeholder="Add feedback..."
                                                    value={feedbackContent}
                                                    onChange={(e) => setFeedbackContent(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddFeedback('stats')}
                                                />
                                                <button onClick={() => handleAddFeedback('stats')} disabled={isUpdating || !feedbackContent.trim()} className="text-amber-600 disabled:opacity-50"><Send size={12}/></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </PMStickyNoteWrapper>

                            {/* Legal Guard Card */}
                            <PMStickyNoteWrapper
                                noteKey="legal"
                                isPM={isPM}
                                isReadOnly={isReadOnly}
                                brief={brief}
                                openNotes={openNotes}
                                draftNotes={draftNotes}
                                toggleNote={toggleNote}
                                handleDraftNoteChange={handleDraftNoteChange}
                                handleSaveStickyNote={handleSaveStickyNote}
                                handleDeleteStickyNote={handleDeleteStickyNote}
                            >
                                <div className={`p-6 border rounded-3xl shadow-sm space-y-1 transition-all flex flex-col justify-center w-full h-full ${
                                    project?.milestones?.some((m: any) => (m.content?.req_id === 'land_verification' || m.title.toUpperCase().includes('AJB')) && m.approval_status === 'approved')
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                                    : 'bg-amber-50 border-amber-100 text-amber-900'
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Legal Guard</span>
                                        <ShieldCheck size={14} className={project?.milestones?.some((m: any) => (m.content?.req_id === 'land_verification' || m.title.toUpperCase().includes('AJB')) && m.approval_status === 'approved') ? 'text-emerald-500' : 'text-amber-500'} />
                                    </div>
                                    <p className="font-bold text-sm">
                                        {project?.milestones?.some((m: any) => (m.content?.req_id === 'land_verification' || m.title.toUpperCase().includes('AJB')) && m.approval_status === 'approved') 
                                        ? 'Land Verified (AJB)' 
                                        : 'Pending Verification'}
                                    </p>
                                </div>
                            </PMStickyNoteWrapper>
                        </div>

                    {/* Scopes & Deliverables View */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <PMStickyNoteWrapper
                            noteKey="scopes"
                            isPM={isPM}
                            isReadOnly={isReadOnly}
                            brief={brief}
                            openNotes={openNotes}
                            draftNotes={draftNotes}
                            toggleNote={toggleNote}
                            handleDraftNoteChange={handleDraftNoteChange}
                            handleSaveStickyNote={handleSaveStickyNote}
                            handleDeleteStickyNote={handleDeleteStickyNote}
                        >
                            <div className="bg-white border border-zinc-100 rounded-3xl p-6 space-y-4 w-full h-full">
                                <div className="flex items-center gap-2">
                                    <Layers size={18} className="text-zinc-400" />
                                    <h4 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Service Scopes</h4>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {!brief.scopes || brief.scopes.length === 0 ? (
                                        <p className="text-xs text-zinc-400 font-bold italic">No custom scopes defined.</p>
                                    ) : (
                                        brief.scopes.map((s: string) => (
                                            <span key={s} className="px-3 py-1 bg-zinc-100 text-zinc-600 text-[10px] font-black rounded-full uppercase tracking-widest">
                                                {s}
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>
                        </PMStickyNoteWrapper>

                        <PMStickyNoteWrapper
                            noteKey="deliverables"
                            isPM={isPM}
                            isReadOnly={isReadOnly}
                            brief={brief}
                            openNotes={openNotes}
                            draftNotes={draftNotes}
                            toggleNote={toggleNote}
                            handleDraftNoteChange={handleDraftNoteChange}
                            handleSaveStickyNote={handleSaveStickyNote}
                            handleDeleteStickyNote={handleDeleteStickyNote}
                        >
                            <div className="bg-white border border-zinc-100 rounded-3xl p-6 space-y-4 w-full h-full">
                                <div className="flex items-center gap-2">
                                    <Layout size={18} className="text-zinc-400" />
                                    <h4 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Expected Deliverables</h4>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {!brief.deliverables || brief.deliverables.length === 0 ? (
                                        <p className="text-xs text-zinc-400 font-bold italic">No custom deliverables defined.</p>
                                    ) : (
                                        brief.deliverables.map((d: string) => (
                                            <span key={d} className="px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-black rounded-full uppercase tracking-widest border border-amber-100">
                                                {d}
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>
                        </PMStickyNoteWrapper>
                    </div>

                </div>
                )}
            </div>

            <BriefingActionCenter 
                project={project}
                isArchitect={isArchitect}
                isOwner={isOwner}
                isPM={isPM}
                onProjectUpdate={() => onRefresh()}
            />
        </div>
    );
}
