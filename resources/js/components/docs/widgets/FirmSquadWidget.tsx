import React, { useState } from 'react';
import { Building2, UserPlus, Users, Star } from 'lucide-react';

interface Member { id: number; name: string; initials: string; color: string; role: string }

const SEED: Member[] = [
    { id: 1, name: 'Andi Pratama', initials: 'AP', color: 'bg-red-500', role: 'Lead' },
    { id: 2, name: 'Siti Rahma', initials: 'SR', color: 'bg-blue-500', role: 'Architect' },
    { id: 3, name: 'Budi Santoso', initials: 'BS', color: 'bg-emerald-500', role: 'Engineer' },
];

const POOL: Member[] = [
    { id: 4, name: 'Dewi Lestari', initials: 'DL', color: 'bg-amber-500', role: 'Surveyor' },
    { id: 5, name: 'Riko Wijaya', initials: 'RW', color: 'bg-purple-500', role: 'Foreman' },
    { id: 6, name: 'Maya Putri', initials: 'MP', color: 'bg-pink-500', role: 'Drafter' },
];

export default function FirmSquadWidget() {
    const [members, setMembers] = useState<Member[]>(SEED);
    const [poolIdx, setPoolIdx] = useState(0);

    const handleInvite = () => {
        if (poolIdx >= POOL.length) return;
        setMembers(prev => [...prev, POOL[poolIdx]]);
        setPoolIdx(i => i + 1);
    };

    return (
        <div className="p-5 bg-white rounded-2xl border border-neutral-200 shadow-sm max-w-sm mx-auto my-4 transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-red-500" />
                    <h4 className="font-extrabold text-neutral-800 text-sm">Firma Maju Jaya</h4>
                </div>
                <span className="text-[10px] bg-red-50 text-red-500 font-extrabold px-2 py-0.5 rounded-full">
                    <Users className="w-3 h-3 inline -mt-0.5 mr-0.5" />{members.length} Members
                </span>
            </div>

            <div className="space-y-2 mb-4">
                {members.map(m => (
                    <div key={m.id} className="flex items-center gap-2.5 p-2 bg-neutral-50 rounded-xl border border-neutral-100 transition-all">
                        <div className={`w-7 h-7 ${m.color} rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                            {m.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-neutral-800 truncate">{m.name}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            m.role === 'Lead' ? 'bg-amber-50 text-amber-600' : 'bg-neutral-100 text-neutral-500'
                        }`}>
                            {m.role === 'Lead' && <Star className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />}
                            {m.role}
                        </span>
                    </div>
                ))}
            </div>

            <button
                onClick={handleInvite}
                disabled={poolIdx >= POOL.length}
                className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
            >
                <UserPlus className="w-3.5 h-3.5" />
                {poolIdx >= POOL.length ? 'Squad Full' : 'Invite Member'}
            </button>
        </div>
    );
}
