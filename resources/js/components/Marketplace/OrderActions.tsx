import React, { useState } from 'react';
import { Box, Truck, CheckCircle2, Star, Upload, ShieldCheck, XCircle } from 'lucide-react';
import axios from 'axios';

interface ActionButtonProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    color: string;
}

const ActionButton = ({ icon, label, onClick, disabled, color }: ActionButtonProps) => (
    <button 
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`w-full py-4 ${color} text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50`}
    >
        {icon} {label}
    </button>
);

interface SupplierActionsProps {
    order: any;
    isUpdating: boolean;
    updateOrderStatus: (id: number, status: string, file?: File) => void;
    onReview: (order: any) => void;
    docFile?: File;
    onRefresh?: () => void;
}

export const SupplierActions = ({ order, isUpdating, updateOrderStatus, onReview, docFile, onRefresh }: SupplierActionsProps) => {
    const [verifyBusy, setVerifyBusy] = useState(false);

    // Verify the buyer's uploaded transfer receipt — the escrow-style
    // confirmation step the marketplace docs always promised.
    const handleVerifyPayment = async () => {
        setVerifyBusy(true);
        try {
            await axios.post(`/material-orders/${order.id}/verify-payment`);
            onRefresh?.();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to verify payment.');
        } finally {
            setVerifyBusy(false);
        }
    };

    if (order.payment_proof_path && !['paid', 'shipping', 'delivered', 'completed'].includes(order.status)) {
        return (
            <div className="w-full space-y-2">
                <a
                    href={`/storage/${order.payment_proof_path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-center py-2.5 border border-indigo-100 bg-indigo-50/50 text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                >
                    Lihat Bukti Transfer
                </a>
                <button
                    onClick={handleVerifyPayment}
                    disabled={verifyBusy}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    <ShieldCheck size={14} /> {verifyBusy ? 'Memverifikasi...' : 'Verifikasi Pembayaran'}
                </button>
            </div>
        );
    }

    if (order.status === 'pending') {
        return (
            <ActionButton 
                icon={<Box size={14} />} 
                label="Start Packing" 
                onClick={() => updateOrderStatus(order.id, 'processing')} 
                disabled={isUpdating} 
                color="bg-gray-900" 
            />
        );
    }
    
    if (order.status === 'processing') {
        const isPlatform = order.delivery_method === 'Hire Platform Courier';
        return (
            <ActionButton 
                icon={<Truck size={14} />} 
                label={isPlatform ? "Complete Preparation" : "Dispatch Armada"} 
                onClick={() => updateOrderStatus(order.id, isPlatform ? 'ready_for_pickup' : 'shipping', docFile)} 
                disabled={isUpdating} 
                color="bg-indigo-600" 
            />
        );
    }

    if (order.status === 'shipping' && order.delivery_method !== 'Hire Platform Courier') {
        return (
            <ActionButton 
                icon={<CheckCircle2 size={14} />} 
                label="Confirm Delivered" 
                onClick={() => updateOrderStatus(order.id, 'delivered')} 
                disabled={isUpdating} 
                color="bg-green-600" 
            />
        );
    }

    if (order.review) {
        return (
            <ActionButton 
                icon={<Star size={14} className="fill-amber-400 text-amber-400" />} 
                label={`Ulasan Pembeli (${order.review.rating} ⭐)`} 
                onClick={() => onReview(order)} 
                disabled={false} 
                color="bg-indigo-600" 
            />
        );
    }
    
    return null;
};

interface BuyerActionsProps {
    order: any;
    isUpdating: boolean;
    updateOrderStatus: (id: number, status: string) => void;
    onReview: (order: any) => void;
    onRefresh?: () => void;
}

export const BuyerActions = ({ order, isUpdating, updateOrderStatus, onReview, onRefresh }: BuyerActionsProps) => {
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [proofBusy, setProofBusy] = useState(false);
    const [cancelBusy, setCancelBusy] = useState(false);

    // Payment proof flow (replaces the honor-system self-marking):
    // buyer uploads a transfer receipt; the supplier verifies it.
    const handleUploadProof = async () => {
        if (!proofFile) return;
        setProofBusy(true);
        try {
            const fd = new FormData();
            fd.append('payment_proof', proofFile);
            await axios.post(`/material-orders/${order.id}/payment-proof`, fd);
            setProofFile(null);
            onRefresh?.();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to upload payment proof.');
        } finally {
            setProofBusy(false);
        }
    };

    const handleCancelOrder = async () => {
        if (!window.confirm('Cancel this order?')) return;
        setCancelBusy(true);
        try {
            await axios.put(`/material-orders/${order.id}`, { status: 'cancelled', _method: 'PUT' } as any, { headers: { 'Content-Type': 'application/json' } });
            onRefresh?.();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to cancel order.');
        } finally {
            setCancelBusy(false);
        }
    };

    if ((order.status === 'pending' || order.status === 'awaiting_payment') && !order.payment_proof_path) {
        return (
            <div className="w-full space-y-2">
                <div className="flex items-center gap-3 bg-amber-50/60 border border-amber-100 rounded-2xl p-3">
                    <label className="flex-1 flex flex-col items-center justify-center py-3 border-2 border-dashed border-amber-200 rounded-xl cursor-pointer hover:bg-amber-50 transition-all">
                        <input
                            type="file"
                            className="hidden"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                        />
                        <Upload size={16} className="text-amber-500" />
                        <span className="text-[9px] font-black text-amber-600 mt-1 uppercase tracking-widest">
                            {proofFile ? proofFile.name.substring(0, 24) : 'Pilih Bukti Transfer'}
                        </span>
                    </label>
                    <button
                        onClick={handleUploadProof}
                        disabled={!proofFile || proofBusy}
                        className="px-5 self-stretch bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
                    >
                        {proofBusy ? 'Mengunggah...' : 'Kirim'}
                    </button>
                </div>
                <button
                    onClick={handleCancelOrder}
                    disabled={cancelBusy}
                    className="w-full py-2.5 border border-red-100 text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                    <XCircle size={13} /> {cancelBusy ? 'Membatalkan...' : 'Batalkan Pesanan'}
                </button>
            </div>
        );
    }

    if ((order.status === 'pending' || order.status === 'awaiting_payment') && order.payment_proof_path) {
        return (
            <div className="w-full py-4 bg-blue-50 border border-blue-100 text-blue-700 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-center">
                Bukti Terkirim — Menunggu Verifikasi Toko
            </div>
        );
    }

    if (order.status === 'delivered') {
        return (
            <ActionButton 
                icon={<CheckCircle2 size={14} />} 
                label="Pesanan Diterima & Selesai" 
                onClick={() => updateOrderStatus(order.id, 'completed',)} 
                disabled={isUpdating} 
                color="bg-green-600" 
            />
        );
    }

    if (order.status === 'completed' && !order.review) {
        return (
            <ActionButton 
                icon={<Star size={14} className="fill-white" />} 
                label="Beri Ulasan Toko" 
                onClick={() => onReview(order)} 
                disabled={false} 
                color="bg-indigo-600" 
            />
        );
    }

    if (order.review) {
        return (
            <ActionButton 
                icon={<Star size={14} className="fill-amber-400 text-amber-400" />} 
                label={`Lihat Ulasan (${order.review.rating} ⭐)`} 
                onClick={() => onReview(order)} 
                disabled={false} 
                color="bg-gray-900" 
            />
        );
    }
    
    return null;
};
