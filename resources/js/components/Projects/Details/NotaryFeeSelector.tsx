import React from 'react';
import { DollarSign, Check } from 'lucide-react';

interface Service {
    title: string;
    price: number;
    description?: string;
}

interface Props {
    rateHarga?: string | number;
    services?: Service[];
    isConsultationChecked: boolean;
    setIsConsultationChecked: (v: boolean) => void;
    selectedServices: Service[];
    setSelectedServices: (v: Service[]) => void;
}

export const NotaryFeeSelector: React.FC<Props> = ({
    rateHarga,
    services = [],
    isConsultationChecked,
    setIsConsultationChecked,
    selectedServices,
    setSelectedServices,
}) => {
    const formatCurrency = (val: number) => {
        return val.toLocaleString('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0,
        });
    };

    const handleServiceToggle = (svc: Service) => {
        const exists = selectedServices.some(s => s.title === svc.title);
        if (exists) {
            setSelectedServices(selectedServices.filter(s => s.title !== svc.title));
        } else {
            setSelectedServices([...selectedServices, svc]);
        }
    };

    const consultationFee = isConsultationChecked ? Number(rateHarga || 0) : 0;
    const servicesTotal = selectedServices.reduce((sum, s) => sum + Number(s.price || 0), 0);
    const totalFee = consultationFee + servicesTotal;

    return (
        <div className="bg-zinc-50 rounded-[2rem] p-6 border border-zinc-150 space-y-4">
            <div>
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-1.5">
                    <DollarSign size={14} className="text-emerald-500" />
                    Legal Fee Structure
                </h4>
                <p className="text-[10px] text-zinc-400 font-medium">Select your consultation fee and/or services to build the total bid fee.</p>
            </div>

            {/* Checkable List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Consultation Fee Item */}
                {rateHarga && (
                    <label className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        isConsultationChecked 
                            ? 'bg-emerald-50/50 border-emerald-500 text-emerald-900' 
                            : 'bg-white border-zinc-100 hover:border-zinc-200 text-zinc-600'
                    }`}>
                        <div className="flex items-center gap-2.5">
                            <input 
                                type="checkbox"
                                checked={isConsultationChecked}
                                onChange={(e) => setIsConsultationChecked(e.target.checked)}
                                className="hidden"
                            />
                            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                                isConsultationChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-300 bg-white'
                            }`}>
                                {isConsultationChecked && <Check size={10} strokeWidth={3} />}
                            </div>
                            <span className="text-xs font-bold">Consultation Fee</span>
                        </div>
                        <span className="text-xs font-black">{formatCurrency(Number(rateHarga))}</span>
                    </label>
                )}

                {/* Services Items */}
                {services.map((svc, idx) => {
                    const isChecked = selectedServices.some(s => s.title === svc.title);
                    return (
                        <label key={idx} className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                            isChecked 
                                ? 'bg-slate-50/50 border-slate-500 text-slate-900' 
                                : 'bg-white border-zinc-100 hover:border-zinc-200 text-zinc-600'
                        }`}>
                            <div className="flex items-center gap-2.5">
                                <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleServiceToggle(svc)}
                                    className="hidden"
                                />
                                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                                    isChecked ? 'bg-slate-500 border-slate-500 text-white' : 'border-zinc-300 bg-white'
                                }`}>
                                    {isChecked && <Check size={10} strokeWidth={3} />}
                                </div>
                                <span className="text-xs font-bold truncate max-w-[140px]" title={svc.title}>{svc.title}</span>
                            </div>
                            <span className="text-xs font-black">{formatCurrency(svc.price)}</span>
                        </label>
                    );
                })}
            </div>

            {/* Total Display */}
            <div className="flex items-center justify-between pt-4 border-t border-zinc-200/60">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Bid Amount</span>
                <span className="text-base font-black text-slate-900">
                    {formatCurrency(totalFee)}
                </span>
            </div>
        </div>
    );
};
