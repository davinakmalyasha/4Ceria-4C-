import React from 'react';
import { Box, Truck, CheckCircle2, Star } from 'lucide-react';

interface ActionButtonProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    color: string;
}

export const ActionButton = ({ icon, label, onClick, disabled, color }: ActionButtonProps) => (
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
}

export const SupplierActions = ({ order, isUpdating, updateOrderStatus, onReview, docFile }: SupplierActionsProps) => {
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
}

export const BuyerActions = ({ order, isUpdating, updateOrderStatus, onReview }: BuyerActionsProps) => {
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
