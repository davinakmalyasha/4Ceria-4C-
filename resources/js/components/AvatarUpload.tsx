import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Camera, Trash2, Loader2 } from 'lucide-react';

export default function AvatarUpload() {
    const { user, refreshUser } = useAuth();
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!user) return null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please upload an image file (PNG, JPG, JPEG)');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setError('Image must be under 2MB');
            return;
        }

        setIsUploading(true);
        setError('');
        const formData = new FormData();
        formData.append('pic', file);

        try {
            await axios.post('/me/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (refreshUser) await refreshUser();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to upload photo');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = async () => {
        if (!confirm('Are you sure you want to remove your profile picture?')) return;
        setIsUploading(true);
        setError('');
        try {
            await axios.delete('/me/avatar');
            if (refreshUser) await refreshUser();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to remove photo');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="relative group w-24 h-24 rounded-full overflow-hidden shadow-lg border border-neutral-100 bg-neutral-50 flex items-center justify-center">
                {user.pic ? (
                    <img src={user.pic} className="w-full h-full object-cover" alt="Profile" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-[#FF2D20] to-[#FF2D20]/90 flex items-center justify-center text-white font-black text-3xl">
                        {user.name?.charAt(0).toUpperCase()}
                    </div>
                )}

                {isUploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                )}

                <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer duration-200"
                >
                    <Camera className="w-6 h-6 text-white" />
                </button>
            </div>

            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
            />

            {user.pic && !isUploading && (
                <button 
                    type="button" 
                    onClick={handleRemove}
                    className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors flex items-center gap-1 cursor-pointer"
                >
                    <Trash2 className="w-3 h-3" /> Remove Photo
                </button>
            )}

            {error && (
                <div className="text-xs text-red-500 font-semibold bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 mt-1 max-w-xs text-center">
                    {error}
                </div>
            )}
        </div>
    );
}
