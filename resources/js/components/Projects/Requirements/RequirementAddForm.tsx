import React, { useState, useEffect } from 'react';
import { Plus, Info, Loader2, Image as ImageIcon, Check } from 'lucide-react';

interface RequirementAddFormProps {
    isLoading: boolean;
    onSubmit: (data: FormData) => Promise<void>;
    onCancel: () => void;
    initialData?: any;
}

export default function RequirementAddForm({ isLoading, onSubmit, onCancel, initialData }: RequirementAddFormProps) {
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        quantity_required: initialData?.quantity_required || '',
        bom_type: initialData?.bom_type || 'raw',
        unit: initialData?.unit || 'Pcs',
        notes: initialData?.notes || '',
        purpose: initialData?.purpose || '',
        quality_level: initialData?.quality_level || 'standard',
        category: initialData?.category || 'general',
        estimated_unit_cost: initialData?.estimated_unit_cost || ''
    });
    const [image, setImage] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            const data = new FormData();
            data.append('name', formData.name);
            data.append('quantity_required', formData.quantity_required.toString());
            data.append('bom_type', formData.bom_type);
            data.append('unit', formData.unit);
            data.append('notes', formData.notes);
            data.append('purpose', formData.purpose);
            data.append('quality_level', formData.quality_level);
            data.append('category', formData.category);
            data.append('estimated_unit_cost', formData.estimated_unit_cost.toString());
            if (initialData && initialData.id) {
                data.append('_method', 'PUT'); // Laravel method spoofing for PUT with FormData
            }
            if (image) {
                data.append('image', image);
            }

            await onSubmit(data);
        } catch (err: any) {
            setError(err.response?.data?.message || `Failed to ${initialData ? 'update' : 'add'} material item.`);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Material Name</label>
                    <input 
                        type="text" required
                        placeholder="e.g., Cement 40kg, Floor Tiles..."
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full px-6 py-4 bg-white border border-slate-100 rounded-3xl text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Target Quantity</label>
                        <input 
                            type="number" required min="0" step="0.01"
                            placeholder="100"
                            value={formData.quantity_required}
                            onChange={e => setFormData({...formData, quantity_required: e.target.value})}
                            className="w-full px-6 py-4 bg-white border border-slate-100 rounded-3xl text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Unit</label>
                        <select 
                            value={formData.unit}
                            onChange={e => setFormData({...formData, unit: e.target.value})}
                            className="w-full px-6 py-4 bg-white border border-slate-100 rounded-3xl text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all"
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">BOM Type Category</label>
                    <select 
                        value={formData.bom_type}
                        onChange={e => setFormData({...formData, bom_type: e.target.value})}
                        className="w-full px-6 py-4 bg-white border border-slate-100 rounded-3xl text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all"
                    >
                        <option value="raw">Bahan Baku (Raw Structural Materials)</option>
                        <option value="finishing">Bahan Finishing (Aesthetic/Surface Materials)</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Quality Grade</label>
                    <select 
                        value={formData.quality_level}
                        onChange={e => setFormData({...formData, quality_level: e.target.value})}
                        className="w-full px-6 py-4 bg-white border border-slate-100 rounded-3xl text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all"
                    >
                        <option value="standard">Standard Grade</option>
                        <option value="premium">Premium Grade</option>
                        <option value="luxury">Luxury / Custom Grade</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Estimated Price per Unit (Rp)</label>
                    <input 
                        type="number" min="0" step="0.01"
                        placeholder="e.g., 4000"
                        value={formData.estimated_unit_cost}
                        onChange={e => setFormData({...formData, estimated_unit_cost: e.target.value})}
                        className="w-full px-6 py-4 bg-white border border-slate-100 rounded-3xl text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Total Estimated Cost</label>
                    <div className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl text-sm font-black text-slate-700">
                        Rp {((parseFloat(formData.quantity_required) || 0) * (parseFloat(formData.estimated_unit_cost) || 0)).toLocaleString()}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Why/Purpose (Optional)</label>
                    <textarea 
                        rows={2}
                        placeholder="e.g., Required for master bedroom walls"
                        value={formData.purpose}
                        onChange={e => setFormData({...formData, purpose: e.target.value})}
                        className="w-full px-6 py-4 bg-white border border-slate-100 rounded-[2rem] text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all resize-none"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Procurement Notes / Brand details</label>
                    <textarea 
                        rows={2}
                        placeholder="Provide instructions regarding specific brands, specs, or supplier preference..."
                        value={formData.notes}
                        onChange={e => setFormData({...formData, notes: e.target.value})}
                        className="w-full px-6 py-4 bg-white border border-slate-100 rounded-[2rem] text-sm font-bold focus:ring-4 focus:ring-red-500/5 focus:border-red-500 outline-none transition-all resize-none"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Reference Image (Optional)</label>
                <div className="relative">
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={e => setImage(e.target.files ? e.target.files[0] : null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className={`w-full px-6 py-4 bg-white border ${image ? 'border-green-400 bg-green-50' : 'border-slate-100'} rounded-[2rem] text-sm font-bold flex items-center gap-3 transition-all`}>
                        {image ? <Check size={18} className="text-green-500" /> : <ImageIcon size={18} className="text-slate-400" />}
                        <span className={image ? 'text-green-700' : 'text-slate-400'}>
                            {image ? image.name : 'Click to attach image...'}
                        </span>
                    </div>
                </div>
            </div>

            {error && <p className="text-xs text-red-500 font-bold ml-2">{error}</p>}
            
            <div className="flex gap-4">
                <button 
                    type="button" onClick={onCancel}
                    className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                >
                    Cancel
                </button>
                <button 
                    type="submit" disabled={isLoading}
                    className="flex-1 bg-red-500 text-white py-4 rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-500/20 hover:bg-red-600 transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : (initialData ? <Check size={16} /> : <Plus size={16} />)}
                    {initialData ? 'Save Changes' : 'Add to BOM List'}
                </button>
            </div>
        </form>
    );
}
