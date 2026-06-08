import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, X, CheckCircle2, DollarSign } from 'lucide-react';
import { NotaryFeeSelector } from './NotaryFeeSelector';

interface Props {
    proposal: string;
    setProposal: (v: string) => void;
    attachments: File[];
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveAttachment: (i: number) => void;
    isLoading: boolean;
    buttonText?: string;
    feeType?: string;
    setFeeType?: (v: string) => void;
    price?: number;
    setPrice?: (v: number | undefined) => void;
    notarisProfile?: {
        rate_harga?: string | number;
        services?: Array<{ title: string; price: number; description?: string }>;
    };
    isConsultationChecked?: boolean;
    setIsConsultationChecked?: (v: boolean) => void;
    selectedServices?: any[];
    setSelectedServices?: (v: any[]) => void;
    errors?: { proposal?: string; price?: string };
    clearError?: (field: 'proposal' | 'price') => void;
}

export const BidProposalFields: React.FC<Props> = ({ 
    proposal, setProposal, attachments, onFileChange, onRemoveAttachment, isLoading,
    buttonText = "Submit Official Proposal",
    feeType, setFeeType, price, setPrice,
    notarisProfile,
    isConsultationChecked, setIsConsultationChecked,
    selectedServices, setSelectedServices,
    errors, clearError
}) => {
    // Local display value to handle auto-formatting and intermediate user typing (e.g. dots, decimal points)
    const [inputValue, setInputValue] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Synchronize local display value with price prop when price changes externally or on mount
    useEffect(() => {
        if (price === undefined || price === null) {
            setInputValue('');
            return;
        }

        // Parse what we currently have in inputValue
        let currentParsed: number | undefined;
        if (feeType === 'percentage') {
            const clean = inputValue.replace(/,/g, '.').replace(/[^0-9.]/g, '');
            currentParsed = clean ? Number(clean) : undefined;
        } else {
            const clean = inputValue.replace(/\D/g, '');
            currentParsed = clean ? Number(clean) : undefined;
        }

        // Only overwrite display value if it is numerically different from the price prop
        if (currentParsed !== price) {
            if (feeType === 'percentage') {
                setInputValue(price.toString());
            } else {
                setInputValue(new Intl.NumberFormat('id-ID').format(price));
            }
        }
    }, [price, feeType]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const selectionStart = e.target.selectionStart || 0;

        if (feeType === 'percentage') {
            // Allow digits and at most one decimal point (dot or comma)
            let clean = val.replace(/,/g, '.').replace(/[^0-9.]/g, '');
            const parts = clean.split('.');
            if (parts.length > 2) {
                clean = parts[0] + '.' + parts.slice(1).join('');
            }

            setInputValue(clean);

            const num = clean ? Number(clean) : undefined;
            if (num !== undefined && !isNaN(num)) {
                setPrice?.(num);
            } else {
                setPrice?.(undefined);
            }
            if (clearError) clearError('price');
        } else {
            // Fixed Rupiah: keep only digits
            const raw = val.replace(/\D/g, '');
            if (!raw) {
                setInputValue('');
                setPrice?.(undefined);
                if (clearError) clearError('price');
                return;
            }

            const num = Number(raw);
            const formatted = new Intl.NumberFormat('id-ID').format(num);

            setInputValue(formatted);
            setPrice?.(num);
            if (clearError) clearError('price');

            // Prevent cursor from jumping to the end by calculating its offset
            setTimeout(() => {
                const input = inputRef.current;
                if (!input) return;
                
                // Count how many digits exist before the old selection position
                const digitsBeforeCursor = val.substring(0, selectionStart).replace(/\D/g, '').length;
                
                // Find corresponding cursor position in formatted string
                let newCursorPos = 0;
                let digitsCounter = 0;
                for (let i = 0; i < formatted.length; i++) {
                    if (formatted[i].match(/\d/)) {
                        digitsCounter++;
                    }
                    newCursorPos++;
                    if (digitsCounter === digitsBeforeCursor) {
                        break;
                    }
                }
                input.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        }
    };

    return (
        <>
            {/* Proposal Text & Files */}
            <div className="space-y-10">
                {setFeeType && setPrice && (
                    notarisProfile ? (
                        <NotaryFeeSelector 
                            rateHarga={notarisProfile.rate_harga}
                            services={notarisProfile.services}
                            isConsultationChecked={isConsultationChecked || false}
                            setIsConsultationChecked={setIsConsultationChecked || (() => {})}
                            selectedServices={selectedServices || []}
                            setSelectedServices={setSelectedServices || (() => {})}
                        />
                    ) : (
                        <div className="bg-zinc-50 rounded-[2.5rem] p-8 border border-zinc-100 space-y-6">
                            <div>
                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                    <DollarSign size={16} className="text-emerald-500" />
                                    Commercial Alignment <span className="text-[10px] text-red-600 font-bold uppercase tracking-tight">(Required)</span>
                                </h4>
                                <p className="text-xs text-zinc-500 mt-1 font-medium">Please specify your estimated fee to proceed with your proposal.</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estimated Fee Type</label>
                                    <select 
                                        value={feeType || ''} 
                                        onChange={(e) => setFeeType(e.target.value)}
                                        className="w-full px-5 py-4 bg-white border-2 border-zinc-150 focus:border-slate-900 rounded-2xl font-bold text-sm text-gray-700 outline-none transition-all cursor-pointer"
                                    >
                                        <option value="fixed">Fixed Rupiah Amount (IDR)</option>
                                        <option value="percentage">Percentage of Project Budget (%)</option>
                                    </select>
                                </div>
     
                                {feeType ? (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            Estimated Fee {feeType === 'percentage' ? '(%)' : '(IDR)'}
                                        </label>
                                        <input 
                                            ref={inputRef}
                                            type="text" 
                                            value={inputValue} 
                                            onChange={handleChange}
                                            placeholder={feeType === 'percentage' ? 'e.g. 5' : 'e.g. 20.000.000'}
                                            className={`w-full px-5 py-4 bg-white border-2 rounded-2xl font-bold text-sm text-gray-700 outline-none transition-all ${
                                                errors?.price 
                                                    ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/10' 
                                                    : 'border-zinc-150 focus:border-slate-900'
                                            }`}
                                        />
                                        {errors?.price && (
                                            <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mt-2 flex items-center gap-1.5 animate-fadeIn">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block animate-pulse shrink-0"></span>
                                                {errors.price}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="hidden md:flex items-center text-xs font-semibold text-zinc-400 italic">
                                        Select a fee type to specify your estimated fee.
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                )}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/20">
                            <FileText size={16} />
                        </div>
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Executive Summary</h4>
                    </div>
                    <textarea 
                        value={proposal} 
                        onChange={(e) => {
                            setProposal(e.target.value);
                            if (clearError) clearError('proposal');
                        }} 
                        rows={6}
                        placeholder="Detail your professional approach, unique methodology, and why you are the best fit for this project..."
                        className={`w-full px-8 py-6 bg-zinc-50 border-2 focus:bg-white rounded-[2rem] font-medium text-[13.5px] text-gray-600 outline-none transition-all resize-none shadow-inner ${
                            errors?.proposal 
                                ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/10' 
                                : 'border-zinc-100 focus:border-slate-900'
                        }`}
                    />
                    {errors?.proposal && (
                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mt-2 flex items-center gap-1.5 animate-fadeIn">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block animate-pulse shrink-0"></span>
                            {errors.proposal}
                        </p>
                    )}
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Upload size={14} className="text-zinc-400" /> Supporting Attachments (Max 3)
                    </label>
                    <div className="flex flex-wrap gap-4">
                        {attachments.map((file, i) => (
                            <div key={i} className="flex items-center gap-3 pl-5 pr-3 py-3 bg-white rounded-2xl border border-zinc-200 shadow-sm group">
                                <FileText size={14} className="text-slate-400" />
                                <span className="text-[10px] font-black text-zinc-900 truncate max-w-[150px]">{file.name}</span>
                                <button type="button" onClick={() => onRemoveAttachment(i)} className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-red-500 transition-colors">
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                        {attachments.length < 3 && (
                            <label className="flex flex-col items-center justify-center w-32 h-32 bg-white border-2 border-dashed border-zinc-200 rounded-[2rem] cursor-pointer hover:border-slate-900 hover:bg-zinc-50 transition-all text-zinc-400 hover:text-slate-900 group">
                                <Upload size={24} className="mb-2 group-hover:-translate-y-1 transition-transform" />
                                <span className="text-[8px] font-black uppercase tracking-widest">Add File</span>
                                <input type="file" className="hidden" onChange={onFileChange} accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" />
                            </label>
                        )}
                    </div>
                </div>
            </div>

            <div className="pt-10 border-t border-zinc-100">
                <button 
                    type="submit" disabled={isLoading}
                    className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-[13px] uppercase tracking-[0.4em] shadow-[0_20px_50px_rgba(15,23,42,0.3)] hover:-translate-y-1.5 active:scale-95 transition-all disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-4"
                >
                    {isLoading ? (
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            Transmitting Proposal...
                        </div>
                    ) : (
                        <>
                            <CheckCircle2 size={20} className="text-white/80" />
                            {buttonText}
                        </>
                    )}
                </button>
                <p className="text-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mt-6 max-w-md mx-auto leading-relaxed">
                    By submitting, you formally enter the 4Ceria professional network tender protocol.
                </p>
            </div>
        </>
    );
};
