import React, { createContext, useContext, useState, useEffect } from 'react';

interface CartItem {
    id: number;
    material_id: number;
    name: string;
    price: number;
    qty: number;
    unit: string;
    image_path?: string;
    supplier_id: number;
    supplier_name?: string;
    supplier_wa?: string;
    supplier_phone?: string;
}

interface CartContextType {
    items: CartItem[];
    addItem: (material: any, qty?: number) => void;
    removeItem: (materialId: number) => void;
    updateQuantity: (materialId: number, qty: number) => void;
    clearCart: () => void;
    itemCount: number;
    totalAmount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);

    const addItem = (material: any, qty: number = 1) => {
        setItems(prev => {
            const materialId = material.id || material.material_id;
            const existing = prev.find(i => i.material_id === materialId);
            
            if (existing) {
                return prev.map(i => i.material_id === materialId ? { ...i, qty: i.qty + qty } : i);
            }

            return [...prev, {
                id: materialId,
                material_id: materialId,
                name: material.name,
                price: parseFloat(material.price),
                qty: qty,
                unit: material.unit,
                image_path: material.images?.[0]?.image_path || material.image_path,
                supplier_id: material.supplier_id || material.supplier?.id,
                supplier_name: material.supplier?.store_name,
                supplier_wa: material.supplier?.no_telp || '628', 
                supplier_phone: material.supplier?.no_telp
            }];
        });
    };

    const removeItem = (materialId: number) => {
        setItems(prev => prev.filter(i => i.material_id !== materialId));
    };

    const updateQuantity = (materialId: number, qty: number) => {
        if (qty < 1) return;
        setItems(prev => prev.map(i => i.material_id === materialId ? { ...i, qty } : i));
    };

    const clearCart = () => setItems([]);

    const itemCount = items.reduce((acc, i) => acc + i.qty, 0);
    const totalAmount = items.reduce((acc, i) => acc + (i.price * i.qty), 0);

    return (
        <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, itemCount, totalAmount }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
