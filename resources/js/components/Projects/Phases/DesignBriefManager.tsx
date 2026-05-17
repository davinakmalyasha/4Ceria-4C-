import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { 
    Pencil, CheckCircle, Save, X, Lock, Coins, Layers, Layout, Target, 
    Settings, ShieldCheck, Clock, Zap, RefreshCw, AlertTriangle, 
    MessageSquarePlus, Send, User 
} from 'lucide-react';
import { 
    ARCHITECT_STYLES, 
    ARCHITECT_SERVICE_SCOPES, 
    ARCHITECT_DELIVERABLES,
    ARCHITECT_FEE_TYPES
} from '../../../constants/ArchitectStandardPresets';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import BriefingActionCenter from './BriefingActionCenter';
import PlanningNotesBoard from './PlanningNotesBoard';
import TechSpecForm from './TechSpecForm';
import { DesignDetails } from '../../../types/project.types';

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

    const brief = project.design_details || {};
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
            setIsLoading(false);
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
                        <div className="group p-6 bg-white border border-zinc-100 rounded-3xl shadow-sm space-y-3 flex flex-col">
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

                        {/* Revision Limit Card */}
                        <div className="group p-6 bg-white border border-zinc-100 rounded-3xl shadow-sm space-y-3 flex flex-col">
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

                        {/* Building Stats Card */}
                        <div className="group p-6 bg-white border border-zinc-100 rounded-3xl shadow-sm space-y-3 flex flex-col">
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

                        {/* Legal Guard Card */}
                        <div className={`p-6 border rounded-3xl shadow-sm space-y-1 transition-all flex flex-col justify-center ${
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
                    </div>

                    {/* Scopes & Deliverables View */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border border-zinc-100 rounded-3xl p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Layers size={18} className="text-zinc-400" />
                                    <h4 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Service Scopes</h4>
                                </div>
                                {canAddFeedback && (
                                    <button 
                                        onClick={() => setFeedbackInputType(feedbackInputType === 'scopes' ? null : 'scopes')}
                                        className={`p-1.5 rounded-lg transition-all ${feedbackInputType === 'scopes' ? 'bg-amber-100 text-amber-600' : 'text-zinc-300 hover:text-amber-600 hover:bg-amber-50'}`}
                                    >
                                        <MessageSquarePlus size={16} />
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(brief.scopes || ['schematic']).map((s: string) => (
                                    <span key={s} className="px-3 py-1 bg-zinc-100 text-zinc-600 text-[10px] font-black rounded-full uppercase tracking-widest">
                                        {ARCHITECT_SERVICE_SCOPES.find(scope => scope.id === s)?.label || s}
                                    </span>
                                ))}
                            </div>
                            <div className="space-y-2 mt-4">
                                {brief.scopes_feedback?.map((f: any) => (
                                    <div key={f.id} className={`p-2 rounded-xl text-[10px] flex flex-col gap-1 border ${f.author_role === 'project_manager' ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-amber-50 text-amber-900 border-amber-100'}`}>
                                        <p>{f.content}</p>
                                    </div>
                                ))}
                                {feedbackInputType === 'scopes' && (
                                    <div className="flex gap-2">
                                        <input 
                                            autoFocus
                                            className="flex-1 bg-zinc-50 border-none rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-amber-500"
                                            placeholder="Add feedback..."
                                            value={feedbackContent}
                                            onChange={(e) => setFeedbackContent(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddFeedback('scopes')}
                                        />
                                        <button onClick={() => handleAddFeedback('scopes')} disabled={isUpdating || !feedbackContent.trim()} className="text-amber-600"><Send size={12}/></button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white border border-zinc-100 rounded-3xl p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Layout size={18} className="text-zinc-400" />
                                    <h4 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Expected Deliverables</h4>
                                </div>
                                {canAddFeedback && (
                                    <button 
                                        onClick={() => setFeedbackInputType(feedbackInputType === 'deliverables' ? null : 'deliverables')}
                                        className={`p-1.5 rounded-lg transition-all ${feedbackInputType === 'deliverables' ? 'bg-amber-100 text-amber-600' : 'text-zinc-300 hover:text-amber-600 hover:bg-amber-50'}`}
                                    >
                                        <MessageSquarePlus size={16} />
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(brief.deliverables || ['3d_render']).map((d: string) => (
                                    <span key={d} className="px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-black rounded-full uppercase tracking-widest border border-amber-100">
                                        {ARCHITECT_DELIVERABLES.find(del => del.id === d)?.label || d}
                                    </span>
                                ))}
                            </div>
                            <div className="space-y-2 mt-4">
                                {brief.deliverables_feedback?.map((f: any) => (
                                    <div key={f.id} className={`p-2 rounded-xl text-[10px] flex flex-col gap-1 border ${f.author_role === 'project_manager' ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-amber-50 text-amber-900 border-amber-100'}`}>
                                        <p>{f.content}</p>
                                    </div>
                                ))}
                                {feedbackInputType === 'deliverables' && (
                                    <div className="flex gap-2">
                                        <input 
                                            autoFocus
                                            className="flex-1 bg-zinc-50 border-none rounded-lg px-2 py-1 text-[10px] focus:ring-1 focus:ring-amber-500"
                                            placeholder="Add feedback..."
                                            value={feedbackContent}
                                            onChange={(e) => setFeedbackContent(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddFeedback('deliverables')}
                                        />
                                        <button onClick={() => handleAddFeedback('deliverables')} disabled={isUpdating || !feedbackContent.trim()} className="text-amber-600"><Send size={12}/></button>
                                    </div>
                                )}
                            </div>
                        </div>
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
