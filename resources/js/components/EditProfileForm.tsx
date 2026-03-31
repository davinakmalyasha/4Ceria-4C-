import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

interface EditProfileFormProps {
    onCancel: () => void;
}

export default function EditProfileForm({ onCancel }: EditProfileFormProps) {
    const { user, login } = useAuth(); // Assuming login or a setUser method can update context
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [username, setUsername] = useState(user?.username || '');
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess(false);

        try {
            const res = await axios.put('/api/me', { name, email, username });
            // To update global context, we'd ideally have an authenticate/refresh method in AuthContext.
            // For now, reloading the page or forcing an API refetch handles it.
            setSuccess(true);
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update profile');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
            {success && <div className="p-3 bg-green-50 text-green-600 rounded-lg text-sm">Profile updated successfully. Refreshing...</div>}
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow" />
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow" />
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF2D20]/50 outline-none transition-shadow" />
            </div>

            <div className="pt-4 flex items-center gap-3">
                <button type="submit" disabled={isLoading} className="flex-1 bg-[#FF2D20] text-white py-2 rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
                    {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={onCancel} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-200 transition-colors">
                    Cancel
                </button>
            </div>
        </form>
    );
}
