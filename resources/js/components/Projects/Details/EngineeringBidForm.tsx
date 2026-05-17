import React from 'react';
import { Shield, Zap, Clock, Info } from 'lucide-react';

interface EngineeringBidFormProps {
    type: 'structural' | 'mep';
    formData: any;
    setFormData: (data: any) => void;
}

export const EngineeringBidForm: React.FC<EngineeringBidFormProps> = ({ type, formData, setFormData }) => {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Professional License Number (SIKA/PE)</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Shield size={16} className="text-gray-300" />
                        </div>
                        <input 
                            type="text"
                            required
                            value={formData.license_number || ''}
                            onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                            placeholder="e.g. 1.23.4567.89"
                            className="w-full pl-11 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-[1.25rem] text-sm font-bold focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all outline-none"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Years of Technical Experience</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Clock size={16} className="text-gray-300" />
                        </div>
                        <input 
                            type="number"
                            required
                            value={formData.experience_years || ''}
                            onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })}
                            placeholder="e.g. 10"
                            className="w-full pl-11 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-[1.25rem] text-sm font-bold focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all outline-none"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-2xl -mr-16 -mt-16" />
                <div className="relative z-10 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                        {type === 'structural' ? <Shield size={20} className="text-red-400" /> : <Zap size={20} className="text-yellow-400" />}
                    </div>
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white/50">{type.toUpperCase()} Specific Scope Notes</h4>
                            <p className="text-[13px] font-bold text-white mt-1">Provide any specific technical assumptions or requirements for this project.</p>
                        </div>
                        <textarea 
                            value={formData.technical_notes || ''}
                            onChange={(e) => setFormData({ ...formData, technical_notes: e.target.value })}
                            placeholder={type === 'structural' ? "e.g. Assumption of soil type based on local geological data..." : "e.g. Preliminary electrical load estimate based on building volume..."}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm font-medium text-white placeholder:text-white/20 focus:bg-white/10 focus:border-white/30 transition-all outline-none min-h-[120px]"
                        />
                    </div>
                </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                <Info size={16} className="text-blue-500 mt-0.5" />
                <p className="text-[11px] text-blue-700 font-bold leading-relaxed">
                    By submitting this bid, you certify that all technical calculations will comply with SNI (Standar Nasional Indonesia) and local building regulations.
                </p>
            </div>
        </div>
    );
};
