import React, { useState } from 'react';
import { 
    X, Check, Loader2, FileText, 
    ShieldCheck, AlertCircle, Percent, Layers, Users,
    Maximize2, Minimize2, ZoomIn, ZoomOut
} from 'lucide-react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import { ProposedTeamMember } from '../../../types/sub_professional.types';

interface ContractSignModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: any;
    bid: any;
    bidType: string;
    onSuccess: () => void;
    isClient?: boolean;
}

export const ContractSignModal: React.FC<ContractSignModalProps> = ({ isOpen, onClose, project, bid, bidType, onSuccess, isClient = false }) => {
    const { showToast } = useToast();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bankType, setBankType] = useState('');
    const [customBankType, setCustomBankType] = useState('');
    const [bankAccountNo, setBankAccountNo] = useState('');
    const [bankAccountName, setBankAccountName] = useState('');

    const saveDraft = (updates: any) => {
        const key = `4ceria_contract_draft_${project.id}_${bid.id}`;
        try {
            const currentDraftStr = sessionStorage.getItem(key);
            const currentDraft = currentDraftStr ? JSON.parse(currentDraftStr) : {};
            const newDraft = { ...currentDraft, ...updates };
            sessionStorage.setItem(key, JSON.stringify(newDraft));
        } catch (e) {
            console.error("Failed to save draft", e);
        }
    };

    const parsePaymentInstructions = (instructions: string) => {
        if (!instructions) return { bankType: '', customBankType: '', bankAccountNo: '', bankAccountName: '' };
        
        const cleanIns = instructions.trim();
        const match = cleanIns.match(/^Bank\s+(.+?)\s+-\s+No\.\s+Rekening:\s+(\d+)\s+a\.n\.\s+(.+)$/i);
        if (match) {
            const parsedType = match[1].trim();
            const knownBanks = ['BCA', 'Mandiri', 'BRI', 'BNI', 'BSI', 'CIMB Niaga', 'Permata', 'Danamon', 'Maybank', 'Mega', 'OCBC NISP', 'Jago'];
            const isKnown = knownBanks.includes(parsedType);
            return {
                bankType: isKnown ? parsedType : 'Other',
                customBankType: isKnown ? '' : parsedType,
                bankAccountNo: match[2].trim(),
                bankAccountName: match[3].trim()
            };
        }
        
        const altMatch = cleanIns.match(/^Bank:\s+(.+?)\s*\|\s*No\.\s*Rekening:\s*(.+?)\s*\|\s*A\/N:\s*(.+)$/i);
        if (altMatch) {
            const parsedType = altMatch[1].trim();
            const knownBanks = ['BCA', 'Mandiri', 'BRI', 'BNI', 'BSI', 'CIMB Niaga', 'Permata', 'Danamon', 'Maybank', 'Mega', 'OCBC NISP', 'Jago'];
            const isKnown = knownBanks.includes(parsedType);
            return {
                bankType: isKnown ? parsedType : 'Other',
                customBankType: isKnown ? '' : parsedType,
                bankAccountNo: altMatch[2].trim(),
                bankAccountName: altMatch[3].trim()
            };
        }
        
        return { bankType: '', customBankType: '', bankAccountNo: '', bankAccountName: '' };
    };

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoomScale, setZoomScale] = useState(100);

    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSigned, setHasSigned] = useState(false);
    const [professionalSigUrl, setProfessionalSigUrl] = useState<string | null>(null);

    const handleZoomIn = () => setZoomScale(prev => Math.min(prev + 10, 150));
    const handleZoomOut = () => setZoomScale(prev => Math.max(prev - 10, 50));

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';

        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // Mathematically precise mapping factoring in any physical layout scaling ratio
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if ('touches' in e) {
            e.preventDefault();
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // Mathematically precise mapping factoring in any physical layout scaling ratio
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        ctx.lineTo(x, y);
        ctx.stroke();
        setHasSigned(true);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (canvas) {
            const sigUrl = canvas.toDataURL('image/png');
            setProfessionalSigUrl(sigUrl);
            setHasSigned(true);
            saveDraft({ hasSigned: true, professionalSigUrl: sigUrl });
        }
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw guidance line
        const rect = canvas.getBoundingClientRect();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(20, rect.height - 40);
        ctx.lineTo(rect.width - 20, rect.height - 40);
        ctx.stroke();
        ctx.setLineDash([]); // Reset
        
        setHasSigned(false);
        setProfessionalSigUrl(null);
        saveDraft({ hasSigned: false, professionalSigUrl: null });
    };

    const clientName: string = project?.owner?.name || project?.user?.name || 'Pemilik Proyek';
    const professionalName: string = (
        bid?.arsitek?.user?.name || 
        bid?.kontraktor?.user?.name || 
        bid?.notaris?.user?.name || 
        bid?.interior?.user?.name || 
        bid?.pm?.user?.name || 
        bid?.structural?.user?.name || 
        bid?.mep?.user?.name || 
        bid?.bidder?.user?.name || 
        bid?.user?.name || 
        'Professional Specialist'
    );

    const renderSPKContent = () => (
        <>
            {/* Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none">
                <ShieldCheck size={200} className="text-stone-900" />
            </div>

            <div className="text-center space-y-1 relative z-10">
                <h3 className="font-bold text-sm tracking-wide text-stone-900 uppercase text-stone-850">SURAT PERJANJIAN KERJA (SPK)</h3>
                <p className="text-[8px] font-mono text-stone-400 tracking-wider">Nomor: SPK/{project.id}/{bid.id}</p>
            </div>

            <p className="text-justify text-stone-600 text-xs mt-6 relative z-10">
                Pada hari ini, <strong>{new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>, kami yang bertanda tangan di bawah ini sepakat untuk mengikatkan diri dalam Perjanjian Kerja konstruksi / perencanaan:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-stone-600 text-xs mt-6 relative z-10">
                <div className="space-y-1.5">
                    <h5 className="font-black text-stone-800 uppercase tracking-wide text-[9px]">Pihak Pertama (Pemilik Proyek)</h5>
                    <div className="pl-3.5 border-l-2 border-stone-300">
                        <p><strong>Nama:</strong> {clientName}</p>
                        <p><strong>Peran:</strong> Pemilik Proyek</p>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <h5 className="font-black text-stone-800 uppercase tracking-wide text-[9px]">Pihak Kedua (Penyedia Jasa)</h5>
                    <div className="pl-3.5 border-l-2 border-stone-300">
                        <p><strong>Nama:</strong> {professionalName}</p>
                        <p><strong>Peran:</strong> {bidType === 'arsitek' ? 'Lead Architect' : bidType === 'kontraktor' ? 'Lead Contractor' : bidType === 'notaris' ? 'Notary Partner' : bidType === 'interior' ? 'Interior Designer' : bidType === 'project_manager' ? 'Lead Project Manager' : 'Professional Specialist'}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-4 text-stone-650 text-xs mt-8 relative z-10">
                <div className="space-y-1.5">
                    <h5 className="font-bold text-stone-850 text-[10px]">PASAL 1: LINGKUP PEKERJAAN</h5>
                    <p className="text-justify pl-3 border-l border-stone-200">
                        Pihak Pertama memberikan tugas kepada Pihak Kedua, dan Pihak Kedua menerima tugas tersebut untuk melaksanakan pekerjaan <strong>{project.title}</strong> yang berlokasi di <strong>{project.lokasi || project.location_address || 'Lokasi Proyek'}</strong> dengan rincian lingkup tugas sesuai kesepakatan dan standar pengerjaan platform 4Ceria.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <h5 className="font-bold text-stone-850 text-[10px]">PASAL 2: NILAI PEKERJAAN & JASA</h5>
                    <p className="text-justify pl-3 border-l border-stone-200">
                        Total nilai pekerjaan disepakati sebesar <strong>Rp {Number(totalContractValue).toLocaleString('id-ID')}</strong>. Jumlah ini sudah termasuk seluruh paket dasar jasa profesional serta dokumen-dokumen hukum pendukung yang telah dipilih dan disepakati di platform.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <h5 className="font-bold text-stone-850 text-[10px]">PASAL 3: SKEMA PEMBAYARAN ESCROW</h5>
                    <p className="text-justify pl-3 border-l border-stone-200">
                        Pembayaran dilakukan secara termin menggunakan sistem Rekening Bersama (Escrow) 4Ceria. Setiap pencairan dana hanya dilakukan setelah deliverables/scope pada termin bersangkutan diunggah di dalam <strong>Document Vault</strong> dan disetujui oleh Pihak Pertama atau Project Manager yang ditunjuk.
                    </p>
                    <div className="pl-6 space-y-1 mt-1 text-[11px] text-stone-500">
                        {termins.map((t, idx) => (
                            <p key={idx}>• {t.label || `Termin ${idx + 1}`}: {t.percentage}% (Rp {Number(t.amount || Math.round((t.percentage / 100) * baseFeeAmount)).toLocaleString('id-ID')})</p>
                        ))}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <h5 className="font-bold text-stone-850 text-[10px]">PASAL 4: PENYELESAIAN PERSELISIHAN</h5>
                    <p className="text-justify pl-3 border-l border-stone-200">
                        Apabila terjadi perselisihan atau perbedaan pendapat dalam pelaksanaan perjanjian ini, para pihak sepakat untuk menyelesaikan secara musyawarah mufakat, atau menggunakan layanan mediasi yang disediakan oleh platform 4Ceria sebelum menempuh jalur hukum formal.
                    </p>
                </div>

                {/* Real-time Interactive Signature block */}
                <div className="grid grid-cols-2 gap-8 text-center text-[10px] mt-12 pt-8 border-t border-stone-200 relative z-10 text-stone-600">
                    <div className="space-y-1">
                        <p className="uppercase font-extrabold text-[9px] text-stone-400 tracking-wider">PIHAK PERTAMA (Pemilik)</p>
                        <div className="h-16 flex items-center justify-center relative">
                            {isClient ? (
                                professionalSigUrl ? (
                                    <img 
                                        src={professionalSigUrl} 
                                        alt="Client Signature" 
                                        className="max-h-14 max-w-full object-contain mix-blend-multiply transition-all duration-300 transform scale-110"
                                    />
                                ) : (
                                    <div className="border border-dashed border-rose-200 bg-rose-500/5 text-rose-500 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest">
                                        Sign below to verify
                                    </div>
                                )
                            ) : (
                                bid.client_signature_url ? (
                                    <img 
                                        src={bid.client_signature_url} 
                                        alt="Client Signature" 
                                        className="max-h-14 max-w-full object-contain mix-blend-multiply transition-all duration-300 transform scale-110"
                                    />
                                ) : (
                                    <div className="border border-dashed border-amber-200 bg-amber-500/5 text-amber-600 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest animate-pulse">
                                        Awaiting Client Signature
                                    </div>
                                )
                            )}
                        </div>
                        <p className="font-bold text-stone-900 border-t border-stone-300 pt-1 mx-8">{clientName}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="uppercase font-extrabold text-[9px] text-stone-400 tracking-wider">PIHAK KEDUA (Penyedia Jasa)</p>
                        <div className="h-16 flex items-center justify-center relative">
                            {isClient ? (
                                bid.pro_signature_url ? (
                                    <img 
                                        src={bid.pro_signature_url} 
                                        alt="Professional Signature" 
                                        className="max-h-14 max-w-full object-contain mix-blend-multiply transition-all duration-300 transform scale-110"
                                    />
                                ) : (
                                    <div className="border border-dashed border-amber-200 bg-amber-500/5 text-amber-600 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest">
                                        Awaiting Pro Signature
                                    </div>
                                )
                            ) : (
                                professionalSigUrl ? (
                                    <img 
                                        src={professionalSigUrl} 
                                        alt="Professional Signature" 
                                        className="max-h-14 max-w-full object-contain mix-blend-multiply transition-all duration-300 transform scale-110"
                                    />
                                ) : (
                                    <div className="border border-dashed border-rose-200 bg-rose-500/5 text-rose-500 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest">
                                        Sign below to verify
                                    </div>
                                )
                            )}
                        </div>
                        <p className="font-bold text-stone-900 border-t border-stone-300 pt-1 mx-8">{professionalName}</p>
                    </div>
                </div>
            </div>
        </>
    );

    React.useEffect(() => {
        if (isOpen) {
            const draftKey = `4ceria_contract_draft_${project.id}_${bid.id}`;
            let draft: any = null;
            try {
                const draftStr = sessionStorage.getItem(draftKey);
                if (draftStr) {
                    draft = JSON.parse(draftStr);
                }
            } catch (e) {
                console.error("Failed to parse draft", e);
            }

            if (draft && !bid?.pro_signature_url && !bid?.client_signature_url) {
                setBankType(draft.bankType || '');
                setCustomBankType(draft.customBankType || '');
                setBankAccountNo(draft.bankAccountNo || '');
                setBankAccountName(draft.bankAccountName || '');
                setHasSigned(!!draft.hasSigned);
                setProfessionalSigUrl(draft.professionalSigUrl || null);
            } else {
                let initialInstructions = '';
                if (isClient || bid?.pro_signature_url) {
                    initialInstructions = bid?.payment_instructions || project?.payment_instructions || '';
                    if (isClient && bid?.client_signature_url) {
                        setProfessionalSigUrl(bid.client_signature_url);
                        setHasSigned(true);
                    } else if (!isClient && bid?.pro_signature_url) {
                        setProfessionalSigUrl(bid.pro_signature_url);
                        setHasSigned(true);
                    } else {
                        setHasSigned(false);
                        setProfessionalSigUrl(null);
                    }
                } else {
                    // It's a professional signing. Prefer logged-in user profile's bank details.
                    if (user?.bank_name || user?.bank_account_number || user?.bank_account_name) {
                        const parsedType = user?.bank_name || '';
                        const knownBanks = ['BCA', 'Mandiri', 'BRI', 'BNI', 'BSI', 'CIMB Niaga', 'Permata', 'Danamon', 'Maybank', 'Mega', 'OCBC NISP', 'Jago'];
                        const isKnown = knownBanks.includes(parsedType);
                        
                        setBankType(isKnown ? parsedType : (parsedType ? 'Other' : ''));
                        setCustomBankType(isKnown ? '' : parsedType);
                        setBankAccountNo(user?.bank_account_number || '');
                        setBankAccountName(user?.bank_account_name || '');
                        setHasSigned(false);
                        setProfessionalSigUrl(null);
                    } else {
                        // Fallback only to the bid's existing payment instructions (if the pro saved a draft or previously signed).
                        // NEVER fallback to project?.payment_instructions, as that belongs to the client/PM.
                        initialInstructions = bid?.payment_instructions || '';
                    }
                }

                if (initialInstructions) {
                    const parsed = parsePaymentInstructions(initialInstructions);
                    setBankType(parsed.bankType);
                    setCustomBankType(parsed.customBankType);
                    setBankAccountNo(parsed.bankAccountNo);
                    setBankAccountName(parsed.bankAccountName);
                    
                    if (!bid?.client_signature_url && !bid?.pro_signature_url) {
                        setHasSigned(false);
                        setProfessionalSigUrl(null);
                    }
                }
            }
            
            // Set up signature canvas size with dynamic bounding box scale
            setTimeout(() => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
                
                // Set canvas styles
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    
                    // Draw guidance baseline
                    ctx.strokeStyle = '#e2e8f0';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(20, rect.height - 40);
                    ctx.lineTo(rect.width - 20, rect.height - 40);
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset
                    
                    // Draw existing signature image if it exists in draft
                    const sigUrlToRender = draft ? draft.professionalSigUrl : null;
                    if (sigUrlToRender) {
                        const img = new Image();
                        img.src = sigUrlToRender;
                        img.onload = () => {
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        };
                    }
                }
            }, 150);
        }
    }, [isOpen, bid?.payment_instructions, project?.payment_instructions, user]);
    
    // IMMUTABLE STATE - Purely for display
    // Reactive data derived from props
    const termins = React.useMemo(() => {
        return (bid.proposed_termins || []).map((t: any) => ({
            ...t,
            label: t.trigger_description || t.label || 'Payment Phase',
            percentage: Number(t.percentage) || 0,
            amount: Number(t.amount) || 0,
            milestone_index: t.milestone_index ?? -1
        }));
    }, [bid.proposed_termins]);

    const milestones = React.useMemo(() => {
        const raw = bid.proposed_milestones || [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return (Array.isArray(parsed) ? parsed : []).map((m: any) => ({
            ...m,
            title: m.title || '',
            description: m.description || '',
            services: m.services || m.content?.services || m.items || m.assigned_services || []
        }));
    }, [bid.proposed_milestones]);

    const proposedTeam = React.useMemo((): ProposedTeamMember[] => {
        const raw = bid.proposed_team || [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return (Array.isArray(parsed) ? parsed : []).map((m: any) => ({
            team_member_id: m.team_member_id ?? null,
            name: m.name || '',
            role_title: m.role_title || '',
            role: m.role || 'other',
            fee: Number(m.fee) || 0,
            fee_type: m.fee_type || 'fixed',
            note: m.note || ''
        }));
    }, [bid.proposed_team]);

    const paymentNotes = bid.payment_instructions || '';

    // Calculation constants
    const safeBudget = Number(project?.budget) || 0;
    const availableServices = bid.selected_services || [];
    const servicesTotal = availableServices.reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);
    const agreedFee = Number(bid.calculated_total) || 0;
    
    // The true base fee is the calculated total minus any additional services.
    // If calculated_total is missing (legacy/edge cases), fallback to robust manual calculation.
    // Use Math.ceil + min-1 for percentage fees to prevent sub-1 Rp values from rounding to 0.
    const rawFallback = bid.fee_type === 'percentage' 
        ? (Number(bid.price) / 100) * safeBudget
        : (Number(bid.price) || 0);
    const fallbackBaseFee = rawFallback > 0 ? Math.max(1, Math.ceil(rawFallback)) : 0;
        
    const baseFeeAmount = agreedFee > 0 
        ? Math.max(0, agreedFee - servicesTotal) 
        : fallbackBaseFee;

    // Total contract value: use agreedFee if available, otherwise reconstruct from fallback.
    const totalContractValue = agreedFee > 0 ? agreedFee : (baseFeeAmount + servicesTotal);

    const projectArea = React.useMemo(() => {
        const dims = project?.project_dimensions;
        if (!dims) return 0;
        return Number(dims.building_area) || 
               Number(dims.building_size) || 
               Number(dims.renovation_area) || 
               Number(dims.area_size) || 
               Number(dims.land_area) || 
               Number(dims.land_size) || 
               Number(project?.design_details?.targetArea) || 0;
    }, [project]);

    const totalPercentage = termins.reduce((sum, t) => sum + Number(t.percentage), 0);

    const handleSubmit = async () => {
        if (isClient) {
            if (!hasSigned || !professionalSigUrl) {
                showToast('Draw your digital signature in the canvas pad before finalizing.', 'error');
                return;
            }
            setIsSubmitting(true);
            try {
                await axios.post(`/projects/${project.id}/bids/${bid.id}/client-sign-contract`, {
                    bid_type: bidType,
                    signature: professionalSigUrl
                });
                try {
                    sessionStorage.removeItem(`4ceria_contract_draft_${project.id}_${bid.id}`);
                } catch (e) {}
                showToast('Contract signed successfully!', 'success');
                onSuccess();
                onClose();
            } catch (error: any) {
                showToast(error.response?.data?.message || 'Failed to sign contract', 'error');
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        const finalBankType = bankType === 'Other' ? customBankType.trim() : bankType;
        
        if (!finalBankType) {
            showToast('Bank brand/name is required.', 'error');
            return;
        }

        if (!bankAccountNo || bankAccountNo.trim().length < 5) {
            showToast('A valid bank account number (at least 5 digits) is required.', 'error');
            return;
        }

        if (!bankAccountName || bankAccountName.trim().length < 3) {
            showToast('A valid bank account holder name is required (at least 3 characters).', 'error');
            return;
        }

        if (!hasSigned || !professionalSigUrl) {
            showToast('Draw your digital signature in the canvas pad before finalizing.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            // FINAL CALCULATION: Ensure all termins have their absolute Rupiah amounts calculated 
            // before we commit to the DB, ensuring no "Rp 0" payments appear in the hub.
            const finalTermins = termins.map((t) => {
                const milestone = t.milestone_index >= 0 ? milestones[t.milestone_index] : null;
                
                // Use the same robust service extraction logic as the UI
                let milestoneServices = [
                    ...(milestone?.services || []),
                    ...(milestone?.content?.services || []),
                    ...(milestone?.items || []),
                    ...(t?.services || []),
                    ...(t?.content?.services || [])
                ];

                if (milestoneServices.length === 0 && availableServices.length > 0) {
                    milestoneServices = availableServices.filter((s: any) => s.milestone_index === t.milestone_index);
                }

                const basePortion = Math.round((Number(t.percentage) / 100) * baseFeeAmount);
                const servicesPortion = milestoneServices.reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);
                
                return {
                    ...t,
                    amount: basePortion + servicesPortion
                };
            });

            await axios.post(`/projects/${project.id}/bids/${bid.id}/sign-contract`, {
                bid_type: bidType,
                termins: finalTermins,
                milestones: milestones,
                payment_instructions: `Bank: ${finalBankType} | No. Rekening: ${bankAccountNo} | A/N: ${bankAccountName}`,
                bank_type: finalBankType,
                bank_account_no: bankAccountNo,
                bank_account_name: bankAccountName,
                signature: professionalSigUrl
            });
            try {
                sessionStorage.removeItem(`4ceria_contract_draft_${project.id}_${bid.id}`);
            } catch (e) {}
            showToast('Contract signed successfully!', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to sign contract', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <>
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl h-[95vh] max-h-[95vh] overflow-hidden flex flex-col shadow-2xl">
                {/* Header */}
                <div className="py-3 px-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Contract Signature Preview</h3>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Project: {project.title}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Summary Card */}
                    <div className="bg-zinc-800/50 rounded-3xl p-6 border border-zinc-700/50 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Negotiated Base Fee</span>
                            <span className="text-sm font-bold text-zinc-300">Rp {Number(baseFeeAmount).toLocaleString()}</span>
                        </div>
                        
                        {servicesTotal > 0 && (
                            <div className="space-y-2 pt-2 border-t border-zinc-700/30">
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Included Services</span>
                                {availableServices.map((s: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[10px]">
                                        <span className="text-zinc-400 font-medium">{s.title || s.name || s.label || 'Legal Document'}</span>
                                        <span className="text-zinc-400">Rp {Number(s.price).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t-2 border-zinc-700">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Total Contract Value</span>
                            <span className="text-xl font-black text-emerald-500">Rp {Number(totalContractValue).toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Official SPK Draft Preview */}
                    <div className="space-y-3 pt-4 border-t-2 border-zinc-800">
                        <div className="flex items-center gap-2">
                            <FileText size={14} className="text-amber-500" />
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Official SPK Draft Preview</h4>
                        </div>
                        <div className="bg-white rounded-xl p-8 max-h-[400px] overflow-y-auto text-stone-850 font-sans relative shadow-inner">
                            {renderSPKContent()}
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsFullscreen(true)}
                            className="w-full bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-700/50 hover:border-zinc-650 text-zinc-300 hover:text-white text-[10px] font-black uppercase tracking-widest py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md group mt-1.5"
                        >
                            <Maximize2 size={12} className="text-zinc-400 group-hover:text-white group-hover:scale-110 transition-all" />
                            <span>View Fullscreen SPK Document</span>
                        </button>
                    </div>

                    {/* Interactive Digital Signature Pad */}
                    {((isClient && !bid?.client_signature_url) || (!isClient && !bid?.pro_signature_url)) && (
                        <div className="space-y-3 pt-4 border-t border-zinc-800 animate-in fade-in duration-300">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                                    Draw Your Digital Signature <span className="text-rose-500 font-bold">*</span>
                                </label>
                                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Required</span>
                            </div>
                            
                            <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 space-y-4 relative overflow-hidden">
                                <div className="relative bg-white rounded-2xl overflow-hidden h-36 w-full flex items-center justify-center border border-zinc-700 shadow-inner">
                                    <canvas
                                        ref={canvasRef}
                                        onMouseDown={startDrawing}
                                        onMouseMove={draw}
                                        onMouseUp={stopDrawing}
                                        onMouseLeave={stopDrawing}
                                        onTouchStart={startDrawing}
                                        onTouchMove={draw}
                                        onTouchEnd={stopDrawing}
                                        className="absolute inset-0 w-full h-full bg-white cursor-default touch-none"
                                    />
                                    {!hasSigned && (
                                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-1 select-none">
                                            <span className="text-[10px] font-black tracking-widest uppercase text-zinc-500">Sign Your Name Here</span>
                                            <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-wider">Use mouse, finger, or stylus</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                        {hasSigned ? '✓ Digital signature locked dynamically to SPK document' : 'Awaiting signature drawing...'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={clearCanvas}
                                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 hover:text-white text-zinc-400 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border border-zinc-700/40"
                                    >
                                        Clear Canvas
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Termins List */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Payment Schedule Preview</h4>
                            <div className="flex items-center gap-2 text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                <ShieldCheck size={12} className="text-emerald-500" />
                                Confirmed Breakdown
                            </div>
                        </div>

                        {termins.map((termin, index) => {
                            const milestone = termin.milestone_index >= 0 ? milestones[termin.milestone_index] : null;
                            
                            // Aggressive service extraction with "Self-Healing" Fallback
                            let milestoneServices = [
                                ...(milestone?.services || []),
                                ...(milestone?.content?.services || []),
                                ...(milestone?.items || []),
                                ...(termin?.services || []),
                                ...(termin?.content?.services || [])
                            ];

                            // SELF-HEALING: If no services found in nested data, try to re-map from global selected_services
                            // by checking the milestone_index tag we added in the negotiation phase.
                            if (milestoneServices.length === 0 && availableServices.length > 0) {
                                milestoneServices = availableServices.filter((s: any) => s.milestone_index === termin.milestone_index);
                            }
                            
                            // Calculate current termin amount: (base_percentage * base_fee) + phase_services
                            const basePortion = Math.round((Number(termin.percentage) / 100) * baseFeeAmount);
                            const servicesPortion = milestoneServices.reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0);
                            const currentTotal = basePortion + servicesPortion;

                            return (
                                <div key={index} className="bg-zinc-800/30 border border-zinc-700/30 rounded-3xl p-6 space-y-4">
                                    <div className="flex gap-4 items-end">
                                        <div className="flex-1">
                                            <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Label</label>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-300">
                                                {termin.label}
                                            </div>
                                        </div>
                                        <div className="w-24">
                                            <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Base %</label>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-300 flex justify-between items-center">
                                                <span>{termin.percentage}</span>
                                                <Percent size={10} className="text-zinc-600" />
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[8px] font-black text-emerald-500/50 uppercase tracking-widest block mb-1">Total Amount (Rp)</label>
                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-black text-emerald-500">
                                                Rp {currentTotal.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Deliverables & Services Preview */}
                                    {(milestone?.description || milestoneServices.length > 0 || bidType === 'notaris') && (
                                        <div className="pt-4 border-t border-zinc-700/30 space-y-3">
                                            {milestone?.description && (
                                                <div className="space-y-1">
                                                    <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">Deliverables / Scope</label>
                                                    <p className="text-[10px] text-zinc-400 font-semibold leading-relaxed">
                                                        {milestone.description}
                                                    </p>
                                                </div>
                                            )}

                                            {(milestoneServices.length > 0 || bidType === 'notaris') && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Legal Documents</span>
                                                        {milestoneServices.length > 0 && (
                                                            <span className="text-[8px] font-bold text-emerald-500/70 uppercase">
                                                                Includes {milestoneServices.length} Documents
                                                            </span>
                                                        )}
                                                    </div>
                                                    {milestoneServices.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {milestoneServices.map((service: any, sIdx: number) => {
                                                                const displayName = service.title || service.name || service.label || service.document_name || 'Legal Document';
                                                                return (
                                                                    <div
                                                                        key={sIdx}
                                                                        className="px-3 py-1.5 rounded-lg text-[9px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center gap-1.5"
                                                                    >
                                                                        <FileText size={10} />
                                                                        <span>{displayName}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-[8px] font-bold text-zinc-600 uppercase italic">No legal documents assigned to this phase</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Totals Row */}
                        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center italic">Terms are locked to negotiation results</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-emerald-500">
                                    {totalPercentage.toFixed(1)}% Total
                                </span>
                                <Check size={14} className="text-emerald-500" />
                            </div>
                        </div>
                    </div>

                    {/* Proposed Team Section Preview */}
                    {proposedTeam.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-zinc-800">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Proposed Team Composition</h4>
                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                    <Users size={12} className="text-zinc-500" />
                                    {proposedTeam.length} Member{proposedTeam.length > 1 ? 's' : ''}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {proposedTeam.map((member, index) => (
                                    <div key={index} className="bg-zinc-800/30 border border-zinc-700/30 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-black text-emerald-400 text-sm shrink-0">
                                                {member.name ? member.name.charAt(0) : 'T'}
                                            </div>
                                            <div>
                                                <h5 className="text-xs font-black text-white uppercase tracking-wider">{member.name || 'Unnamed Member'}</h5>
                                                <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">{member.role_title || 'Team Member'}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:items-end gap-1 shrink-0">
                                            <span className="text-xs font-black text-white">
                                                Rp {(() => {
                                                    const feeVal = member.fee || 0;
                                                    if (member.fee_type === 'percentage') {
                                                        return Math.round((feeVal / 100) * baseFeeAmount).toLocaleString();
                                                    }
                                                    return feeVal.toLocaleString();
                                                })()}
                                            </span>
                                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                                                {member.fee_type === 'percentage' ? `${member.fee}% of Project` :
                                                 'Fixed Amount'}
                                            </span>
                                            {member.note && (
                                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider max-w-[200px] truncate block mt-0.5">
                                                    {member.note}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Bank Details & Payment Instructions (Required / Readonly for Client or Signed Pro) */}
                    {(isClient || bid?.pro_signature_url) ? (
                        <div className="space-y-4 pt-4 border-t border-zinc-800">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1">
                                    Professional's Bank Details
                                </label>
                                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded">Saved</span>
                            </div>
                            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-0.5">Bank Name</span>
                                        <span className="text-xs font-bold text-zinc-300">{bankType === 'Other' ? customBankType : bankType}</span>
                                    </div>
                                    <div>
                                        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-0.5">Account Number (No. Rekening)</span>
                                        <span className="text-xs font-bold text-zinc-300">{bankAccountNo}</span>
                                    </div>
                                </div>
                                <div className="pt-2.5 border-t border-zinc-850">
                                    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-0.5">Account Holder Name (A/N)</span>
                                    <span className="text-xs font-bold text-zinc-300">{bankAccountName}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 pt-4 border-t border-zinc-800">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1">
                                    Bank Account Details <span className="text-rose-500 font-bold">*</span>
                                </label>
                                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Required</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Bank Brand Selection */}
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block">Bank / Brand</label>
                                    <select
                                        value={bankType}
                                        onChange={(e) => {
                                            const newType = e.target.value;
                                            setBankType(newType);
                                            if (newType !== 'Other') {
                                                setCustomBankType('');
                                                saveDraft({ bankType: newType, customBankType: '' });
                                            } else {
                                                saveDraft({ bankType: newType });
                                            }
                                        }}
                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-2xl p-3.5 text-xs font-bold text-zinc-300 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all cursor-pointer"
                                    >
                                        <option value="" disabled className="bg-zinc-900 text-zinc-500">Select Bank</option>
                                        <option value="BCA" className="bg-zinc-900 text-zinc-300">Bank Central Asia (BCA)</option>
                                        <option value="Mandiri" className="bg-zinc-900 text-zinc-300">Bank Mandiri</option>
                                        <option value="BRI" className="bg-zinc-900 text-zinc-300">Bank Rakyat Indonesia (BRI)</option>
                                        <option value="BNI" className="bg-zinc-900 text-zinc-300">Bank Negara Indonesia (BNI)</option>
                                        <option value="BSI" className="bg-zinc-900 text-zinc-300">Bank Syariah Indonesia (BSI)</option>
                                        <option value="CIMB Niaga" className="bg-zinc-900 text-zinc-300">Bank CIMB Niaga</option>
                                        <option value="Permata" className="bg-zinc-900 text-zinc-300">Bank Permata</option>
                                        <option value="Danamon" className="bg-zinc-900 text-zinc-300">Bank Danamon</option>
                                        <option value="Maybank" className="bg-zinc-900 text-zinc-300">Maybank Indonesia</option>
                                        <option value="Mega" className="bg-zinc-900 text-zinc-300">Bank Mega</option>
                                        <option value="OCBC NISP" className="bg-zinc-900 text-zinc-300">Bank OCBC NISP</option>
                                        <option value="Jago" className="bg-zinc-900 text-zinc-300">Bank Jago</option>
                                        <option value="Other" className="bg-zinc-900 text-zinc-300">Other Bank (Lainnya)</option>
                                    </select>
                                </div>

                                {/* Account Number (No. Rekening) */}
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block">Account Number (No. Rekening)</label>
                                    <input
                                        type="text"
                                        value={bankAccountNo}
                                        onChange={(e) => {
                                            // Allow only digits
                                            const cleanVal = e.target.value.replace(/\D/g, '');
                                            setBankAccountNo(cleanVal);
                                            saveDraft({ bankAccountNo: cleanVal });
                                        }}
                                        placeholder="e.g. 1234567890"
                                        className="w-full bg-zinc-950/80 border border-zinc-700 rounded-2xl p-3.5 text-xs font-bold text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Custom Bank Name Input (If Other selected) */}
                            {bankType === 'Other' && (
                                <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <label className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block">Specify Bank Name</label>
                                    <input
                                        type="text"
                                        value={customBankType}
                                        onChange={(e) => {
                                            const newVal = e.target.value;
                                            setCustomBankType(newVal);
                                            saveDraft({ customBankType: newVal });
                                        }}
                                        placeholder="Enter your bank brand name"
                                        className="w-full bg-zinc-950/80 border border-zinc-700 rounded-2xl p-3.5 text-xs font-bold text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                    />
                                </div>
                            )}

                            {/* Account Holder Name (Nama Pemilik Rekening) */}
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-zinc-400 uppercase tracking-widest block">Account Holder Name (Nama Pemilik Rekening)</label>
                                <input
                                    type="text"
                                    value={bankAccountName}
                                    onChange={(e) => {
                                        const newVal = e.target.value;
                                        setBankAccountName(newVal);
                                        saveDraft({ bankAccountName: newVal });
                                    }}
                                    placeholder="e.g. Aisha Project Management"
                                    className="w-full bg-zinc-950/80 border border-zinc-700 rounded-2xl p-3.5 text-xs font-bold text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="py-3 px-6 border-t border-zinc-800 bg-zinc-900/80">
                    <div className="flex gap-3">
                        {((isClient && !bid?.client_signature_url) || (!isClient && !bid?.pro_signature_url)) ? (
                            <>
                                <button 
                                    onClick={onClose}
                                    disabled={isSubmitting}
                                    className="w-1/3 py-2.5 bg-zinc-800 text-zinc-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-700 hover:text-white transition-all text-center"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="w-2/3 py-2.5 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all"
                                >
                                    {isSubmitting ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <>
                                            <ShieldCheck size={18} />
                                            Sign & Finalize Contract
                                        </>
                                    )}
                                </button>
                            </>
                        ) : (
                            <button 
                                onClick={onClose}
                                className="w-full py-2.5 bg-zinc-800 text-zinc-300 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border border-zinc-700 hover:bg-zinc-700 text-center"
                            >
                                Close Preview
                            </button>
                        )}
                    </div>
                    {((isClient && !bid?.client_signature_url) || (!isClient && !bid?.pro_signature_url)) && (
                        <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest text-center mt-1.5 leading-relaxed">
                            By clicking "Sign & Finalize", you formally accept the terms above.<br/> 
                            A legal SPK document will be generated immediately.
                        </p>
                    )}
                </div>
            </div>
        </div>

        {/* Fullscreen Document Viewer Overlay */}
        {isFullscreen && (
            <div className="fixed inset-0 z-[99999] bg-zinc-950/95 backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in duration-200">
                {/* Floating prominent close button in the top-left background area */}
                <button 
                    type="button"
                    onClick={() => setIsFullscreen(false)}
                    className="fixed top-5 left-5 p-3.5 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-full transition-all border border-zinc-700/60 shadow-2xl flex items-center justify-center hover:scale-110 z-[100000] backdrop-blur-md"
                    title="Close Fullscreen"
                >
                    <X size={20} className="stroke-[2.5]" />
                </button>

                {/* Header/Toolbar */}
                <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0 pl-20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                            <FileText size={18} />
                        </div>
                        <div>
                            <h3 className="text-xs font-black text-white uppercase tracking-widest">Surat Perjanjian Kerja (SPK)</h3>
                            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Fullscreen Draft Preview</p>
                        </div>
                    </div>

                    {/* Zoom Controls & Close */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center bg-zinc-800 border border-zinc-700/60 rounded-xl overflow-hidden px-1 py-0.5">
                            <button 
                                type="button"
                                onClick={handleZoomOut}
                                className="p-2 text-zinc-400 hover:text-white transition-colors"
                                title="Zoom Out"
                            >
                                <ZoomOut size={14} />
                            </button>
                            <span className="text-[10px] font-black text-zinc-300 w-12 text-center uppercase tracking-wider select-none">
                                {zoomScale}%
                            </span>
                            <button 
                                type="button"
                                onClick={handleZoomIn}
                                className="p-2 text-zinc-400 hover:text-white transition-colors"
                                title="Zoom In"
                            >
                                <ZoomIn size={14} />
                            </button>
                        </div>

                        <button 
                            type="button"
                            onClick={() => setIsFullscreen(false)}
                            className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all border border-zinc-700/60"
                        >
                            <Minimize2 size={12} />
                            Close Fullscreen
                        </button>
                    </div>
                </div>

                {/* Scrollable Canvas Area */}
                <div 
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setIsFullscreen(false);
                        }
                    }}
                    className="flex-1 overflow-auto p-12 flex justify-center items-start bg-zinc-950/40 cursor-zoom-out"
                >
                    <div 
                        style={{ 
                            transform: `scale(${zoomScale / 100})`, 
                            transformOrigin: 'top center',
                            transition: 'transform 0.1s ease-out'
                        }} 
                        className="bg-white rounded-2xl p-16 w-full max-w-5xl text-stone-850 font-sans relative shadow-2xl border border-stone-200/20 my-4 cursor-default animate-in zoom-in-95 duration-200 h-fit"
                    >
                        {renderSPKContent()}
                    </div>
                </div>
            </div>
        )}
    </>,
    document.body
);
};
