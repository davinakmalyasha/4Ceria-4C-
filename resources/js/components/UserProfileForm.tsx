import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Phone } from 'lucide-react';

interface EditProfileFormProps {
    onCancel: () => void;
}

export default function UserProfileForm({ onCancel }: EditProfileFormProps) {
    const { user } = useAuth();
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [username, setUsername] = useState(user?.username || '');
    const [phoneNumbers, setPhoneNumbers] = useState<string[]>(user?.phone_number?.map(p => p.contact) || []);
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleAddPhone = () => {
        setPhoneNumbers([...phoneNumbers, '']);
    };

    const handlePhoneChange = (index: number, value: string) => {
        const updated = [...phoneNumbers];
        updated[index] = value;
        setPhoneNumbers(updated);
    };

    const handleRemovePhone = (index: number) => {
        setPhoneNumbers(phoneNumbers.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess(false);

        try {
            const res = await axios.put('/me', { 
                name, 
                email, 
                username,
                phone_numbers: phoneNumbers.filter(p => p.trim() !== '')
            });
            
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
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 font-medium">{error}</div>}
            {success && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm border border-green-100 font-medium">Profile updated successfully. Refreshing...</div>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Full Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all font-medium" placeholder="E.g. John Doe" />
                </div>
                
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Username</label>
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all font-medium" placeholder="johndoe123" />
                </div>
            </div>
            
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all font-medium" placeholder="john@example.com" />
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Phone Numbers</label>
                    <button type="button" onClick={handleAddPhone} className="text-[12px] font-bold text-[#FF2D20] hover:bg-red-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
                        <Plus size={14} /> Add Number
                    </button>
                </div>
                
                <div className="space-y-2">
                    {phoneNumbers.length === 0 && (
                        <p className="text-sm text-gray-400 italic">No phone numbers added yet.</p>
                    )}
                    {phoneNumbers.map((phone, index) => (
                        <div key={index} className="flex gap-2 group">
                            <div className="relative flex-1">
                                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#FF2D20] transition-colors" />
                                <input 
                                    type="tel" 
                                    value={phone} 
                                    onChange={e => handlePhoneChange(index, e.target.value)} 
                                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] outline-none transition-all font-medium" 
                                    placeholder="0812xxxxxx" 
                                />
                            </div>
                            <button type="button" onClick={() => handleRemovePhone(index)} className="p-3 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="pt-4 flex items-center gap-4">
                <button type="submit" disabled={isLoading} className="flex-1 bg-[#FF2D20] text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 hover:-translate-y-0.5">
                    {isLoading ? 'Saving Changes...' : 'Save Changes'}
                </button>
                <button type="button" onClick={onCancel} className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition-all">
                    Cancel
                </button>
            </div>
        </form>
    );
}
