import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, Package, User, Calendar, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface HistoryLog {
    id: number;
    project_requirement_id: number;
    user_id: number;
    type: 'restock' | 'use';
    quantity: string;
    notes: string;
    created_at: string;
    requirement?: {
        name: string;
        unit: string;
    };
    user?: {
        name: string;
    };
}

interface Props {
    project: any;
}

export default function MaterialHistoryLog({ project }: Props) {
    const [logs, setLogs] = useState<HistoryLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchHistory();
    }, [project.id]);

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get(`/projects/${project.id}/requirements-history`);
            setLogs(res.data.data);
        } catch (err: any) {
            setError('Failed to fetch history logs.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="animate-spin text-slate-400" size={32} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12 text-red-500 font-bold">
                {error}
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="text-center py-12 text-slate-400 font-bold">
                No transaction history yet.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-lg font-black text-slate-900 mb-4">Material Transaction Log</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-slate-100">
                                <th className="pb-3 pl-2">Date</th>
                                <th className="pb-3">Material</th>
                                <th className="pb-3">Action</th>
                                <th className="pb-3">Quantity</th>
                                <th className="pb-3">By</th>
                                <th className="pb-3">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-4 pl-2 font-bold text-slate-500 text-xs">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={12} className="text-slate-400" />
                                            {new Date(log.created_at).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="py-4 font-bold text-slate-900">
                                        <div className="flex items-center gap-2">
                                            <Package size={14} className="text-slate-400" />
                                            {log.requirement?.name || 'Deleted Material'}
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                            log.type === 'restock' 
                                                ? (Number(log.quantity) === 0 ? (log.notes?.includes('Moved') ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-600') : 'bg-emerald-50 text-emerald-600')
                                                : 'bg-orange-50 text-orange-600'
                                        }`}>
                                            {log.type === 'restock' ? (Number(log.quantity) === 0 ? (log.notes?.includes('Moved') ? <ArrowUpRight size={10} /> : <Package size={10} />) : <ArrowUpRight size={10} />) : <ArrowDownLeft size={10} />}
                                            {log.type === 'restock' ? (Number(log.quantity) === 0 ? (log.notes?.includes('Moved') ? 'Moved' : 'Created') : 'Restock') : 'Usage'}
                                        </span>
                                    </td>
                                    <td className="py-4 font-black text-slate-700">
                                        {log.type === 'use' ? '-' : '+'}{log.quantity} {log.requirement?.unit}
                                    </td>
                                    <td className="py-4 font-bold text-slate-600 text-xs">
                                        <div className="flex items-center gap-2">
                                            <User size={12} className="text-slate-400" />
                                            {log.user?.name || 'System'}
                                        </div>
                                    </td>
                                    <td className="py-4 text-slate-500 text-xs max-w-xs truncate" title={log.notes}>
                                        {log.notes || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
