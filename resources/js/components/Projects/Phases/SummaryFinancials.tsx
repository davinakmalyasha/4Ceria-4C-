import React, { useMemo } from 'react';
import { DollarSign, Wallet } from 'lucide-react';

interface SummaryFinancialsProps {
    termins: any[];
}

export default function SummaryFinancials({ termins }: SummaryFinancialsProps) {
    const stats = useMemo(() => {
        let total = 0;
        let paid = 0;
        
        termins.forEach(t => {
            const amount = Number(t.amount || 0);
            total += amount;
            if (t.status === 'paid') {
                paid += amount;
            }
        });

        const percentage = total > 0 ? Math.round((paid / total) * 100) : 0;
        const outstanding = total - paid;

        return { total, paid, outstanding, percentage };
    }, [termins]);

    if (stats.total === 0) return null;

    return (
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Contract Value</span>
                <span className="text-lg font-black text-slate-900 flex items-center gap-1">
                    <DollarSign size={16} className="text-slate-400" />
                    Rp {stats.total.toLocaleString('id-ID')}
                </span>
            </div>

            <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Paid to Date</span>
                <span className="text-lg font-black text-emerald-600 flex items-center gap-1">
                    <Wallet size={16} className="text-emerald-400" />
                    Rp {stats.paid.toLocaleString('id-ID')}
                </span>
            </div>

            <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Financial Progress</span>
                <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                            style={{ width: `${stats.percentage}%` }}
                        />
                    </div>
                    <span className="text-xs font-black text-slate-900 shrink-0">{stats.percentage}%</span>
                </div>
            </div>
        </div>
    );
}
