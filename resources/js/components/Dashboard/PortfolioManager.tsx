import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, X, Upload, Trash2 } from 'lucide-react';
import { PortfolioProject } from '../../types/project.types';
import { useAuth } from '../../context/AuthContext';

interface PortfolioManagerProps {
    isEmbedded?: boolean;
}

export const PortfolioManager: React.FC<PortfolioManagerProps> = ({ isEmbedded = false }) => {
    const { user } = useAuth();
    const [portfolios, setPortfolios] = useState<PortfolioProject[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        duration: '',
        image: null as File | null
    });

    useEffect(() => {
        fetchPortfolios();
    }, []);

    const fetchPortfolios = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const res = await axios.get(`/portfolios?user_id=${user.id}`);
            setPortfolios(res.data);
        } catch (err) {
            console.error('Failed to fetch portfolios', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this portfolio project?')) return;
        try {
            await axios.delete(`/portfolios/${id}`);
            fetchPortfolios();
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!user) return;
        
        const data = new FormData();
        data.append('title', formData.title);
        data.append('description', formData.description);
        data.append('duration', formData.duration);
        data.append('role_type', user.role_type);
        if (formData.image) {
            data.append('image', formData.image);
        }

        setIsLoading(true);
        try {
            await axios.post('/portfolios', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setIsAdding(false);
            setFormData({ title: '', description: '', duration: '', image: null });
            fetchPortfolios();
        } catch (err: any) {
            console.error(err);
            const errorMsg = err.response?.data?.message || 'Failed to save portfolio';
            const validationErrors = err.response?.data?.errors;
            
            if (validationErrors) {
                const firstError = Object.values(validationErrors)[0] as string[];
                alert(`${errorMsg}: ${firstError[0]}`);
            } else {
                alert(errorMsg);
            }
            setIsLoading(false);
        }
    };

    return (
        <div className={isEmbedded ? "mt-8 pt-8 border-t border-gray-100" : "bg-white p-8 rounded-2xl shadow-sm border border-gray-200 mt-6 max-w-3xl"}>
            <div className="flex items-center justify-between mb-6">
                <h4 className={`font-bold text-gray-900 ${isEmbedded ? 'text-lg' : 'text-xl'}`}>Project Portfolio</h4>
                {!isAdding && (
                    <button 
                        onClick={() => setIsAdding(true)}
                        className="bg-[#FF2D20] text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700 transition flex items-center gap-2"
                    >
                        <Plus size={16} /> Add Project
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="bg-gray-50 p-6 rounded-2xl mb-8 border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <h5 className="font-bold text-gray-900">New Portfolio Entry</h5>
                        <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Project Title</label>
                            <input 
                                type="text" 
                                required
                                value={formData.title}
                                onChange={e => setFormData({...formData, title: e.target.value})}
                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20]"
                                placeholder="e.g. Modern Villa in Bali"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                            <textarea 
                                required
                                rows={3}
                                value={formData.description}
                                onChange={e => setFormData({...formData, description: e.target.value})}
                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20]"
                                placeholder="Describe your role and what was built..."
                            ></textarea>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Duration</label>
                                <input 
                                    type="text" 
                                    value={formData.duration}
                                    onChange={e => setFormData({...formData, duration: e.target.value})}
                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20]"
                                    placeholder="e.g. 6 Months"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Project Photo</label>
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        onChange={e => setFormData({...formData, image: e.target.files ? e.target.files[0] : null})}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
                                        <span className="text-gray-500 truncate">{formData.image ? formData.image.name : 'Choose image...'}</span>
                                        <Upload size={16} className="text-gray-400" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <button 
                                disabled={isLoading} 
                                type="button" 
                                onClick={handleSubmit}
                                className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-black transition-all"
                            >
                                {isLoading ? 'Saving...' : 'Save Project'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isLoading && !isAdding ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
            ) : portfolios.length === 0 && !isAdding ? (
                <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    No portfolio projects yet. Add some to stand out in your bids!
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {portfolios.map(p => (
                        <div key={p.id} className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm group">
                            {p.image_path ? (
                                <img src={`/storage/${p.image_path}`} alt={p.title} className="w-full h-40 object-cover" />
                            ) : (
                                <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-gray-400">No Image</div>
                            )}
                            <div className="p-5 relative">
                                <button 
                                    onClick={() => handleDelete(p.id)}
                                    className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={18} />
                                </button>
                                <h5 className="font-bold text-gray-900 mb-1 pr-8">{p.title}</h5>
                                <p className="text-xs text-gray-500 mb-3">{p.duration}</p>
                                <p className="text-sm text-gray-600 line-clamp-2 mb-3">{p.description}</p>
                                {p.client_review && (
                                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        <p className="text-xs text-gray-500 italic">"{p.client_review}"</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
