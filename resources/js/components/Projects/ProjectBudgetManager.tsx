import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Wallet, TrendingDown, TrendingUp, Plus, Minus, 
    CheckCircle, Clock, ShieldAlert, Zap, AlertTriangle, Scale, Target, Banknote,
    Edit3, Trash2, Save, X
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface ProjectBudgetManagerProps {
    project: any;
    user: any;
}

export default function ProjectBudgetManager({ project, user }: ProjectBudgetManagerProps) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [sandboxTitle, setSandboxTitle] = useState('');
    const [sandboxAmount, setSandboxAmount] = useState('');
    const [isAdjusting, setIsAdjusting] = useState(false);
    const [adjustType, setAdjustType] = useState<'deposit' | 'adjustment_down'>('deposit');
    const [adjustAmount, setAdjustAmount] = useState('');
    const [adjustTitle, setAdjustTitle] = useState('');
    
    // Editing Sandbox State
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editAmount, setEditAmount] = useState('');

    const fetchDashboard = async () => {
        try {
            const res = await axios.get(`/projects/${project.id}/budget`);
            console.log('Budget Dashboard Data:', res.data);
            setDashboardData(res.data);
        } catch (error: any) {
            console.error('Budget Dashboard Fetch Error:', error.response?.data || error.message);
            showToast('Failed to load budget dashboard', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboard();
    }, [project.id]);

    const handleSandboxAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`/projects/${project.id}/budget/sandbox`, {
                title: sandboxTitle,
                estimated_amount: parseFloat(sandboxAmount)
            });
            setSandboxTitle('');
            setSandboxAmount('');
            showToast('Sandbox cost added', 'success');
            fetchDashboard();
        } catch (err) {
            showToast('Failed to add sandbox item', 'error');
        }
    };

    const toggleSandbox = async (id: number) => {
        try {
            await axios.put(`/projects/${project.id}/budget/sandbox/${id}`);
            fetchDashboard();
        } catch (err) {
            showToast('Failed to toggle simulation', 'error');
        }
    };

    const handleUpdateSandbox = async (id: number) => {
        try {
            await axios.put(`/projects/${project.id}/budget/sandbox/${id}/update`, {
                title: editTitle,
                estimated_amount: parseFloat(editAmount)
            });
            setEditingId(null);
            showToast('Simulation updated', 'success');
            fetchDashboard();
        } catch (err) {
            showToast('Failed to update simulation', 'error');
        }
    };

    const handleDeleteSandbox = async (id: number) => {
        if (!confirm('Permanently delete this hypothetical expense?')) return;
        try {
            await axios.delete(`/projects/${project.id}/budget/sandbox/${id}`);
            showToast('Simulation deleted', 'info');
            fetchDashboard();
        } catch (err) {
            showToast('Failed to delete simulation', 'error');
        }
    };

    const handleAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`/projects/${project.id}/budget/transactions`, {
                transaction_type: adjustType,
                amount: parseFloat(adjustAmount),
                title: adjustTitle
            });
            setIsAdjusting(false);
            setAdjustAmount('');
            setAdjustTitle('');
            showToast('Budget adjusted successfully!', 'success');
            fetchDashboard();
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Adjustment failed';
            console.error('Adjustment Error details:', err.response?.data);
            showToast(msg, 'error');
        }
    };

    const markPaid = async (type: string, id: number) => {
        if (!window.confirm('Mark this item as paid? This officially deducts money from your budget.')) return;
        try {
            await axios.post(`/projects/${project.id}/budget/mark-paid`, { type, id });
            showToast('Payment confirmed and deducted!', 'success');
            fetchDashboard();
        } catch (err) {
            showToast('Failed to process payment', 'error');
        }
    };

    if (loading || !dashboardData) {
        return <div className="py-20 text-center text-slate-400 font-bold animate-pulse">Loading Financial Engine...</div>;
    }

    // ─── Mathematical Engine ───
    const initialBudget = Number(dashboardData.project_budget || project.budget || 0);
    
    const transactions = dashboardData.transactions || [];
    const deposits = transactions.filter((t: any) => t.transaction_type === 'deposit').reduce((a: number, b: any) => a + Number(b.amount || 0), 0);
    const manualReductions = transactions.filter((t: any) => t.transaction_type === 'adjustment_down').reduce((a: number, b: any) => a + Number(b.amount || 0), 0);
    const realPayments = transactions.filter((t: any) => t.transaction_type === 'payment').reduce((a: number, b: any) => a + Number(b.amount || 0), 0);
    
    // Core Actual Math
    const actualAvailablePool = initialBudget + deposits - manualReductions;
    const actualRemaining = actualAvailablePool - realPayments;
    
    // Sandbox / Simulation Math
    const sandboxItems = dashboardData.sandbox_items || [];
    const activeSandboxCosts = sandboxItems.filter((item: any) => item.is_active).reduce((a: number, b: any) => a + Number(b.estimated_amount || 0), 0);
    const simulatedRemaining = actualRemaining - activeSandboxCosts;

    // Derived Visual Indicators
    const spentPercentage = actualAvailablePool > 0 ? (realPayments / actualAvailablePool) * 100 : 0;
    const simulatedPercentage = actualAvailablePool > 0 ? ((realPayments + activeSandboxCosts) / actualAvailablePool) * 100 : 0;

    return (
        <div className="space-y-8 animate-fade-in">
            {/* VAULT: MASTER BUDGET OVERVIEW */}
            <div className="bg-slate-900 rounded-[3rem] p-8 md:p-12 relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3" />
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8">
                    
                    {/* Main Counter */}
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700/50 rounded-xl mb-4">
                            <Wallet size={16} className="text-emerald-400" />
                            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Master Budget Vault</span>
                        </div>
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Initial Proposed Budget: <span className="text-slate-300">Rp {initialBudget.toLocaleString('id-ID')}</span></h2>
                        <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter">
                            <span className="text-2xl text-slate-500 mr-2 relative -top-4">Rp</span>
                            {actualRemaining.toLocaleString('id-ID')}
                        </h1>
                        <p className="text-xs font-bold text-emerald-400 flex items-center gap-2 mt-4">
                            <Scale size={14} /> Available Funds After All Actual Payments
                        </p>
                    </div>

                    {/* Simulation & Actions */}
                    <div className="flex flex-col gap-4 w-full md:w-auto">
                        <div className={`p-6 rounded-3xl border-2 ${simulatedRemaining < 0 ? 'bg-red-500/10 border-red-500/30 text-red-100' : 'bg-slate-800/80 border-slate-700/50 text-white'} backdrop-blur-xl transition-all`}>
                            <p className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">Simulated Safe Balance</p>
                            <h3 className="text-3xl font-black">
                                Rp {simulatedRemaining.toLocaleString('id-ID')}
                            </h3>
                            {simulatedRemaining < 0 && (
                                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mt-2 flex items-center gap-1">
                                    <AlertTriangle size={12} /> Deficit Warning. Sandbox costs exceed budget.
                                </p>
                            )}
                        </div>

                        {user.id === project.user_id && (
                            <div className="flex gap-2">
                                <button onClick={() => { setIsAdjusting(true); setAdjustType('deposit'); }} className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                                    <TrendingUp size={16} /> Add Funds
                                </button>
                                <button onClick={() => { setIsAdjusting(true); setAdjustType('adjustment_down'); }} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700 hover:border-slate-600 flex items-center justify-center gap-2">
                                    <TrendingDown size={16} /> Limit
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Live Progress Bar */}
                <div className="mt-12 space-y-3 relative z-10">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-white">Fund Utilization</span>
                        <span className="text-slate-400">Total Pool: Rp {actualAvailablePool.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="h-4 bg-slate-800 rounded-full overflow-hidden flex relative">
                        {/* The Actual Spent Bar */}
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(spentPercentage, 100)}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full relative z-20"
                        />
                        {/* The Simulated (Sandbox) Bar */}
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(simulatedPercentage, 100)}%` }}
                            transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                            className="absolute top-0 left-0 h-full bg-amber-500/40 rounded-full z-10 border-r-2 border-amber-400"
                        />
                    </div>
                </div>
            </div>

            {/* FUND ADJUSTMENT MODAL */}
            {isAdjusting && (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-[2rem] shadow-sm">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                        {adjustType === 'deposit' ? <TrendingUp size={18} className="text-emerald-500"/> : <TrendingDown size={18} className="text-red-500"/>} 
                        {adjustType === 'deposit' ? 'Inject Capital' : 'Withdraw / Limit Funds'}
                    </h4>
                    <form onSubmit={handleAdjustment} className="flex flex-col md:flex-row gap-4">
                        <input type="text" placeholder="Reason (e.g. Bank Loan Approved)" value={adjustTitle} onChange={e => setAdjustTitle(e.target.value)} required className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:border-slate-900 outline-none" />
                        <div className="relative flex-1">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rp</span>
                            <input type="number" placeholder="Amount" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} required min="1" className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:border-slate-900 outline-none" />
                        </div>
                        <button type="submit" className="px-8 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all">Record</button>
                        <button type="button" onClick={() => setIsAdjusting(false)} className="px-8 py-3 bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-300 transition-all">Cancel</button>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* LEFT COL: PROFESSIONAL LEDGER */}
                <div className="space-y-6">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Banknote size={20} className="text-emerald-500" /> Pending Obligations & Ledgers
                    </h3>
                    
                    {/* Render Base Bids */}
                    {['arsitek', 'kontraktor', 'notaris', 'interior'].map((type) => {
                        const bid = dashboardData.accepted_bids?.[type];
                        if (!bid || type === 'kontraktor') return null; // Contractor uses Termins
                        return (
                            <div key={`${type}-${bid.id}`} className={`p-6 border-l-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${bid.payment_status === 'paid' ? 'bg-slate-50 border-emerald-500' : 'bg-white border-amber-400 shadow-sm'}`}>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{type} Base Fee</p>
                                    <h4 className="text-base font-black text-slate-900">{bid[type]?.user?.name || (type.charAt(0).toUpperCase() + type.slice(1))}</h4>
                                    <p className="text-lg font-black text-slate-700 mt-1">Rp {Number(bid.price || 0).toLocaleString('id-ID')}</p>
                                </div>
                                {bid.payment_status === 'paid' ? (
                                    <span className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                        <CheckCircle size={14}/> Paid on {new Date(bid.paid_at).toLocaleDateString()}
                                    </span>
                                ) : (
                                    <button onClick={() => markPaid(`bid_${type}`, bid.id)} className="px-5 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-md">
                                        I've Paid Offline
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {/* Render Contractor Termins */}
                    {dashboardData.payment_termins && dashboardData.payment_termins.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Construction Invoices (Termins)</h4>
                            <div className="space-y-3">
                                {dashboardData.payment_termins.map((termin: any) => (
                                    <div key={`termin-${termin.id}`} className={`p-5 rounded-2xl flex items-center justify-between transition-all ${termin.status === 'paid' ? 'bg-slate-50 opacity-70' : 'bg-white shadow-sm border border-slate-100'}`}>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{termin.percentage}% Termin</p>
                                            <h5 className="font-bold text-slate-900 text-sm">{termin.label}</h5>
                                            <p className="text-slate-700 font-black mt-1">Rp {Number(termin.amount || 0).toLocaleString('id-ID')}</p>
                                        </div>
                                        {termin.status === 'paid' ? (
                                            <CheckCircle size={18} className="text-emerald-500" />
                                        ) : (
                                            <button onClick={() => markPaid('termin', termin.id)} className="px-4 py-2 bg-slate-100 hover:bg-emerald-500 hover:text-white text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                                                Confirm Paid
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Render Addendums */}
                    {dashboardData.addendums && dashboardData.addendums.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Approved Add-ons / Hidden Fees</h4>
                            <div className="space-y-3">
                                {(dashboardData.addendums || []).filter((a:any) => a.status !== 'rejected' && a.status !== 'pending_approval').map((addendum: any) => (
                                    <div key={`addendum-${addendum.id}`} className={`p-5 rounded-2xl flex items-center justify-between border-l-4 ${addendum.status === 'paid' ? 'bg-slate-50 border-emerald-500 opacity-70' : 'bg-white shadow-sm border-blue-500'}`}>
                                        <div>
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[8px] font-black uppercase tracking-widest mb-1 inline-block">{addendum.role_type}</span>
                                            <h5 className="font-bold text-slate-900 text-sm">{addendum.title}</h5>
                                            <p className="text-slate-700 font-black mt-1">Rp {Number(addendum.amount || 0).toLocaleString('id-ID')}</p>
                                        </div>
                                        {addendum.status === 'paid' ? (
                                            <CheckCircle size={18} className="text-emerald-500" />
                                        ) : (
                                            <button onClick={() => markPaid('addendum', addendum.id)} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md">
                                                Confirm Paid
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {dashboardData.addendums && (dashboardData.addendums || []).filter((a:any) => a.status === 'pending_approval').length > 0 && (
                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl">
                            <h4 className="text-xs font-black text-amber-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Zap size={14} className="text-amber-500"/> Action Required: New Extra Costs Submitted
                            </h4>
                            {(dashboardData.addendums || []).filter((a:any) => a.status === 'pending_approval').map((addendum: any) => (
                                <div key={addendum.id} className="mt-3 bg-white p-4 rounded-xl border border-amber-100">
                                    <p className="text-[10px] uppercase font-black tracking-widest text-amber-500">{addendum.role_type} Request</p>
                                    <h5 className="font-bold mt-1 text-slate-900">{addendum.title}</h5>
                                    <p className="text-sm font-medium text-slate-500">{addendum.description}</p>
                                    <div className="flex justify-between items-center mt-4">
                                        <p className="font-black text-amber-600">Rp {Number(addendum.amount).toLocaleString('id-ID')}</p>
                                        <div className="flex gap-2">
                                            <button onClick={async () => {
                                                await axios.put(`/projects/${project.id}/budget/addendums/${addendum.id}`, { status: 'rejected' });
                                                fetchDashboard();
                                            }} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-[10px] font-black uppercase transition-all">Reject</button>
                                            <button onClick={async () => {
                                                await axios.put(`/projects/${project.id}/budget/addendums/${addendum.id}`, { status: 'approved_unpaid' });
                                                showToast('Addendum Approved! It is now in your ledger.', 'success');
                                                fetchDashboard();
                                            }} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase shadow-sm transition-all">Approve Cost</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* RIGHT COL: SANDBOX & SIMULATION */}
                <div className="space-y-6">
                    <div className="p-8 bg-amber-50/50 border border-amber-100 rounded-[2.5rem]">
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-2">
                            <Target size={20} className="text-amber-500" /> Sandbox Simulator
                        </h3>
                        <p className="text-xs font-medium text-slate-500 mb-6 w-5/6 leading-relaxed">
                            Input hypothetical expenses here to see how they impact your "Simulated Safe Balance" without affecting your real budget. Test costs before you commit!
                        </p>
                        
                        <form onSubmit={handleSandboxAdd} className="flex gap-2 mb-6">
                            <input type="text" placeholder="e.g. Luxury Kitchen Set" value={sandboxTitle} onChange={e => setSandboxTitle(e.target.value)} required className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:border-amber-400 outline-none" />
                            <input type="number" placeholder="Estimated Cost" value={sandboxAmount} onChange={e => setSandboxAmount(e.target.value)} required min="1" className="w-1/3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:border-amber-400 outline-none" />
                            <button type="submit" className="px-4 py-3 bg-amber-400 text-amber-950 rounded-xl hover:bg-amber-500 transition-all"><Plus size={18} /></button>
                        </form>

                        {/* MATH BREAKDOWN: Current - Hypothetical = Safe */}
                        <div className="mb-8 p-6 bg-amber-100/50 border border-amber-200/50 rounded-3xl space-y-3">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <span>Real Available Funds</span>
                                <span className="text-slate-700">Rp {actualRemaining.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-amber-600">
                                <span className="flex items-center gap-1"><Minus size={10}/> Simulated Active Costs</span>
                                <span>Rp {activeSandboxCosts.toLocaleString('id-ID')}</span>
                            </div>
                            <div className={`mt-2 p-4 rounded-2xl flex justify-between items-center ${simulatedRemaining < 0 ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-slate-900 text-white'} transition-all`}>
                                <div className="space-y-0.5">
                                    <p className="text-[8px] font-black uppercase tracking-[0.2em] opacity-60">Simulated Safe Balance</p>
                                    <h4 className="text-xl font-black tracking-tighter">Rp {simulatedRemaining.toLocaleString('id-ID')}</h4>
                                </div>
                                <Scale size={24} className={simulatedRemaining < 0 ? 'animate-pulse' : 'opacity-20'} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            {!sandboxItems || sandboxItems.length === 0 ? (
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-4 text-center border border-dashed border-amber-200 rounded-2xl">No simulations running</p>
                            ) : (
                                sandboxItems.map((item: any) => (
                                    <div key={item.id} className={`p-4 rounded-2xl border transition-all ${item.is_active ? 'bg-white border-amber-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60 grayscale'}`}>
                                        {editingId === item.id ? (
                                            <div className="flex flex-col gap-2 w-full">
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        value={editTitle} 
                                                        onChange={e => setEditTitle(e.target.value)}
                                                        className="flex-1 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                                                    />
                                                    <input 
                                                        type="number" 
                                                        value={editAmount} 
                                                        onChange={e => setEditAmount(e.target.value)}
                                                        className="w-1/3 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                                                    />
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:text-slate-600"><X size={16}/></button>
                                                    <button onClick={() => handleUpdateSandbox(item.id)} className="p-1 text-emerald-500 hover:text-emerald-600"><Save size={16}/></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => toggleSandbox(item.id)} className={`w-5 h-5 rounded flex items-center justify-center transition-all ${item.is_active ? 'bg-amber-400 text-amber-900' : 'bg-slate-200 text-slate-400'}`}>
                                                        {item.is_active && <CheckCircle size={12} />}
                                                    </button>
                                                    <span className={`text-sm font-bold ${item.is_active ? 'text-slate-900' : 'text-slate-500'}`}>{item.title}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className={`font-black ${item.is_active ? 'text-amber-600' : 'text-slate-400'}`}>Rp {Number(item.estimated_amount).toLocaleString('id-ID')}</span>
                                                    <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                                                        <button 
                                                            onClick={() => {
                                                                setEditingId(item.id);
                                                                setEditTitle(item.title);
                                                                setEditAmount(item.estimated_amount);
                                                            }}
                                                            className="text-slate-400 hover:text-blue-500 transition-colors"
                                                        >
                                                            <Edit3 size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteSandbox(item.id)}
                                                            className="text-slate-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                    {/* FULL TRANSACTION LEDGER */}
                    <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm">
                        <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                            <Clock size={20} className="text-blue-500" /> Transaction Ledger
                        </h3>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {!transactions || transactions.length === 0 && <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center py-4">No transactions yet.</p>}
                            {(transactions || []).map((t: any) => (
                                <div key={t.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 p-1.5 rounded-lg ${
                                            t.transaction_type === 'deposit' ? 'bg-emerald-100 text-emerald-600' : 
                                            t.transaction_type === 'payment' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {t.transaction_type === 'deposit' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-900">{t.title}</p>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{new Date(t.transaction_date).toLocaleDateString()} • {t.transaction_type}</p>
                                        </div>
                                    </div>
                                    <span className={`text-xs font-black ${t.transaction_type === 'deposit' ? 'text-emerald-500' : 'text-slate-700'}`}>
                                        {t.transaction_type === 'deposit' ? '+' : '-'} Rp {Number(t.amount).toLocaleString('id-ID')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
