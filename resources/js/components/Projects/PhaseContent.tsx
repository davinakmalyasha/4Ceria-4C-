import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phase, PhaseKey } from '../../types/phase.types';
import PhaseAssignedPro from './Phases/PhaseAssignedPro';
import PhaseBidsList from './Phases/PhaseBidsList';

interface PhaseContentProps {
    phase: Phase;
    project: any;
    user: any;
    onRefresh: () => void;
}

const PHASE_ROLE_MAP: Record<PhaseKey, { bidKey: string; selectedKey: string; profileKey: string }> = {
    legal:     { bidKey: 'bids_notaris',     selectedKey: 'selected_notaris_id',    profileKey: 'notaris' },
    design:    { bidKey: 'bids_arsitek',     selectedKey: 'selected_arsitek_id',    profileKey: 'arsitek' },
    build:     { bidKey: 'bids_kontraktor',  selectedKey: 'selected_kontraktor_id', profileKey: 'kontraktor' },
    materials: { bidKey: 'material_orders',  selectedKey: '',                       profileKey: '' },
    interior:  { bidKey: 'bids_interior',    selectedKey: 'selected_interior_id',   profileKey: 'interior' },
    handover:  { bidKey: '',                 selectedKey: '',                       profileKey: '' },
};

export default function PhaseContent({ phase, project, user, onRefresh }: PhaseContentProps) {
    const config = PHASE_ROLE_MAP[phase.key];
    const isOwner = user?.id === project?.user_id;
    const hasPro = config.selectedKey && project?.[config.selectedKey];
    const bids = config.bidKey ? (project?.[config.bidKey] || []) : [];

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={phase.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
            >
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">{phase.label}</h3>
                        <p className="text-sm text-gray-400 mt-0.5">{phase.description}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        phase.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        phase.status === 'active' ? 'bg-red-50 text-[#FF2D20]' :
                        'bg-gray-100 text-gray-400'
                    }`}>
                        {phase.status}
                    </span>
                </div>

                {phase.key === 'handover' ? (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center">
                        <p className="text-gray-400 font-semibold">Final inspection & handover will appear when all other phases are complete.</p>
                    </div>
                ) : phase.key === 'materials' ? (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 text-center">
                        <p className="text-amber-700 font-semibold text-sm">Material ordering is handled through the Marketplace tab.</p>
                    </div>
                ) : (
                    <>
                        {hasPro && <PhaseAssignedPro project={project} phaseKey={phase.key} config={config} />}
                        {!hasPro && isOwner && bids.length > 0 && (
                            <PhaseBidsList bids={bids} phaseKey={phase.key} projectId={project.id} onRefresh={onRefresh} />
                        )}
                        {!hasPro && bids.length === 0 && (
                            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 text-center">
                                <p className="text-gray-400 font-semibold text-sm">No proposals yet. Your project is visible to {phase.label} professionals.</p>
                            </div>
                        )}
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
