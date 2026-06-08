import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Shield, ExternalLink } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { ProfilePreviewCard } from '../../Shared/ProfilePreviewCard';
import { getProfile } from '../../Shared/ProfilePreviewHelpers';
import { PortfolioProject } from '../../../types/project.types';
import { NotarisLegalBrief } from './NotarisLegalBrief';
import { BidProposalFields } from './BidProposalFields';
import { TeamPreviewSection } from './TeamPreviewSection';

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
    const [feeType, setFeeType] = useState('fixed');
    const [price, setPrice] = useState<number | undefined>(undefined);
    const [errors, setErrors] = useState<{ proposal?: string; price?: string }>({});
    
    // Notary multi-select fee states
    const [isConsultationChecked, setIsConsultationChecked] = useState<boolean>(true);
    const [selectedServices, setSelectedServices] = useState<Array<{ title: string; price: number; description?: string }>>([]);

    useEffect(() => {
        if (user?.id) {
            axios.get(`/portfolios?user_id=${user.id}`)
                .then(res => setPortfolios(res.data))
                .catch(() => {});
        }
    }, [user?.id]);
    
    const profile = getProfile(user);
    const isVerified = profile?.verification_status === 'verified' || profile?.verification_status === 'approved';

    const clearError = (field: 'proposal' | 'price') => {
        setErrors(prev => ({ ...prev, [field]: undefined }));
    };

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

        const newErrors: typeof errors = {};
        if (!proposal.trim()) {
            newErrors.proposal = 'Please detail your professional approach and executive summary.';
        }
        if (user?.role_type !== 'notaris') {
            if (price === undefined || price === null || isNaN(price) || price <= 0) {
                newErrors.price = 'Please specify a valid estimated fee amount greater than zero.';
            }
        }
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            setIsLoading(false);
            return;
        }
        setErrors({});

        try {
            const formData = new FormData();
            formData.append('proposal', proposal);
            attachments.forEach((file, index) => {
                formData.append(`attachment_${index + 1}`, file);
            });
            formData.append('estimated_duration', '1');
            formData.append('duration_unit', 'weeks');
            
            if (user?.role_type === 'notaris') {
                formData.append('fee_type', 'fixed');
                const consultationFeeVal = isConsultationChecked ? Number(profile?.rate_harga || 0) : 0;
                const servicesTotal = selectedServices.reduce((sum, s) => sum + Number(s.price || 0), 0);
                const totalFee = consultationFeeVal + servicesTotal;
                if (totalFee <= 0) {
                    showToast('Please select at least one service or enable consultation fee to submit a proposal.', 'error');
                    setIsLoading(false);
                    return;
                }
                formData.append('price', consultationFeeVal.toString());
                formData.append('selected_services', JSON.stringify(selectedServices));
            } else if (feeType) {
                formData.append('fee_type', feeType);
                formData.append('price', price!.toString());
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

            {(user?.role_type === 'arsitek' || user?.role_type === 'kontraktor') && (
                <TeamPreviewSection user={user} />
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-12">
                {user?.role_type === 'notaris' && <NotarisLegalBrief project={project} />}
                
                <BidProposalFields 
                    proposal={proposal} setProposal={setProposal}
                    attachments={attachments} onFileChange={handleFileChange} onRemoveAttachment={removeAttachment}
                    isLoading={isLoading}
                    buttonText={user?.role_type === 'project_manager' ? "Submit Official Enterprise Bid" : "Submit Professional Proposal"}
                    feeType={feeType} setFeeType={setFeeType}
                    price={price} setPrice={setPrice}
                    notarisProfile={user?.role_type === 'notaris' ? profile : undefined}
                    isConsultationChecked={isConsultationChecked}
                    setIsConsultationChecked={setIsConsultationChecked}
                    selectedServices={selectedServices}
                    setSelectedServices={setSelectedServices}
                    errors={errors}
                    clearError={clearError}
                />
            </form>
        </div>
    );
};
