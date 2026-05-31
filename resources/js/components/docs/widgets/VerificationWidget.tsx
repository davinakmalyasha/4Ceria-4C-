import React, { useState } from 'react';
import { ShieldCheck, Clock, Shield, FileText, UploadCloud, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VerificationWidget() {
    const [simStep, setSimStep] = useState<number>(1); // 1 = Entry Form, 3 = Pending, 4 = Reviewing, 5 = Verified
    const [entityType, setEntityType] = useState<'individual' | 'company'>('individual');
    const [identityNumber, setIdentityNumber] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [fileFoto, setFileFoto] = useState(false);
    const [filePorto, setFilePorto] = useState(false);
    const [fileSertif, setFileSertif] = useState(false);

    const resetWidget = () => {
        setSimStep(1);
        setEntityType('individual');
        setIdentityNumber('');
        setCompanyName('');
        setFileFoto(false);
        setFilePorto(false);
        setFileSertif(false);
    };

    const handleSimSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSimStep(3);
    };

    return (
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] max-w-md mx-auto my-4 space-y-4 text-xs font-sans text-neutral-800 antialiased">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                <span className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">Interactive Simulation</span>
                <button 
                    onClick={resetWidget} 
                    className="p-1 hover:bg-neutral-150 rounded text-neutral-400 hover:text-neutral-700 transition-all flex items-center gap-1 text-[9px] font-black uppercase tracking-wider outline-none"
                    title="Reset Simulation"
                >
                    <RefreshCw size={10} /> Reset
                </button>
            </div>

            {simStep >= 3 && (
                <div className="relative overflow-hidden min-h-[70px] flex flex-col justify-center">
                    <AnimatePresence mode="wait">
                        {simStep === 3 && (
                            <motion.div 
                                key="pending"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="bg-neutral-950 border border-neutral-900 rounded-xl p-4 text-white space-y-1.5"
                            >
                                <div className="flex items-center gap-2 text-amber-400">
                                    <Clock size={16} className="animate-pulse" />
                                    <h4 className="text-[10px] font-black uppercase tracking-widest">Verification Pending</h4>
                                </div>
                                <p className="text-[10px] text-neutral-400 leading-relaxed font-semibold">
                                    Your uploaded credentials are currently in queue. Administrative manual audit takes about 24 hours.
                                </p>
                                <button 
                                    onClick={() => {
                                        setSimStep(4);
                                        setTimeout(() => setSimStep(5), 1800);
                                    }}
                                    className="w-full mt-2 py-1.5 bg-white hover:bg-neutral-100 text-neutral-950 rounded text-[9px] font-black transition-all uppercase tracking-wider border"
                                >
                                    Trigger Admin Review
                                </button>
                            </motion.div>
                        )}

                        {simStep === 4 && (
                            <motion.div 
                                key="reviewing"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="bg-neutral-950 border border-neutral-900 rounded-xl p-4 text-white space-y-1.5"
                            >
                                <div className="flex items-center gap-2 text-sky-400">
                                    <Clock size={16} className="animate-spin" />
                                    <h4 className="text-[10px] font-black uppercase tracking-widest">Admin Auditing Documents...</h4>
                                </div>
                                <p className="text-[10px] text-neutral-400 leading-relaxed font-semibold">
                                    System is auditing NPWP/SIUP tax lists and scanning portfolios for security check.
                                </p>
                            </motion.div>
                        )}

                        {simStep === 5 && (
                            <motion.div 
                                key="verified"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-neutral-950 border border-neutral-900 rounded-xl p-4 text-white space-y-1.5 relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-16 h-16 bg-neutral-800 blur-[20px] rounded-full translate-x-4 -translate-y-4" />
                                <div className="flex items-center gap-2 text-emerald-400">
                                    <ShieldCheck size={16} className="animate-pulse" />
                                    <h4 className="text-[10px] font-black uppercase tracking-widest">Officially Verified Account</h4>
                                </div>
                                <p className="text-[10px] text-neutral-350 leading-relaxed font-semibold">
                                    Credentials successfully authenticated! Bidding capabilities unlocked across the marketplace.
                                </p>
                                <button 
                                    onClick={resetWidget}
                                    className="w-full mt-2 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-[9px] font-black transition-all uppercase tracking-wider"
                                >
                                    Restart Simulation
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {simStep < 3 && (
                <form onSubmit={handleSimSubmit} className="space-y-4">
                    {/* Entity Type Selection */}
                    <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Entity Type</span>
                        <div className="grid grid-cols-2 bg-neutral-50 p-1 border border-neutral-100 rounded-xl gap-1">
                            <button
                                type="button"
                                onClick={() => setEntityType('individual')}
                                className={`py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all outline-none ${
                                    entityType === 'individual'
                                        ? 'bg-neutral-950 text-white shadow-sm'
                                        : 'text-neutral-500 hover:text-neutral-800'
                                }`}
                            >
                                Individual
                            </button>
                            <button
                                type="button"
                                onClick={() => setEntityType('company')}
                                className={`py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all outline-none ${
                                    entityType === 'company'
                                        ? 'bg-neutral-950 text-white shadow-sm'
                                        : 'text-neutral-500 hover:text-neutral-800'
                                }`}
                            >
                                Company
                            </button>
                        </div>
                    </div>

                    {/* Dynamic Fields */}
                    <div className="space-y-2 pt-2 border-t border-neutral-100">
                        {entityType === 'individual' ? (
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-neutral-400 uppercase">National ID (KTP)</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none text-[11px] font-semibold focus:bg-white focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 transition-all"
                                    placeholder="e.g. 3271021405900004"
                                    value={identityNumber}
                                    onChange={e => setIdentityNumber(e.target.value)}
                                />
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-neutral-400 uppercase">Registered Company Name</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg outline-none text-[11px] font-semibold focus:bg-white focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 transition-all"
                                    placeholder="e.g. PT. Konstruksi Ceria"
                                    value={companyName}
                                    onChange={e => setCompanyName(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Files Mock Upload */}
                    <div className="space-y-2 pt-2 border-t border-neutral-100">
                        <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400 block mb-1">Required Documents</span>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setFileFoto(!fileFoto)}
                                className={`p-2 rounded-lg border border-dashed transition-all flex flex-col items-center justify-center min-h-[55px] outline-none ${fileFoto ? 'bg-neutral-950 border-neutral-900 text-white shadow-sm' : 'bg-white border-neutral-200 text-neutral-400'}`}
                            >
                                <UploadCloud size={14} />
                                <span className="text-[8px] font-bold mt-1 tracking-tight truncate w-full text-center">
                                    {fileFoto ? 'logo.jpg ✓' : 'Profile Logo'}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFilePorto(!filePorto)}
                                className={`p-2 rounded-lg border border-dashed transition-all flex flex-col items-center justify-center min-h-[55px] outline-none ${filePorto ? 'bg-neutral-950 border-neutral-900 text-white shadow-sm' : 'bg-white border-neutral-200 text-neutral-400'}`}
                            >
                                <FileText size={14} />
                                <span className="text-[8px] font-bold mt-1 tracking-tight truncate w-full text-center">
                                    {filePorto ? 'npwp.pdf ✓' : (entityType === 'individual' ? 'KTP Scan' : 'NPWP Scan')}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFileSertif(!fileSertif)}
                                className={`p-2 rounded-lg border border-dashed transition-all flex flex-col items-center justify-center min-h-[55px] outline-none ${fileSertif ? 'bg-neutral-950 border-neutral-900 text-white shadow-sm' : 'bg-white border-neutral-200 text-neutral-400'}`}
                            >
                                <Shield size={14} />
                                <span className="text-[8px] font-bold mt-1 tracking-tight truncate w-full text-center">
                                    {fileSertif ? 'siup.pdf ✓' : (entityType === 'individual' ? 'License Cert' : 'SIUP/NIB')}
                                </span>
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={(!identityNumber && !companyName) || !fileFoto || !filePorto || !fileSertif}
                        className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-40 outline-none"
                    >
                        Save & Request Verification
                    </button>
                </form>
            )}
        </div>
    );
}
