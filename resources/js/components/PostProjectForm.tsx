import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';

interface PostProjectFormProps {
    onCancel: () => void;
    onSuccess: () => void;
}

export default function PostProjectForm({ onCancel, onSuccess }: PostProjectFormProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [budget, setBudget] = useState('');
    const [lokasi, setLokasi] = useState('');
    const [jenisProyek, setJenisProyek] = useState('umum');
    const [targetRole, setTargetRole] = useState('both');
    const [deadline, setDeadline] = useState('');
    const [images, setImages] = useState<File[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('budget', budget);
        formData.append('lokasi', lokasi);
        formData.append('jenis_proyek', jenisProyek);
        formData.append('target_role', targetRole);
        formData.append('deadline', deadline);
        images.forEach((img, i) => {
            formData.append(`images[${i}]`, img);
        });

        try {
            await axios.post('/projects', formData);
            onSuccess();
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to post project');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">📋 Tambah Proyek Baru</h2>
            
            {error && (
                <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-200">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Foto Proyek <span className="text-gray-400 font-normal">(Opsional, Maks. 3 Gambar)</span></label>
                    <input 
                        type="file" 
                        accept="image/*" 
                        multiple 
                        onChange={e => {
                            const files = Array.from(e.target.files || []);
                            setImages(prev => {
                                const combined = [...prev, ...files].slice(0, 3);
                                return combined;
                            });
                            e.target.value = '';
                        }} 
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-600 hover:file:bg-red-100 transition-colors" 
                    />
                    <p className="text-xs text-gray-400 mt-1">{images.length}/3 gambar dipilih</p>
                    {images.length > 0 && (
                        <div className="flex gap-3 mt-3">
                            {images.map((img, i) => (
                                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 shadow-sm group">
                                    <img src={URL.createObjectURL(img)} alt={`preview-${i}`} className="w-full h-full object-cover" />
                                    <button 
                                        type="button" 
                                        onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))} 
                                        className="absolute top-1 right-1 bg-black/60 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Judul Proyek</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow" placeholder="Cth: Renovasi Atap Rumah" />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Deskripsi</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={4} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow" placeholder="Jelaskan detail renovasi secara lengkap..."></textarea>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Budget (Rp)</label>
                        <input type="number" value={budget} onChange={e => setBudget(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow" placeholder="5000000" />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Lokasi</label>
                        <input type="text" value={lokasi} onChange={e => setLokasi(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow" placeholder="Cth: Bandung Barat" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Kategori Renovasi</label>
                        <select value={jenisProyek} onChange={e => setJenisProyek(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow bg-white">
                            <option value="umum">Umum</option>
                            <option value="fondasi">Fondasi</option>
                            <option value="struktur">Struktur</option>
                            <option value="dinding">Dinding</option>
                            <option value="atap">Atap</option>
                            <option value="lantai">Lantai</option>
                            <option value="ventilasi">Ventilasi</option>
                            <option value="listrik">Listrik (Electricity)</option>
                            <option value="plumbing">Plumbing (Pipa Air)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Target Pekerja</label>
                        <select value={targetRole} onChange={e => setTargetRole(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow bg-white">
                            <option value="both">Arsitek & Kontraktor</option>
                            <option value="arsitek">Hanya Arsitek</option>
                            <option value="kontraktor">Hanya Kontraktor</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Deadline Proyek</label>
                        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow" />
                    </div>
                </div>


                <div className="pt-4 flex items-center justify-end gap-3">
                    <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-lg font-semibold text-gray-600 hover:bg-gray-100 transition-colors">Batal</button>
                    <button type="submit" disabled={isLoading} className="px-5 py-2.5 rounded-lg font-semibold text-white bg-[#FF2D20] hover:bg-red-700 transition-colors disabled:opacity-50">
                        {isLoading ? 'Menyimpan...' : '🚀 Tambah Proyek'}
                    </button>
                </div>
            </form>
        </motion.div>
    );
}
