import React, { useState } from 'react';
import { ShieldCheck, Clock, Shield, AlertCircle, FileText, UploadCloud, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VerificationWidget() {
    const [simStep, setSimStep] = useState<number>(1); // 1 = Unverified, 2 = Ready to Submit, 3 = Pending Review, 4 = Admin Reviewing, 5 = Verified
    const [photoUploaded, setPhotoUploaded] = useState(false);
    const [portoUploaded, setPortoUploaded] = useState(false);
    const [certUploaded, setCertUploaded] = useState(false);

    const resetWidget = () => {
        setSimStep(1);
        setPhotoUploaded(false);
        setPortoUploaded(false);
        setCertUploaded(false);
    };

    const handleUploadAll = () => {
        setPhotoUploaded(true);
        setPortoUploaded(true);
        setCertUploaded(true);
        setSimStep(2);
    };

    const handleSingleUpload = (type: 'foto' | 'porto' | 'cert') => {
        if (type === 'foto') setPhotoUploaded(true);
        if (type === 'porto') setPortoUploaded(true);
        if (type === 'cert') setCertUploaded(true);

        // If all are about to be uploaded
        const nextPhoto = type === 'foto' ? true : photoUploaded;
        const nextPorto = type === 'porto' ? true : portoUploaded;
        const nextCert = type === 'cert' ? true : certUploaded;

        if (nextPhoto && nextPorto && nextCert) {
            setSimStep(2);
        }
    };

    return (
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm max-w-md mx-auto my-4 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
                <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Simulator Tab</span>
                <button 
                    onClick={resetWidget} 
                    className="p-1 hover:bg-neutral-100 rounded-lg text-neutral-400 hover:text-neutral-700 transition-all flex items-center gap-1 text-[9px] font-black uppercase tracking-wider"
                    title="Reset Simulation"
                >
                    <RefreshCw size={10} className="animate-spin-slow" /> Reset
                </button>
            </div>

            {/* Simulating the Status Badge */}
            <div className="relative overflow-hidden min-h-[90px] flex flex-col justify-center">
                <AnimatePresence mode="wait">
                    {simStep <= 2 && (
                        <motion.div 
                            key="unverified"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 rounded-2xl p-4 text-white space-y-2"
                        >
                            <div className="flex items-center gap-2 text-neutral-400">
                                <Shield size={16} />
                                <h4 className="text-[10px] font-black uppercase tracking-widest">Verification Required</h4>
                            </div>
                            <p className="text-[10px] text-neutral-400 leading-relaxed font-semibold">
                                Please upload valid documents (Headshot, Portfolio, and Certificates) to request account verification.
                            </p>
                        </motion.div>
                    )}

                    {simStep === 3 && (
                        <motion.div 
                            key="pending"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-gradient-to-br from-amber-950/70 to-zinc-900 border border-amber-500/20 rounded-2xl p-4 text-white space-y-2"
                        >
                            <div className="flex items-center gap-2 text-amber-400">
                                <Clock size={16} className="animate-pulse" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest">Verification Pending</h4>
                            </div>
                            <p className="text-[10px] text-zinc-300 leading-relaxed font-semibold">
                                Your uploaded documents are currently in review. Admins will verify your qualifications shortly.
                            </p>
                        </motion.div>
                    )}

                    {simStep === 4 && (
                        <motion.div 
                            key="reviewing"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-gradient-to-br from-sky-950/80 to-zinc-900 border border-sky-500/20 rounded-2xl p-4 text-white space-y-2"
                        >
                            <div className="flex items-center gap-2 text-sky-400">
                                <Clock size={16} className="animate-spin" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest">Admin Reviewing...</h4>
                            </div>
                            <p className="text-[10px] text-zinc-300 leading-relaxed font-semibold">
                                Admin is inspecting your PDF certificates and portfolio sheets in the backend.
                            </p>
                        </motion.div>
                    )}

                    {simStep === 5 && (
                        <motion.div 
                            key="verified"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-gradient-to-br from-emerald-950 to-zinc-900 border border-emerald-500/20 rounded-2xl p-4 text-white space-y-2 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 blur-[20px] rounded-full translate-x-4 -translate-y-4" />
                            <div className="flex items-center gap-2 text-emerald-400">
                                <ShieldCheck size={16} className="animate-pulse" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest">Officially Verified</h4>
                            </div>
                            <p className="text-[10px] text-zinc-300 leading-relaxed font-semibold">
                                Credentials successfully authenticated! You have unlocked proposal submission and project bidding.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Simulating File Upload Controls */}
            {simStep <= 2 && (
                <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                    <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400 block mb-1">Verify Documents (Tap to upload)</span>
                    <div className="grid grid-cols-3 gap-2">
                        {/* Profile Photo Mock upload */}
                        <button 
                            type="button"
                            onClick={() => handleSingleUpload('foto')}
                            className={`p-3 rounded-lg border border-dashed transition-all flex flex-col items-center justify-center min-h-[70px] ${photoUploaded ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-white border-neutral-200 hover:border-neutral-400 text-neutral-500'}`}
                        >
                            <UploadCloud size={16} />
                            <span className="text-[8px] font-bold mt-1 text-center truncate w-full">
                                {photoUploaded ? 'photo.jpg' : 'Avatar'}
                            </span>
                        </button>

                        {/* Portfolio PDF Mock upload */}
                        <button 
                            type="button"
                            onClick={() => handleSingleUpload('porto')}
                            className={`p-3 rounded-lg border border-dashed transition-all flex flex-col items-center justify-center min-h-[70px] ${portoUploaded ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-white border-neutral-200 hover:border-neutral-400 text-neutral-500'}`}
                        >
                            <FileText size={16} />
                            <span className="text-[8px] font-bold mt-1 text-center truncate w-full">
                                {portoUploaded ? 'portfolio.pdf' : 'Portfolio'}
                            </span>
                        </button>

                        {/* Certificate Mock upload */}
                        <button 
                            type="button"
                            onClick={() => handleSingleUpload('cert')}
                            className={`p-3 rounded-lg border border-dashed transition-all flex flex-col items-center justify-center min-h-[70px] ${certUploaded ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-white border-neutral-200 hover:border-neutral-400 text-neutral-500'}`}
                        >
                            <Shield size={16} />
                            <span className="text-[8px] font-bold mt-1 text-center truncate w-full">
                                {certUploaded ? 'license.pdf' : 'Certificate'}
                            </span>
                        </button>
                    </div>

                    {simStep === 1 && (
                        <button 
                            type="button"
                            onClick={handleUploadAll}
                            className="w-full text-center py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-[10px] font-extrabold transition-all"
                        >
                            Simulate Auto-Upload All
                        </button>
                    )}
                </div>
            )}

            {/* Simulating submitting and admin approvals */}
            <div className="pt-2">
                {simStep === 2 && (
                    <motion.button 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => setSimStep(3)}
                        className="w-full py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-1.5"
                    >
                        Submit Profile for Verification
                        <ArrowRight size={14} />
                    </motion.button>
                )}

                {simStep === 3 && (
                    <div className="space-y-2">
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-center text-amber-700 text-[10px] font-bold">
                            Submission successfully saved! Backend status is set to Pending.
                        </div>
                        <button 
                            onClick={() => {
                                setSimStep(4);
                                setTimeout(() => setSimStep(5), 2000);
                            }}
                            className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl transition-all"
                        >
                            Trigger Admin Audit Review
                        </button>
                    </div>
                )}

                {simStep === 4 && (
                    <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl text-center text-sky-700 text-[10px] font-bold flex items-center justify-center gap-2">
                        <Clock size={12} className="animate-spin" />
                        Verifying certificates (NPWP / SIUP)... Please wait.
                    </div>
                )}

                {simStep === 5 && (
                    <div className="space-y-3">
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center text-emerald-700 text-[10px] font-bold flex items-center justify-center gap-1.5">
                            <CheckCircle2 size={12} />
                            Congratulations! Your account is officially verified!
                        </div>
                        <button 
                            onClick={resetWidget}
                            className="w-full py-2 bg-neutral-950 hover:bg-black text-white text-xs font-bold rounded-xl transition-all"
                        >
                            Reset Flow Simulation
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
