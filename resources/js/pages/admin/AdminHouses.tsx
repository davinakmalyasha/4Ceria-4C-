import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
    Home, 
    MapPin, 
    DollarSign, 
    User,
    Search,
    ShieldAlert,
    RefreshCw
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface House {
    id: number;
    name: string;
    price: number;
    kab_kota: string;
    street_name: string;
    is_suspended: boolean;
    user: {
        name: string;
    };
    created_at: string;
}

const AdminHouses: React.FC = () => {
    const [houses, setHouses] = useState<House[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [updatingHouseId, setUpdatingHouseId] = useState<number | null>(null);
    const { showToast } = useToast();

    const fetchHouses = () => {
        setLoading(true);
        axios.get('/admin/houses')
            .then(res => setHouses(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchHouses();
    }, []);

    const handleToggleSuspend = (house: House) => {
        setUpdatingHouseId(house.id);
        axios.patch(`/admin/houses/${house.id}/suspend`)
            .then(res => {
                showToast(res.data.message, 'success');
                setHouses(prev => prev.map(h => h.id === house.id ? { ...h, is_suspended: !h.is_suspended } : h));
            })
            .catch(err => showToast(err.response?.data?.message || 'Moderation action failed', 'error'))
            .finally(() => setUpdatingHouseId(null));
    };

    const filteredHouses = houses.filter(h => 
        h.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.user.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">Properties Moderation</h3>
                        <p className="text-[11px] text-neutral-400 font-semibold mt-0.5">Audit uploaded listings and suspend items that violate community standards.</p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                            <input 
                                type="text" 
                                placeholder="Search by property or owner..." 
                                className="pl-9 pr-4 py-2 border border-neutral-200 bg-[#fafafa] rounded-xl text-xs font-semibold placeholder:text-neutral-300 focus:bg-white focus:ring-1 focus:ring-neutral-950 focus:border-neutral-950 outline-none transition-all w-full sm:w-64"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <button onClick={fetchHouses} className="p-2 border border-neutral-200 bg-[#fafafa] hover:bg-neutral-50 rounded-xl text-neutral-500 hover:text-neutral-900 transition-colors">
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                                <th className="px-6 py-3.5">Property Listing</th>
                                <th className="px-6 py-3.5">Owner / Contact</th>
                                <th className="px-6 py-3.5">Location</th>
                                <th className="px-6 py-3.5">Price</th>
                                <th className="px-6 py-3.5">Status</th>
                                <th className="px-6 py-3.5 text-right">Moderator Controls</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 text-xs">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-neutral-400 italic">
                                        Loading listed estate portfolio...
                                    </td>
                                </tr>
                            ) : filteredHouses.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-neutral-400 italic">
                                        No listed properties found.
                                    </td>
                                </tr>
                            ) : (
                                filteredHouses.map((house) => (
                                    <tr key={house.id} className="hover:bg-neutral-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-9 h-9 rounded bg-neutral-50 border border-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
                                                    <Home size={16} />
                                                </div>
                                                <p className="font-extrabold text-neutral-900">{house.name}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-2 text-neutral-700 font-bold">
                                                <User size={13} className="text-neutral-400" />
                                                <span>{house.user?.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-2 text-neutral-500 font-semibold">
                                                <MapPin size={13} />
                                                <span className="truncate max-w-xs">{house.kab_kota || house.street_name || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="font-extrabold text-neutral-900 flex items-center">
                                                <DollarSign size={13} className="text-neutral-400 mr-0.5" />
                                                {Number(house.price).toLocaleString()}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            {house.is_suspended ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-950 text-white rounded text-[9px] font-black uppercase tracking-wider shadow-sm">
                                                    <ShieldAlert size={10} /> Suspended
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-800 border rounded text-[9px] font-black uppercase tracking-wider">
                                                    Active
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                disabled={house.id === updatingHouseId}
                                                onClick={() => handleToggleSuspend(house)}
                                                className={`px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider text-[10px] transition-all disabled:opacity-50 ${
                                                    house.is_suspended
                                                    ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
                                                    : 'bg-neutral-950 hover:bg-neutral-900 text-white shadow-sm'
                                                }`}
                                            >
                                                {house.is_suspended ? 'Activate Listing' : 'Suspend Listing'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminHouses;
