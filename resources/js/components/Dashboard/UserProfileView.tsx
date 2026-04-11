import React from 'react';
import { User as UserIcon, Phone, Star } from 'lucide-react';

interface Props {
    user: any;
    setIsEditingProfile: (v: boolean) => void;
}

export const UserProfileView: React.FC<Props> = ({ user, setIsEditingProfile }) => {
    return (
        <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-3xl">
                <div className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-extrabold text-4xl">
                        {user?.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h4 className="text-2xl font-bold text-gray-900">{user?.name}</h4>
                        <p className="text-gray-500">{user?.email}</p>
                    </div>
                </div>
                <hr className="my-8 border-gray-100" />
                
                <div className="space-y-6">
                    <div className={`grid grid-cols-1 ${user?.role_type === 'user' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6`}>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Username</label>
                            <div className="text-gray-900 font-semibold text-lg">{user?.username}</div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Email Address</label>
                            <div className="text-gray-900 font-semibold text-lg">{user?.email}</div>
                        </div>
                        {user?.role_type === 'user' && (
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Phone Number</label>
                                <div className="text-gray-900 font-semibold text-lg flex items-center gap-2">
                                    <Phone size={14} className="text-[#FF2D20]" />
                                    {user?.phone_number && user.phone_number.length > 0 
                                        ? user.phone_number.map((p: any) => p.contact).join(', ') 
                                        : '-'}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Role Specific Read-Only Data */}
                    {user?.role_type === 'arsitek' && (
                        <div className="space-y-4 pt-4 border-t border-gray-100">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Rate (Hourly)</label><div className="text-gray-900 font-semibold text-lg">{user?.arsitek?.rate_harga ? `Rp ${user.arsitek.rate_harga}` : '-'}</div></div>
                                <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Experience</label><div className="text-gray-900 font-semibold text-lg">{user?.arsitek?.pengalaman_tahun ? `${user.arsitek.pengalaman_tahun} Years` : '-'}</div></div>
                                <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">WhatsApp</label><div className="text-gray-900 font-semibold text-lg flex items-center gap-2">
                                    <Phone size={14} className="text-[#FF2D20]" />
                                    {user?.arsitek?.no_telp || '-'}
                                </div></div>
                                <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Location</label><div className="text-gray-900 font-semibold text-lg">{user?.arsitek?.lokasi || '-'}</div></div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-8">
                    <button 
                        onClick={() => setIsEditingProfile(true)}
                        className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-black transition-all"
                    >
                        Edit Profile Details
                    </button>
                </div>
            </div>
        </div>
    );
};
