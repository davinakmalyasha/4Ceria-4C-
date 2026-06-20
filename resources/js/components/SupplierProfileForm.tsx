import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Building, MapPin, Phone, FileText, UploadCloud, AlertCircle, CheckCircle, RefreshCcw, Info } from 'lucide-react';
import type { ReverseGeoData } from './LocationPickerMap';
const LocationPickerMap = React.lazy(() => import('./LocationPickerMap'));
import { PortfolioManager } from './Dashboard/PortfolioManager';

interface SupplierProfileFormProps { 
    onCancel: () => void; 
    onSuccess: () => void;
}

export default function SupplierProfileForm({ onCancel, onSuccess }: SupplierProfileFormProps) {
    const { user, refreshUser } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    
    const [formData, setFormData] = useState({
        store_name: '',
        address: '',
        detail_location: '',
        latitude: '',
        longitude: '',
        no_telp: '',
        category: '',
        bio: '',
    });
    
    const [fileFoto, setFileFoto] = useState<File | null>(null);
    const [verificationStatus, setVerificationStatus] = useState('pending');
    const [suggestedAddress, setSuggestedAddress] = useState<string>('');

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await axios.get('/merchant/profile');
                if (res.data.status === 'success') {
                    const profile = res.data.data;
                    setFormData({
                        store_name: profile.store_name || '',
                        address: profile.address || '',
                        detail_location: profile.detail_location || '',
                        latitude: profile.latitude || '',
                        longitude: profile.longitude || '',
                        no_telp: profile.no_telp || '',
                        category: profile.category || '',
                        bio: profile.bio || '',
                    });
                    setVerificationStatus(profile.verification_status);
                }
            } catch (err) {
                console.error('Failed to fetch profile', err);
                setError('Failed to load store profile.');
            } finally {
                setIsFetching(false);
            }
        };
        fetchProfile();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleLocationChange = (lat: number, lng: number, geoData?: ReverseGeoData) => {
        setFormData(prev => ({ 
            ...prev, 
            latitude: lat.toFixed(7), 
            longitude: lng.toFixed(7) 
        }));

        if (geoData) {
            const detailed = [
                geoData.street_name,
                geoData.kelurahan,
                geoData.kecamatan,
                geoData.city,
                geoData.province,
                geoData.postal_code
            ].filter(Boolean).join(', ');
            
            setSuggestedAddress(detailed);
            
            // Auto-fill address ONLY if it's currently empty to avoid overwriting user's manual entry
            if (!formData.address) {
                setFormData(prev => ({ ...prev, address: detailed }));
            }
        }
    };

    const syncAddress = () => {
        if (suggestedAddress) {
            setFormData(prev => ({ ...prev, address: suggestedAddress }));
        }
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFileFoto(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess(false);

        try {
            const data = new FormData();
            Object.entries(formData).forEach(([key, value]) => {
                if (value) data.append(key, value);
            });
            if (fileFoto) data.append('foto', fileFoto);

            await axios.post('/merchant/profile', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
                params: { _method: 'PUT' }
            });

            setSuccess(true);
            await refreshUser();
            setTimeout(() => {
                onSuccess();
            }, 1500);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update profile');
        } finally {
            setIsLoading(false);
        }
    };

    if (isFetching) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm border border-red-100 flex items-center gap-3"><AlertCircle size={18} /> {error}</div>}
            {success && <div className="p-4 bg-green-50 text-green-600 rounded-2xl text-sm border border-green-100 flex items-center gap-3"><CheckCircle size={18} /> Profile updated successfully!</div>}
            
            {/* Verification Status Banner */}
            <div className={`p-4 rounded-2xl flex items-center justify-between ${
                verificationStatus === 'verified' ? 'bg-green-50 text-green-700' : 
                verificationStatus === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
            }`}>
                <div className="flex items-center gap-3">
                    <AlertCircle size={20} />
                    <div>
                        <p className="font-bold text-sm uppercase tracking-wider">Status: {verificationStatus}</p>
                        <p className="text-xs opacity-80">
                            {verificationStatus === 'verified' ? 'Your store is active and visible to buyers.' :
                             verificationStatus === 'rejected' ? 'Your store was rejected. Please update your details.' :
                             'Your store is currently under review by our team.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 md:col-span-1">
                    <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-4">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-2">
                             <Building size={18} className="text-red-500" /> Basic Store Info
                        </h3>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Store Name</label>
                            <input type="text" name="store_name" value={formData.store_name} onChange={handleChange} required className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none transition-all" placeholder="e.g. Bangunan Jaya" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Business Category</label>
                            <select name="category" value={formData.category} onChange={handleChange} required className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none transition-all">
                                <option value="">Select Category</option>
                                <option value="General Store">General Store</option>
                                <option value="Cement & Masonry">Cement & Masonry</option>
                                <option value="Steel & Metals">Steel & Metals</option>
                                <option value="Wood & Lumber">Wood & Lumber</option>
                                <option value="Electrical & Plumbing">Electrical & Plumbing</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-4">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-2">
                             <Phone size={18} className="text-red-500" /> Contact
                        </h3>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">WhatsApp Number</label>
                            <div className="relative">
                                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type="tel" name="no_telp" value={formData.no_telp} onChange={handleChange} required className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none" placeholder="08123456789" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 md:col-span-1">
                    <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 h-full flex flex-col">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
                             <FileText size={18} className="text-red-500" /> Branding & About
                        </h3>
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 text-center">Store Profile Photo</label>
                            <div className="flex flex-col items-center">
                                <div className="w-32 h-32 rounded-3xl bg-white border border-dashed border-gray-300 flex items-center justify-center overflow-hidden mb-4 relative group">
                                    {user?.supplier?.foto && !fileFoto ? (
                                        <img src={`/storage/${user.supplier.foto}`} alt="Store" className="w-full h-full object-cover" />
                                    ) : fileFoto ? (
                                        <img src={URL.createObjectURL(fileFoto)} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <UploadCloud size={32} className="text-gray-300" />
                                    )}
                                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                        <UploadCloud className="text-white" />
                                        <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
                                    </label>
                                </div>
                                <p className="text-[10px] text-gray-400 font-medium italic">Click photo to upload new image</p>
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Store Description / Bio</label>
                            <textarea name="bio" value={formData.bio} onChange={handleChange} rows={4} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none resize-none" placeholder="Tell buyers about your products, quality assurance, and delivery range..."></textarea>
                        </div>
                    </div>
                </div>
            </div>

            {/* Store Location Map - Full Width */}
            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <MapPin size={18} className="text-red-500" /> Store Pickup Location
                    </h3>
                    {suggestedAddress && suggestedAddress !== formData.address && (
                        <button 
                            type="button" 
                            onClick={syncAddress}
                            className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                        >
                            <RefreshCcw size={12} /> Sync map address
                        </button>
                    )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 relative">
                        <React.Suspense fallback={<div className="h-[300px] w-full bg-zinc-900/10 rounded-2xl border border-gray-150 flex items-center justify-center text-[10px] text-gray-400 font-mono tracking-widest uppercase">Loading Store Map...</div>}>
                            <LocationPickerMap 
                                latitude={parseFloat(formData.latitude) || -6.2} 
                                longitude={parseFloat(formData.longitude) || 106.816} 
                                onChange={handleLocationChange} 
                                label="Search for your building or pin your exact store location"
                            />
                        </React.Suspense>
                    </div>
                    <div className="space-y-4">
                        <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[2px] mb-3 flex items-center gap-2">
                                <Info size={12} /> Courier Guide
                            </h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">1. Map Location (General)</label>
                                    <textarea 
                                        name="address" 
                                        value={formData.address} 
                                        onChange={handleChange} 
                                        rows={2} 
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl outline-none text-xs leading-relaxed opacity-80" 
                                        placeholder="Jakarta Selatan, Indonesia..."
                                    ></textarea>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">2. Detail Landmark (Specific)</label>
                                    <textarea 
                                        name="detail_location" 
                                        value={formData.detail_location} 
                                        onChange={handleChange} 
                                        rows={3} 
                                        className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm leading-relaxed" 
                                        placeholder="e.g. Gedung Sinar Jaya, Lantai 2, sebelah Toko Bunga"
                                    ></textarea>
                                    <p className="text-[9px] text-indigo-400 mt-2 italic font-medium">Add building name, floor, or specific pickup point instructions.</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 opacity-50">
                            <div>
                                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Lat</label>
                                <input type="text" value={formData.latitude} className="w-full px-3 py-2 bg-gray-100 border-none rounded-lg text-[9px] font-mono" readOnly />
                            </div>
                            <div>
                                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Lng</label>
                                <input type="text" value={formData.longitude} className="w-full px-3 py-2 bg-gray-100 border-none rounded-lg text-[9px] font-mono" readOnly />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Interactive Portfolio Management inside Edit Mode */}
            <PortfolioManager isEmbedded={true} />

            <div className="flex items-center gap-4 pt-4">
                <button type="submit" disabled={isLoading} className="flex-1 px-8 py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all shadow-lg active:scale-95 disabled:opacity-50">
                    {isLoading ? 'Processing...' : 'Save & Publish Portfolio'}
                </button>
                <button type="button" onClick={onCancel} className="px-8 py-4 bg-white border border-gray-200 text-gray-500 font-bold rounded-2xl hover:bg-gray-50 transition-all">
                    Cancel
                </button>
            </div>
        </form>
    );
}
