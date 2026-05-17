import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { X, Save, AlertCircle, Image as ImageIcon, MapPin } from 'lucide-react';
import { Project } from '../../types/project.types';
import LocationPickerMap from '../LocationPickerMap';

interface Props {
    project: Project;
    onClose: () => void;
    onSuccess: (updated: Project) => void;
}

export default function EditProjectModal({ project, onClose, onSuccess }: Props) {
    const [title, setTitle] = useState(project.title);
    const [description, setDescription] = useState(project.description);
    const [budget, setBudget] = useState(project.budget.toString());
    const [lokasi, setLokasi] = useState(project.location || '');
    const [lat, setLat] = useState(project.latitude || '-6.200000');
    const [lng, setLng] = useState(project.longitude || '106.816666');
    const [province, setProvince] = useState(project.province || '');
    const [city, setCity] = useState(project.city || '');
    const [kecamatan, setKecamatan] = useState(project.kecamatan || '');
    const [kelurahan, setKelurahan] = useState(project.kelurahan || '');
    const [postalCode, setPostalCode] = useState(project.postal_code || '');
    const [streetName, setStreetName] = useState(project.street_name || '');
    
    const [targetRole, setTargetRole] = useState(project.target_role || 'both');
    const [wantsPM, setWantsPM] = useState(!!project.wants_project_manager);
    const [deadline, setDeadline] = useState(project.deadline ? project.deadline.split('T')[0] : '');
    
    const [existingImages, setExistingImages] = useState(project.images || []);
    const [deletedImageIds, setDeletedImageIds] = useState<number[]>([]);
    const [newImages, setNewImages] = useState<File[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleImg = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const totalImages = existingImages.length + newImages.length + files.length;
        if (totalImages > 3) {
            setError('Maximum 3 images allowed.');
            return;
        }
        setNewImages(prev => [...prev, ...files].slice(0, 3 - existingImages.length));
        e.target.value = '';
    };

    const removeExistingImage = (id: number) => {
        setExistingImages(prev => prev.filter(img => img.id !== id));
        setDeletedImageIds(prev => [...prev, id]);
    };

    const removeNewImage = (idx: number) => {
        setNewImages(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        const formData = new FormData();
        formData.append('_method', 'PUT'); // Required for Laravel to handle multipart/form-data on updates
        formData.append('title', title);
        formData.append('description', description);
        formData.append('budget', budget);
        formData.append('lokasi', lokasi);
        formData.append('target_role', targetRole);
        formData.append('deadline', deadline);
        formData.append('latitude', lat);
        formData.append('longitude', lng);
        formData.append('province', province);
        formData.append('city', city);
        formData.append('kecamatan', kecamatan);
        formData.append('kelurahan', kelurahan);
        formData.append('postal_code', postalCode);
        formData.append('street_name', streetName);
        formData.append('wants_project_manager', wantsPM ? '1' : '0');

        deletedImageIds.forEach((id, index) => {
            formData.append(`deleted_images[${index}]`, id.toString());
        });

        newImages.forEach((img, index) => {
            formData.append(`images[${index}]`, img);
        });

        try {
            const res = await axios.post(`/projects/${project.id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onSuccess(res.data.data || res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update project. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/50">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Edit Project</h2>
                        <p className="text-xs text-gray-500">Update the details of your renovation.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl flex items-start gap-2 text-sm border border-red-100">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" /> <p>{error}</p>
                        </div>
                    )}
                    
                    <form id="editForm" onSubmit={handleSubmit} className="space-y-4">
                        {/* Image Upload Section */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Project Photos (Max 3)</label>
                            
                            <div className="flex flex-wrap gap-3 mb-3">
                                {existingImages.map((img) => (
                                    <div key={img.id} className="relative w-20 h-20 rounded-xl overflow-hidden group border border-gray-200">
                                        <img src={img.url} alt="Project" className="w-full h-full object-cover" />
                                        <button type="button" onClick={() => removeExistingImage(img.id)} className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                                    </div>
                                ))}
                                {newImages.map((img, i) => (
                                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group border border-gray-200">
                                        <img src={URL.createObjectURL(img)} alt="New upload" className="w-full h-full object-cover" />
                                        <button type="button" onClick={() => removeNewImage(i)} className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                            
                            {(existingImages.length + newImages.length) < 3 && (
                                <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:bg-gray-50 transition-colors group">
                                    <input type="file" accept="image/*" multiple onChange={handleImg} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                    <ImageIcon className="mx-auto h-6 w-6 text-gray-400 group-hover:text-[#FF2D20] transition-colors mb-1" />
                                    <p className="text-xs font-semibold text-gray-700">Click to upload photo</p>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Project Title</label>
                            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all placeholder:text-gray-400" placeholder="e.g. Total Roof Renovation" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={4} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all resize-none placeholder:text-gray-400" placeholder="Explain what requirements you hold..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Budget (Rp)</label>
                                <input type="number" value={budget} onChange={e => setBudget(e.target.value)} required min="100000" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Project Location (Map)</label>
                            <LocationPickerMap 
                                latitude={parseFloat(lat)} 
                                longitude={parseFloat(lng)} 
                                onChange={(newLat, newLng, address) => {
                                    setLat(newLat.toString());
                                    setLng(newLng.toString());
                                    if (address && (address.city || address.province)) {
                                        const locString = [address.street_name, address.kecamatan, address.city, address.province].filter(Boolean).join(', ');
                                        setLokasi(locString);
                                        setProvince(address.province);
                                        setCity(address.city);
                                        setKecamatan(address.kecamatan);
                                        setKelurahan(address.kelurahan);
                                        setPostalCode(address.postal_code);
                                        setStreetName(address.street_name);
                                    }
                                }} 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Short Location Text</label>
                            <input type="text" value={lokasi} onChange={e => setLokasi(e.target.value)} required className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                                <MapPin size={14} className="text-blue-500" /> Alamat Lengkap / Nama Jalan
                            </label>
                            <input 
                                type="text" 
                                value={streetName} 
                                onChange={e => setStreetName(e.target.value)} 
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all placeholder:text-gray-400" 
                                placeholder="e.g. Jl. Merdeka No. 45, RT 03/RW 02" 
                            />
                            <p className="text-[10px] text-gray-400 mt-1 italic">Updated automatically from map, but feel free to add more details.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Target Professional</label>
                                <select value={targetRole} onChange={e => setTargetRole(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all">
                                    <option value="both">Both (Arch & Cont)</option>
                                    <option value="arsitek">Architect Only</option>
                                    <option value="kontraktor">Constructor Only</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Deadline</label>
                                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} required className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all" />
                            </div>
                        </div>

                        {/* Project Manager Toggle */}
                        <div className="p-4 bg-red-50/50 border border-red-100 rounded-2xl flex items-start gap-3">
                            <div className="pt-0.5">
                                <input
                                    type="checkbox"
                                    id="wants_pm_edit"
                                    checked={wantsPM}
                                    onChange={(e) => setWantsPM(e.target.checked)}
                                    className="w-5 h-5 text-[#FF2D20] bg-white border-gray-300 rounded focus:ring-[#FF2D20] cursor-pointer"
                                />
                            </div>
                            <label htmlFor="wants_pm_edit" className="cursor-pointer">
                                <p className="text-sm font-bold text-gray-900 mb-0.5">Hire a Project Manager</p>
                                <p className="text-[10px] text-gray-600 leading-tight">
                                    A professional PM will lead the whole project, find architects/contractors, and report high-level summaries to you.
                                </p>
                            </label>
                        </div>
                    </form>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} disabled={isLoading} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all disabled:opacity-50">
                        Cancel
                    </button>
                    <button type="submit" form="editForm" disabled={isLoading} className="px-6 py-2.5 text-sm font-bold text-white bg-[#FF2D20] hover:bg-red-700 rounded-xl transition-all shadow-md shadow-red-500/20 disabled:opacity-50 flex items-center gap-2">
                        {isLoading ? <span className="animate-spin border-2 border-white/20 border-t-white rounded-full w-4 h-4"></span> : <Save size={16} />}
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
