import React from 'react';
import { User, Phone, MessageSquare, Pencil } from 'lucide-react';
import axios from 'axios';

interface ClientContactCardProps {
    owner: {
        id: number;
        name: string;
        phone?: string;
    };
    user: any;
    onOpenChat?: (user: { id: number }) => void;
    isOwner: boolean;
    onRefresh: () => void;
}

export default function ClientContactCard({ owner, user, onOpenChat, isOwner, onRefresh }: ClientContactCardProps) {
    if (!owner) return null;

    const [isEditing, setIsEditing] = React.useState(false);
    const [editName, setEditName] = React.useState(owner.name || '');
    const [editPhone, setEditPhone] = React.useState(owner.phone || '');
    const [isLoading, setIsLoading] = React.useState(false);

    // Sync state when props change
    React.useEffect(() => {
        setEditName(owner.name || '');
        setEditPhone(owner.phone || '');
    }, [owner]);

    const formatWhatsAppLink = (phone: string) => {
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '62' + cleaned.substring(1);
        }
        return `https://wa.me/${cleaned}`;
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editName.trim()) return;

        setIsLoading(true);
        try {
            // Send PUT request to /me containing name, phone number, and current email/username (required by backend validator)
            await axios.put('/me', {
                name: editName,
                email: user.email,
                username: user.username,
                phone_numbers: editPhone ? [editPhone] : []
            });
            setIsEditing(false);
            onRefresh();
        } catch (error) {
            console.error('Failed to update inline contact details:', error);
            alert('Failed to update contact info. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isEditing) {
        return (
            <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">
                        Edit Contact Info
                    </h3>
                    <Pencil size={14} className="text-gray-400" />
                </div>
                
                <form onSubmit={handleSave} className="space-y-3">
                    <div>
                        <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-1">Full Name</label>
                        <input
                            type="text"
                            required
                            disabled={isLoading}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none transition-all disabled:opacity-50"
                            placeholder="Full Name"
                        />
                    </div>

                    <div>
                        <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-wide mb-1">Phone Number</label>
                        <input
                            type="tel"
                            disabled={isLoading}
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none transition-all disabled:opacity-50"
                            placeholder="0812xxxxxx"
                        />
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="submit"
                            disabled={isLoading || !editName.trim()}
                            className="flex-1 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50 active:scale-[0.98]"
                        >
                            {isLoading ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => {
                                setEditName(owner.name || '');
                                setEditPhone(owner.phone || '');
                                setIsEditing(false);
                            }}
                            className="flex-1 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </section>
        );
    }

    return (
        <section className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                    {isOwner ? 'My Contact Info' : 'Client Contact'}
                </h3>
                <User size={14} className="text-gray-400" />
            </div>
            
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-600 shrink-0">
                        <User size={14} />
                    </div>
                    <div className="min-w-0">
                        <span className="text-[9px] text-gray-400 font-bold block uppercase tracking-wide leading-none">Name</span>
                        <span className="text-xs font-black text-gray-900 mt-0.5 block truncate">
                            {owner.name}
                        </span>
                    </div>
                </div>

                {owner.phone && (
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-600 shrink-0">
                            <Phone size={14} />
                        </div>
                        <div className="min-w-0">
                            <span className="text-[9px] text-gray-400 font-bold block uppercase tracking-wide leading-none">Phone Number</span>
                            <span className="text-xs font-black text-gray-900 mt-0.5 block truncate" title={owner.phone}>
                                {owner.phone}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="pt-1">
                {isOwner ? (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs transition-all shadow-sm active:scale-[0.98]"
                    >
                        <Pencil size={13} />
                        Edit Profile Info
                    </button>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {owner.phone ? (
                            <a
                                href={formatWhatsAppLink(owner.phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs transition-colors border border-emerald-100/50"
                            >
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                                WhatsApp
                            </a>
                        ) : (
                            <div className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 text-gray-400 font-bold text-xs border border-gray-100 cursor-not-allowed">
                                No Phone
                            </div>
                        )}

                        {onOpenChat ? (
                            <button
                                onClick={() => onOpenChat(owner)}
                                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs transition-colors shadow-sm"
                            >
                                <MessageSquare size={13} />
                                Chat
                            </button>
                        ) : (
                            <div className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 text-gray-400 font-bold text-xs border border-gray-100 cursor-not-allowed">
                                No Chat
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
