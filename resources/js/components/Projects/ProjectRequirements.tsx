import React, { useState } from 'react';
import { 
    Package, Plus, Trash2, ShoppingCart, 
    CheckCircle2, AlertTriangle, Info, ArrowUpRight,
    Loader2, Hammer, History, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Project, ProjectRequirement, formatCurrency } from '../../types/project.types';
import { useToast } from '../../context/ToastContext';


interface ProjectRequirementsProps {
    project: Project;
    onUpdate: () => void;
}

export default function ProjectRequirements({ project, onUpdate }: ProjectRequirementsProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usageModal, setUsageModal] = useState<ProjectRequirement | null>(null);
    const [usageQty, setUsageQty] = useState('');
    const { showToast } = useToast();


    const [newRequirement, setNewRequirement] = useState({
        name: '',
        quantity_required: '',
        unit: 'Pcs',
        notes: ''
    });

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await axios.post(`/projects/${project.id}/requirements`, newRequirement);
            setIsAdding(false);
            setNewRequirement({ name: '', quantity_required: '', unit: 'Pcs', notes: '' });
            showToast('Requirement added successfully', 'success');
            onUpdate();

        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to add requirement');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await axios.delete(`/projects/${project.id}/requirements/${id}`);
            showToast('Requirement removed', 'success');
            onUpdate();

        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    const handleLogUsage = async () => {
        if (!usageModal || !usageQty) return;
        setIsLoading(true);
        try {
            await axios.post(`/projects/${project.id}/requirements/${usageModal.id}/usage`, {
                quantity: parseFloat(usageQty)
            });
            setUsageModal(null);
            setUsageQty('');
            showToast('Usage logged successfully', 'success');
            onUpdate();
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to log usage', 'error');
        } finally {

            setIsLoading(false);
        }
    };

    const calculateProgress = (req: ProjectRequirement) => {
        const onSite = Number(req.quantity_on_site);
        const needed = Number(req.quantity_required);
        return Math.min(Math.round((onSite / needed) * 100), 100);
    };

    const calculateUsage = (req: ProjectRequirement) => {
        const used = Number(req.quantity_used);
        const needed = Number(req.quantity_required);
        return Math.min(Math.round((used / needed) * 100), 100);
    };

    return (
        <div className="space-y-8 p-1">
            {/* Header & Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        <Package className="text-red-500" size={28} />
                        Materials & Site Inventory
                    </h3>
                    <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">
                        Site Stock Tracking & Procurement
                    </p>
                </div>
                <button 
                    onClick={() => setIsAdding(!isAdding)}
                    className="bg-gray-900 text-white px-6 py-4 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-3 active:scale-95 self-start"
                >
                    {isAdding ? <Info size={16} /> : <Plus size={16} />}
                    {isAdding ? 'View List' : 'Add Requirement'}
                </button>
            </div>

            <AnimatePresence mode="wait">
                {isAdding ? (
                    <motion.div 
                        key="form"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100"
                    >
                        <form onSubmit={handleAdd} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Material Name</label>
                                    <input 
                                        type="text" required
                                        placeholder="e.g., Cement 40kg, Red Bricks..."
                                        value={newRequirement.name}
                                        onChange={e => setNewRequirement({...newRequirement, name: e.target.value})}
                                        className="w-full px-6 py-4 bg-white border border-gray-100 rounded-3xl text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Target Qty</label>
                                        <input 
                                            type="number" required min="0" step="0.01"
                                            placeholder="100"
                                            value={newRequirement.quantity_required}
                                            onChange={e => setNewRequirement({...newRequirement, quantity_required: e.target.value})}
                                            className="w-full px-6 py-4 bg-white border border-gray-100 rounded-3xl text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Unit</label>
                                        <select 
                                            value={newRequirement.unit}
                                            onChange={e => setNewRequirement({...newRequirement, unit: e.target.value})}
                                            className="w-full px-6 py-4 bg-white border border-gray-100 rounded-3xl text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all"
                                        >
                                            <option>Pcs</option>
                                            <option>Bags</option>
                                            <option>M3</option>
                                            <option>Tons</option>
                                            <option>Liters</option>
                                            <option>Other</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Instruction for Owner / Buyer</label>
                                <textarea 
                                    rows={3}
                                    placeholder="Write specific brands, grades, or procurement notes..."
                                    value={newRequirement.notes}
                                    onChange={e => setNewRequirement({...newRequirement, notes: e.target.value})}
                                    className="w-full px-6 py-4 bg-white border border-gray-100 rounded-[2rem] text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all resize-none"
                                />
                            </div>
                            {error && <p className="text-xs text-red-500 font-bold ml-2">{error}</p>}
                            <button 
                                type="submit" disabled={isLoading}
                                className="w-full bg-red-500 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-500/20 hover:bg-red-600 transition-all flex items-center justify-center gap-3"
                            >
                                {isLoading ? <Loader2 className="animate-spin" /> : <Plus size={16} />}
                                Add to Project Master List
                            </button>
                        </form>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="list"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                    >
                        {project.requirements?.length === 0 ? (
                            <div className="col-span-full py-20 bg-gray-50 rounded-[3rem] border border-dashed border-gray-200 flex flex-col items-center justify-center text-center px-6">
                                <div className="p-6 bg-white rounded-full shadow-sm mb-6">
                                    <Hammer className="text-gray-200" size={48} />
                                </div>
                                <h4 className="text-xl font-black text-gray-900 tracking-tight">Empty Inventory List</h4>
                                <p className="text-gray-400 font-bold max-w-sm mt-2 italic leading-relaxed">
                                    Start by adding specific materials required for this construction phase. 
                                    The system will track their delivery automatically.
                                </p>
                            </div>
                        ) : (
                            project.requirements?.map((req, idx) => {
                                const progOnSite = calculateProgress(req);
                                const progUsed = calculateUsage(req);
                                const isShortage = Number(req.quantity_on_site) + Number(req.quantity_used) < Number(req.quantity_required);

                                return (
                                    <motion.div 
                                        key={req.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:scale-[1.01] transition-all group relative overflow-hidden"
                                    >
                                        {/* Background Accent */}
                                        <div className={`absolute top-0 right-0 w-32 h-32 blur-[80px] opacity-10 rounded-full translate-x-12 -translate-y-12 ${isShortage ? 'bg-red-500' : 'bg-indigo-500'}`} />

                                        <div className="relative flex items-start justify-between mb-8">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="text-lg font-black text-gray-900 tracking-tight leading-tight">{req.name}</h4>
                                                    {progUsed === 100 && <CheckCircle2 className="text-green-500" size={18} />}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                                        {req.unit}
                                                    </span>
                                                    {isShortage && (
                                                        <span className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1">
                                                            <AlertTriangle size={10} /> Shortage
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleDelete(req.id)}
                                                className="p-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all rounded-xl hover:bg-red-50"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>

                                        {/* Progressive Bars */}
                                        <div className="space-y-6 mb-8">
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest italic">Procurement Progress</span>
                                                    <span className="text-xs font-black text-gray-900">
                                                        {req.quantity_on_site + req.quantity_used} / {req.quantity_required}
                                                    </span>
                                                </div>
                                                <div className="h-3 bg-gray-50 rounded-full overflow-hidden border border-gray-100 p-0.5">
                                                    <motion.div 
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${progOnSite}%` }}
                                                        className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full shadow-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-[9px] font-black text-green-500 uppercase tracking-widest italic">Usage On Site</span>
                                                    <span className="text-xs font-black text-gray-900">
                                                        {req.quantity_used} consumed
                                                    </span>
                                                </div>
                                                <div className="h-3 bg-gray-50 rounded-full overflow-hidden border border-gray-100 p-0.5">
                                                    <motion.div 
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${progUsed}%` }}
                                                        className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full shadow-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Hub */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <button 
                                                onClick={() => setUsageModal(req)}
                                                className="bg-gray-900 text-white py-3.5 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
                                            >
                                                <History size={14} /> Log Usage
                                            </button>
                                            <a 
                                                href={`/marketplace?search=${encodeURIComponent(req.name)}`}
                                                className="bg-white border border-gray-100 text-gray-900 py-3.5 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:border-red-500 hover:text-red-500 transition-all flex items-center justify-center gap-2"
                                            >
                                                <ShoppingCart size={14} /> Buy Now
                                            </a>
                                        </div>

                                        {req.notes && (
                                            <div className="mt-6 pt-6 border-t border-gray-50 flex items-start gap-2 italic">
                                                <Info size={12} className="text-gray-300 mt-1 flex-shrink-0" />
                                                <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                                                    {req.notes}
                                                </p>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Log Usage Modal */}
            <AnimatePresence>
                {usageModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setUsageModal(null)}
                            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-sm bg-white rounded-[3rem] p-10 shadow-2xl overflow-hidden"
                        >
                            {/* Decorative Background */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-indigo-500 to-green-500" />
                            
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-green-50 text-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <Hammer size={32} />
                                </div>
                                <h4 className="text-xl font-black text-gray-900 tracking-tight">Log Material Usage</h4>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1 italic">
                                    Decreasing Site Inventory
                                </p>
                            </div>

                            <div className="space-y-6">
                                <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 text-center">
                                    <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Available On-Site</span>
                                    <span className="text-2xl font-black text-gray-900">
                                        {usageModal.quantity_on_site} {usageModal.unit}
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">How much did you consume?</label>
                                    <div className="flex gap-3">
                                        <input 
                                            type="number" step="0.01" autoFocus
                                            placeholder="0.00"
                                            value={usageQty}
                                            onChange={e => setUsageQty(e.target.value)}
                                            className="w-full px-6 py-5 bg-gray-50 border border-gray-100 rounded-3xl text-xl font-black text-center focus:ring-4 focus:ring-green-500/5 focus:border-green-500 outline-none transition-all placeholder:text-gray-200"
                                        />
                                    </div>
                                    <p className="text-[9px] text-gray-400 text-center italic mt-2">
                                        This will subtract from site stock and mark items as "Used" for cost tracking.
                                    </p>
                                </div>

                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => setUsageModal(null)}
                                        className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleLogUsage}
                                        disabled={isLoading || !usageQty}
                                        className="flex-1 bg-green-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-500/20 hover:bg-green-600 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                        Update Log
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
