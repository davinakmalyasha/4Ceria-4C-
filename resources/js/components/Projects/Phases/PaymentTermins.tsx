import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Wallet, Calendar, X, Save, Info, CheckCircle, Lock, Clock, Send, CreditCard, ChevronDown } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { DEFAULT_TERMIN_TEMPLATE } from '../../../constants/ContractorStandardPresets';

interface PaymentTerminsProps {
    project: any;
    isContractor: boolean;
}

interface Termin {
    id: number;
    label: string;
    percentage: number;
    amount: number;
    trigger_description: string | null;
    status: 'locked' | 'pending' | 'invoice_sent' | 'paid';
    milestone_id: number | null;
    paid_at: string | null;
    notes: string | null;
    milestone?: any;
}

export default function PaymentTermins({ project, isContractor }: PaymentTerminsProps) {
    const [termins, setTermins] = useState<Termin[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const { showToast } = useToast();

    // Form State
    const [label, setLabel] = useState('');
    const [percentage, setPercentage] = useState(0);
    const [trigger, setTrigger] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchTermins = async () => {
        try {
            const res = await axios.get(`/api/projects/${project.id}/payment-termins`);
            setTermins(res.data.data);
        } catch (error) {
            console.error('Failed to fetch termins', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchTermins(); }, [project.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const totalContract = project.hired_contract_price || 0;
        const calculatedAmount = Math.round((percentage / 100) * totalContract);

        try {
            await axios.post(`/api/projects/${project.id}/payment-termins`, {
                label,
                percentage,
                amount: calculatedAmount,
                trigger_description: trigger,
                notes,
                status: 'locked'
            });
            showToast('Payment termin added!', 'success');
            setShowForm(false);
            setLabel('');
            setPercentage(0);
            setTrigger('');
            setNotes('');
            fetchTermins();
        } catch (error) {
            showToast('Failed to add termin.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateStatus = async (id: number, newStatus: string) => {
        try {
            await axios.put(`/api/projects/${project.id}/payment-termins/${id}`, { status: newStatus });
            showToast(`Status updated to ${newStatus.replace('_', ' ')}`, 'success');
            fetchTermins();
        } catch (error) {
            showToast('Failed to update status.', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Delete this payment termin?')) return;
        try {
            await axios.delete(`/api/projects/${project.id}/payment-termins/${id}`);
            showToast('Termin deleted.', 'success');
            fetchTermins();
        } catch (error) {
            showToast('Failed to delete termin.', 'error');
        }
    };

    const applyTemplate = () => {
        if (termins.length > 0 && !window.confirm('This will append the standard template to your existing termins. Proceed?')) return;
        
        const totalContract = project.hired_contract_price || 0;
        
        const promises = DEFAULT_TERMIN_TEMPLATE.map(t => {
            return axios.post(`/api/projects/${project.id}/payment-termins`, {
                label: t.label,
                percentage: t.percentage,
                amount: Math.round((t.percentage / 100) * totalContract),
                trigger_description: t.trigger,
                status: 'locked'
            });
        });

        Promise.all(promises)
            .then(() => {
                showToast('Standard template applied!', 'success');
                fetchTermins();
            })
            .catch(() => showToast('Failed to apply template.', 'error'));
    };

    const getStatusStyles = (status: string) => {
        switch(status) {
            case 'paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'invoice_sent': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
            default: return 'bg-slate-100 text-slate-500 border-slate-200';
        }
    };

    if (loading) return <div className="py-20 text-center text-slate-400 text-[10px] font-black uppercase tracking-widest">Loading Payment System...</div>;

    const totalPercentage = termins.reduce((acc, t) => acc + Number(t.percentage), 0);
    const totalAmount = termins.reduce((acc, t) => acc + Number(t.amount), 0);

    return (
        <div className="space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <Wallet size={18} /> Payment Termins
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Scheduled billing & staging payments</p>
                </div>
                <div className="flex items-center gap-3">
                    {isContractor && (
                        <>
                            <button 
                                onClick={applyTemplate}
                                className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-200"
                            >
                                Use Template
                            </button>
                            <button 
                                onClick={() => setShowForm(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
                            >
                                <Plus size={16} /> Add Termin
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Contract Summary Card */}
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />
                <div className="relative flex flex-col md:flex-row justify-between items-end md:items-center gap-6">
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Hired Contract Price</p>
                        <h2 className="text-4xl font-black tracking-tight">Rp {Number(project.hired_contract_price || 0).toLocaleString('id-ID')}</h2>
                    </div>
                    <div className="flex gap-8 text-right">
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Scheduled</p>
                            <p className="text-xl font-black">{totalPercentage}% <span className="text-[10px] opacity-40 ml-1">/ 100%</span></p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Total Value</p>
                            <p className="text-xl font-black text-emerald-400">Rp {totalAmount.toLocaleString('id-ID')}</p>
                        </div>
                    </div>
                </div>
                
                {totalPercentage !== 100 && (
                    <div className="mt-6 flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                        <Info size={16} className="text-amber-500" />
                        <p className="text-[10px] font-black text-amber-200 uppercase tracking-widest">
                            Warning: Scheduled termins total reaches {totalPercentage}%. Suggested: 100%.
                        </p>
                    </div>
                )}
            </div>

            {showForm && (
                <div className="bg-white border-2 border-slate-900 rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative">
                    <div className="flex items-center justify-between mb-4">
                        <h5 className="text-slate-900 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2">
                            <CreditCard size={18} /> Define New Payment Termin
                        </h5>
                        <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-900"><X size={20} /></button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Termin Label</label>
                            <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. DP, Structure Completion..." className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black focus:border-slate-900 outline-none transition-all" required />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-[#f52d5f]">Percentage of Contract (%)</label>
                            <div className="relative">
                                <input type="number" value={percentage} onChange={e => setPercentage(Number(e.target.value))} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black focus:border-slate-900 outline-none transition-all" required min="1" max="100" />
                                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 font-black">%</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trigger Condition</label>
                        <input type="text" value={trigger} onChange={e => setTrigger(e.target.value)} placeholder="e.g. When foundation pouring is 100% complete..." className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium focus:border-slate-900 outline-none transition-all" />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Additional Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Attach specific terms or billing notes..." className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium h-24 focus:border-slate-900 outline-none transition-all resize-none" />
                    </div>

                    <button 
                        onClick={handleSubmit}
                        disabled={submitting} 
                        className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-[0.4em] flex items-center justify-center gap-2 hover:-translate-y-1 active:scale-95 transition-all shadow-xl disabled:opacity-50"
                    >
                        {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={18} /> Save Payment Termin</>}
                    </button>
                </div>
            )}

            <div className="space-y-4">
                {termins.length === 0 ? (
                    <div className="py-20 text-center bg-slate-50 border-2 border-dashed border-slate-100 rounded-[3rem]">
                        <Clock className="mx-auto text-slate-200 mb-4" size={48} />
                        <p className="text-sm font-black text-slate-300 uppercase tracking-[0.2em]">No payment termins defined</p>
                    </div>
                ) : (
                    termins.map((termin, idx) => (
                        <div key={termin.id} className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                            <div className={`absolute top-0 left-0 bottom-0 w-2 ${
                                termin.status === 'paid' ? 'bg-emerald-500' : 
                                termin.status === 'invoice_sent' ? 'bg-blue-500' : 
                                termin.status === 'pending' ? 'bg-amber-500' : 'bg-slate-200'
                            }`} />
                            
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-4 flex-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white text-[10px] font-black">
                                            {String(idx + 1).padStart(2, '0')}
                                        </div>
                                        <div>
                                            <h6 className="text-base font-black text-slate-900">{termin.label}</h6>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{termin.percentage}% of total contract price</p>
                                        </div>
                                    </div>

                                    {termin.trigger_description && (
                                        <div className="flex items-start gap-2 max-w-md">
                                            <Info size={14} className="text-slate-300 mt-0.5 shrink-0" />
                                            <p className="text-xs text-slate-500 font-medium leading-relaxed italic">Trigger: {termin.trigger_description}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="text-right space-y-4">
                                    <div>
                                        <p className="text-2xl font-black text-slate-900">Rp {Number(termin.amount).toLocaleString('id-ID')}</p>
                                        <div className={`inline-flex items-center gap-2 px-3 py-1 mt-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${getStatusStyles(termin.status)}`}>
                                            {termin.status === 'paid' && <CheckCircle size={10} />}
                                            {termin.status === 'locked' && <Lock size={10} />}
                                            {termin.status.replace('_', ' ')}
                                        </div>
                                    </div>

                                    {isContractor && (
                                        <div className="flex items-center justify-end gap-2">
                                            {termin.status === 'locked' && (
                                                <button onClick={() => handleUpdateStatus(termin.id, 'pending')} className="p-2 bg-slate-50 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-all" title="Mark as Pending"><Clock size={16} /></button>
                                            )}
                                            {termin.status === 'pending' && (
                                                <button onClick={() => handleUpdateStatus(termin.id, 'invoice_sent')} className="p-2 bg-slate-50 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all" title="Send Invoice (Docs Only)"><Send size={16} /></button>
                                            )}
                                            {termin.status === 'invoice_sent' && (
                                                <button onClick={() => handleUpdateStatus(termin.id, 'paid')} className="p-2 bg-slate-50 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all" title="Record Manual Payment"><CheckCircle size={16} /></button>
                                            )}
                                            <button onClick={() => handleDelete(termin.id)} className="p-2 bg-slate-50 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={16} /></button>
                                        </div>
                                    )}

                                    {!isContractor && termin.status === 'invoice_sent' && (
                                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest animate-pulse">Invoice Received. Processing Offline.</p>
                                    )}
                                </div>
                            </div>

                            {termin.notes && (
                                <div className="mt-6 pt-6 border-t border-slate-50">
                                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Billing Notes</p>
                                    <p className="text-xs text-slate-500 italic">{termin.notes}</p>
                                </div>
                            )}

                            {termin.paid_at && (
                                <div className="mt-4 flex items-center gap-2 text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                                    <CheckCircle size={12} /> Confirmed Paid on {new Date(termin.paid_at).toLocaleDateString()}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
            
            <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-start gap-4">
                <Info size={20} className="text-slate-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informational Layer Only</p>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                        Currently, this system acts as a progress documentation for payments. 4C리아 does not yet process actual financial transactions. 
                        Please ensure all payments are handled via Bank Transfer according to the agreed terms, and the Contractor updates the status manually here for record-keeping.
                    </p>
                </div>
            </div>
        </div>
    );
}
