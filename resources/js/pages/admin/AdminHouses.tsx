import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
    Home, 
    MapPin, 
    DollarSign, 
    User,
    Search
} from 'lucide-react';

interface House {
    id: number;
    name: string;
    price: number;
    kab_kota: string;
    street_name: string;
    user: {
        name: string;
    };
    created_at: string;
}

const AdminHouses: React.FC = () => {
    const [houses, setHouses] = useState<House[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        axios.get('/admin/houses')
            .then(res => setHouses(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    const filteredHouses = houses.filter(h => 
        h.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.user.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <AdminLayout><div>Loading...</div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="relative max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search by house name or owner..." 
                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-red-100 focus:border-[#fd1d1d] transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-400 font-bold text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Property</th>
                                <th className="px-6 py-4">Owner</th>
                                <th className="px-6 py-4">Location</th>
                                <th className="px-6 py-4">Price</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredHouses.map((house) => (
                                <tr key={house.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                                <Home size={20} />
                                            </div>
                                            <p className="font-bold text-gray-900">{house.name}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-2 text-gray-600">
                                            <User size={14} />
                                            <span className="text-sm">{house.user.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-2 text-gray-500">
                                            <MapPin size={14} />
                                            <span className="text-sm truncate max-w-xs">{house.kab_kota || house.street_name || 'N/A'}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-gray-900 flex items-center">
                                            <DollarSign size={14} className="text-green-500 mr-1" />
                                            {Number(house.price).toLocaleString()}
                                        </p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminHouses;
