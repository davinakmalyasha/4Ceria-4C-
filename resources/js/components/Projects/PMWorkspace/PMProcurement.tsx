import React from 'react';
import { Box, ShoppingCart, Truck, CheckCircle, Package } from 'lucide-react';

interface PMProcurementProps {
    project: any;
    user: any;
}

export default function PMProcurement({ project, user }: PMProcurementProps) {
    const isPM = project.pm_id === user?.id;
    const materialOrders = project.material_orders || [];

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Supply Chain & Logistics</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Material Procurement & Vendor Management</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <button className="px-6 py-3 bg-gray-900 text-white hover:bg-black rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-gray-200">
                        Log Manual Order
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 text-emerald-500 rounded-xl">
                                <ShoppingCart size={20} />
                            </div>
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Analytics</h4>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Total Orders</p>
                                <p className="text-2xl font-black text-gray-900">{materialOrders.length}</p>
                            </div>
                            <div className="h-px bg-gray-50" />
                            <div>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Items Procured</p>
                                <p className="text-lg font-black text-gray-900">0</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-600 p-8 rounded-[2rem] text-white shadow-xl shadow-blue-100">
                        <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-4">Vendor Health</h4>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                                <CheckCircle size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-black">All Vendors Verified</p>
                                <p className="text-[10px] opacity-60">Ready for procurement</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-3 space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Order Ledger</h3>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 tracking-widest bg-gray-50 px-3 py-1 rounded-lg">
                            <Truck size={12} />
                            ONGOING SHIPMENTS: 0
                        </div>
                    </div>

                    {materialOrders.length === 0 ? (
                        <div className="bg-white rounded-[2.5rem] p-20 text-center border border-gray-100 shadow-sm">
                            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-gray-300">
                                <Package size={32} />
                            </div>
                            <p className="text-gray-500 font-black text-sm uppercase tracking-tight">Empty Ledger</p>
                            <p className="text-gray-400 text-xs mt-1">PM has not logged any material procurement transactions yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Material orders map would go here */}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
