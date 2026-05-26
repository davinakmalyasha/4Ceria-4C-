import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Shield, ExternalLink } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { ProfilePreviewCard } from '../../Shared/ProfilePreviewCard';
import { getProfile } from '../../Shared/ProfilePreviewHelpers';
import { PortfolioProject } from '../../../types/project.types';
import { NotarisLegalBrief } from './NotarisLegalBrief';
import { BidProposalFields } from './BidProposalFields';

interface Props {
    project: any;
    user: any;
    onSuccess: () => void;
}

export const ProjectBidForm: React.FC<Props> = ({ project, user, onSuccess }) => {
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [proposal, setProposal] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);
    const [portfolios, setPortfolios] = useState<PortfolioProject[]>([]);
    const [feeType, setFeeType] = useState('');
    const [price, setPrice] = useState<number | undefined>(undefined);

    useEffect(() => {
        if (user?.id) {
            axios.get(`/portfolios?user_id=${user.id}`)
                .then(res => setPortfolios(res.data))
                .catch(() => {});
        }
    }, [user?.id]);
    
    const profile = getProfile(user);
    const isVerified = profile?.verification_status === 'verified' || profile?.verification_status === 'approved';

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && attachments.length < 3) {
            setAttachments(prev => [...prev, ...Array.from(e.target.files!).slice(0, 3 - prev.length)]);
        }
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('proposal', proposal);
            attachments.forEach((file, index) => {
                formData.append(`attachment_${index + 1}`, file);
            });
            formData.append('estimated_duration', '1');
            formData.append('duration_unit', 'weeks');
            
            if (feeType) {
                formData.append('fee_type', feeType);
                if (price !== undefined) {
                    formData.append('price', price.toString());
                }
            }
            
            await axios.post(`/projects/${project.id}/bids`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            showToast('Bid submitted successfully', 'success');
            onSuccess();
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Failed to submit bid', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isVerified) {
        return (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-[2rem] p-10 text-center">
                <Shield className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-black text-amber-900 mb-2">Account Verification Pending</h3>
                <p className="text-sm font-medium text-amber-700">
                    You must be a verified professional to submit proposals on the 4Ceria network.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Submit Your Proposal</h3>
                <p className="text-xs font-black text-red-600 uppercase tracking-[0.2em] mt-1">Professional Proposal</p>
            </div>

            {/* Profile Preview — "This is what the client sees" */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Shield size={14} /> Your Profile Preview
                    </label>
                    <a href="/dashboard" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 hover:text-red-700 hover:underline transition-colors">
                        <ExternalLink size={12} /> Edit Your Profile
                    </a>
                </div>
                <div className="border-2 border-dashed border-gray-200 rounded-[2rem] p-1 bg-gray-50/50">
                    <ProfilePreviewCard user={user} portfolios={portfolios} compact />
                </div>
                <p className="text-[10px] font-medium text-gray-400 text-center italic">
                    This is how your profile appears to the project owner. Make sure it looks great!
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-12">
                {user?.role_type === 'notaris' && <NotarisLegalBrief project={project} />}
                
                <BidProposalFields 
                    proposal={proposal} setProposal={setProposal}
                    attachments={attachments} onFileChange={handleFileChange} onRemoveAttachment={removeAttachment}
                    isLoading={isLoading}
                    buttonText={user?.role_type === 'project_manager' ? "Submit Official Enterprise Bid" : "Submit Professional Proposal"}
                    feeType={feeType} setFeeType={setFeeType}
                    price={price} setPrice={setPrice}
                />
            </form>
        </div>
    );
};
