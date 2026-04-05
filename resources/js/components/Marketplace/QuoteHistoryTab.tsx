import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Clock, CheckCircle, ExternalLink, Package, MapPin, Building, ChevronRight, User, ShoppingBag, Plus, MessageSquare, CreditCard, Truck, Download, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function QuoteHistoryTab({ user }: { user?: any }) {
    const [quotes, setQuotes] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConverting, setIsConverting] = useState<number | null>(null);
    const [shippingCost, setShippingCost] = useState('0');
    const [totalWeight, setTotalWeight] = useState('');
    const [approvalNotes, setApprovalNotes] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('Supplier Fleet');
    const [showReceipt, setShowReceipt] = useState(false);
    const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const receiptRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    useEffect(() => {
        const fetchQuotes = async () => {
            try {
                const res = await axios.get('/material-quotes');
                setQuotes(res.data.data || []);
            } catch (err) {
                console.error('Failed to fetch quotes', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchQuotes();
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'awaiting_payment': return 'bg-orange-50 text-orange-600 border-orange-100';
            case 'paid': return 'bg-green-50 text-green-600 border-green-100';
            case 'approved': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
            case 'completed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const handleRequestPayment = async (quoteId: number) => {
        try {
            const res = await axios.put(`/material-quotes/${quoteId}/request-payment`, {
                shipping_cost: parseFloat(shippingCost),
                delivery_method: deliveryMethod,
                total_weight: totalWeight
            });
            if (res.data.success) {
                setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, ...res.data.data } : q));
                setNotification({ message: 'Tagihan ongkir telah dikirim ke pembeli.', type: 'success' });
            }
        } catch (err) {
            console.error('Failed to request payment', err);
            setNotification({ message: 'Gagal mengirim tagihan pembayaran.', type: 'error' });
        }
    };

    const handleDownloadReceipt = async (quoteId: number) => {
        if (!receiptRef.current) return;
        try {
            const canvas = await html2canvas(receiptRef.current, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Kwitansi_Order_${quoteId}.pdf`);
            setNotification({ message: 'Kwitansi berhasil diunduh sebagai PDF.', type: 'success' });
        } catch (error) {
            console.error('Failed to generate PDF', error);
            setNotification({ message: 'Gagal membuat file PDF.', type: 'error' });
        }
    };

    const handleMarkPaid = async (quoteId: number) => {
        try {
            const res = await axios.put(`/material-quotes/${quoteId}/mark-paid`);
            if (res.data.success) {
                setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: 'paid' } : q));
                setNotification({ message: 'Pembayaran dikonfirmasi! Pesanan siap diproses.', type: 'success' });
            }
        } catch (err) {
            console.error('Failed to mark paid', err);
            setNotification({ message: 'Gagal konfirmasi pembayaran.', type: 'error' });
        }
    };

    const handlePostDeliveryJob = async (quoteId: number) => {
        try {
            const res = await axios.post(`/material-quotes/${quoteId}/post-delivery-job`, {
                shipping_cost: parseFloat(shippingCost),
                total_weight: totalWeight,
                internal_notes: approvalNotes
            });
            if (res.data.success) {
                setNotification({ message: 'Delivery job posted. Searching for couriers...', type: 'success' });
                // We'll dispatch a custom event or callback to tell Dashboard to switch tab
                window.dispatchEvent(new CustomEvent('switchDashboardTab', { detail: 'delivery-jobs' }));
            }
        } catch (err) {
            console.error('Failed to post delivery job', err);
            setNotification({ message: 'Failed to post delivery job.', type: 'error' });
        }
    };

    const handleApprove = async (quoteId: number) => {
        try {
            const res = await axios.post(`/material-quotes/${quoteId}/approve`, {
                shipping_cost: parseFloat(shippingCost),
                notes: approvalNotes,
                delivery_method: deliveryMethod,
                total_weight: totalWeight
            });
            
            if (res.data.success) {
                setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: 'approved' } : q));
                setIsConverting(null);
                setShippingCost('0');
                setApprovalNotes('');
                setDeliveryMethod('Supplier Fleet');
                setNotification({ message: 'Pesanan formal telah dibuat! Cek di tab Material Orders.', type: 'success' });
            }
        } catch (err) {
            console.error('Failed to approve quote', err);
            setNotification({ message: 'Gagal membuat pesanan.', type: 'error' });
        }
    };

    const renderModalActions = (quote: any) => {
        if (['Supplier Fleet', 'Self Order Logistics', 'Hire Platform Courier'].includes(deliveryMethod)) {
            if (quote.status === 'pending') {
                return (
                    <button 
                        onClick={() => handleRequestPayment(quote.id)}
                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 px-6"
                    >
                        <CreditCard size={14} /> Set Info & Request Finalization
                    </button>
                );
            }
            if (quote.status === 'awaiting_payment') {
                const hasChanged = 
                    (totalWeight !== (quote.total_weight || '')) ||
                    (parseFloat(shippingCost || '0') !== parseFloat(quote.shipping_cost || '0')) ||
                    (deliveryMethod !== quote.delivery_method);

                if (hasChanged) {
                    return (
                        <button 
                            onClick={() => handleRequestPayment(quote.id)}
                            className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 px-6"
                        >
                            <CreditCard size={14} /> Update & Request Payment
                        </button>
                    );
                }

                if (!showReceipt) {
                    return (
                        <button 
                            onClick={() => setShowReceipt(true)}
                            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 px-6"
                        >
                            <FileText size={14} /> Lihat Rincian & Kwitansi
                        </button>
                    );
                }
                return (
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button 
                            onClick={() => handleDownloadReceipt(quote.id)}
                            className="inline-flex py-3 bg-gray-100 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-gray-200 transition-all active:scale-95 items-center justify-center gap-2 px-4"
                        >
                            <Download size={14} /> PDF
                        </button>
                        <button 
                            onClick={() => handleMarkPaid(quote.id)}
                            className="flex-1 py-3 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 px-6 whitespace-nowrap"
                        >
                            <CheckCircle size={14} /> Konfirmasi Pembayaran
                        </button>
                    </div>
                );
            }
            if (quote.status === 'paid') {
                return (
                    <button 
                        onClick={() => handleApprove(quote.id)}
                        className="flex-1 py-3 bg-[#FF2D20] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 px-6"
                    >
                        <Package size={14} /> Confirm & Generate Order
                    </button>
                );
            }
        }
        return null;
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF2D20]"></div>
                <p className="mt-4 text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Quote Records...</p>
            </div>
        );
    }

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full space-y-6"
        >
            {user?.role_type !== 'supplier' && (
                <div className="flex flex-col gap-2 mb-8">
                    <h3 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <FileText size={28} className="text-red-500" />
                        Procurement Records
                    </h3>
                    <p className="text-gray-500 font-medium">
                        History of all material quote requests initiated via WhatsApp.
                    </p>
                </div>
            )}

            {/* Notification Toast */}
            <AnimatePresence>
                {notification && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-full shadow-2xl flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest min-w-[300px] border ${
                            notification.type === 'success' 
                            ? 'bg-emerald-500 text-white border-emerald-400' 
                            : 'bg-red-500 text-white border-red-400'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            {notification.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            <span>{notification.message}</span>
                        </div>
                        <button onClick={() => setNotification(null)} className="opacity-60 hover:opacity-100 hover:rotate-90 transition-all p-1">
                            <Plus size={14} className="rotate-45" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {quotes.length === 0 ? (
                <div className="bg-white rounded-[2.5rem] p-16 text-center border border-gray-100 shadow-sm">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText size={32} className="text-gray-200" />
                    </div>
                    <h4 className="text-xl font-bold text-gray-900 mb-2">No quotes found</h4>
                    <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                        {user?.role_type === 'supplier' 
                            ? "You haven't received any quote requests from customers yet. They'll appear here once initiated via WhatsApp."
                            : "You haven't initiated any material quotes yet. Visit the Marketplace to start your procurement flow."}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {quotes.map((quote) => (
                        <div 
                            key={quote.id}
                            className="group bg-white rounded-3xl border border-gray-100 p-6 hover:shadow-xl hover:shadow-red-500/5 transition-all duration-300"
                        >
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(quote.status)}`}>
                                            {quote.status}
                                        </div>
                                        <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                                            {new Date(quote.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </span>
                                    </div>

                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 shrink-0">
                                            <Package size={24} />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                                                {user?.role_type === 'supplier' ? (
                                                    <>Quote for {quote.user?.name || quote.recipient_name || 'Customer'}</>
                                                ) : (
                                                    <>Quote from {quote.supplier?.store_name || 'Marketplace Supplier'}</>
                                                )}
                                                {quote.project && (
                                                    <span className="px-2 py-0.5 bg-red-50 text-[#FF2D20] rounded-md text-[10px] border border-red-100">
                                                        LINKED TO PROJECT
                                                    </span>
                                                )}
                                            </h4>
                                            <p className="text-sm text-gray-500 font-medium line-clamp-1 mt-1">
                                                {quote.items?.map((i: any) => `${i.qty}x ${i.name}`).join(', ')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-gray-50">
                                        <div className="flex items-center gap-3">
                                            <MapPin size={14} className="text-gray-400" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Delivery Site</span>
                                                <span className="text-xs font-bold text-gray-600 line-clamp-1">{quote.delivery_address || 'Personal Address'}</span>
                                                {quote.address_detail && (
                                                    <span className="text-[9px] font-bold text-gray-400 mt-0.5 line-clamp-1 italic">{quote.address_detail}</span>
                                                )}
                                            </div>
                                        </div>
                                        {quote.project && (
                                            <div className="flex items-center gap-3">
                                                <Building size={14} className="text-gray-400" />
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Project Name</span>
                                                    <span className="text-xs font-bold text-gray-600">{quote.project.title}</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-3">
                                            <User size={14} className="text-gray-400" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Recipient</span>
                                                <span className="text-xs font-bold text-gray-600">{quote.recipient_name || 'Owner'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Truck size={14} className="text-gray-400" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Delivery</span>
                                                <span className="text-xs font-bold text-gray-600">{quote.delivery_method || 'Supplier Fleet'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {quote.note && (
                                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 mt-4">
                                            <div className="flex items-start gap-3">
                                                <MessageSquare size={14} className="text-red-500 mt-1" />
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-[0.1em] mb-1">Order Notes / Instructions</span>
                                                    <p className="text-xs font-medium text-gray-700 italic leading-relaxed">
                                                        "{quote.note}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="lg:text-right flex lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-4">
                                    <div className="flex flex-col gap-2">
                                        <button 
                                            onClick={() => window.open(`https://wa.me/${quote.supplier_wa || quote.supplier?.no_telp}`, '_blank')}
                                            className="inline-flex items-center gap-2 px-6 py-3 bg-[#25D366] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg hover:shadow-green-500/20 transition-all active:scale-95 group/btn"
                                        >
                                            Reconnect on WA
                                            <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                                        </button>

                                         {user?.role_type === 'supplier' && quote.status !== 'approved' && (
                                            <button 
                                                onClick={() => {
                                                    setIsConverting(quote.id);
                                                    setShippingCost(quote.shipping_cost || '0');
                                                    setTotalWeight(quote.total_weight || '');
                                                    setDeliveryMethod(quote.delivery_method || 'Supplier Fleet');
                                                    setShowReceipt(false);
                                                }}
                                                className="inline-flex items-center gap-2 px-6 py-3 bg-[#FF2D20] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg hover:shadow-red-500/20 transition-all active:scale-95 group/btn"
                                            >
                                                Order Options & Fulfillment
                                                <ShoppingBag size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Conversion Modal Inline */}
                            <AnimatePresence>
                                {isConverting === quote.id && (
                                    <motion.div 
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-4 pt-4 border-t border-gray-100 overflow-hidden"
                                    >
                                        <div className="bg-red-50/20 rounded-2xl p-4 border border-red-100 relative">
                                            <h5 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">Finalize Quotation & Payments</h5>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                                                 {/* Left Column: Fulfillment Details */}
                                                 <div className="space-y-4">
                                                     {quote.status !== 'pending' && (
                                                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs font-bold text-gray-500 flex items-center gap-2">
                                                            <AlertCircle size={14} className="text-amber-500" />
                                                            Phase: {quote.status.toUpperCase()} ({deliveryMethod})
                                                        </div>
                                                     )}

                                                     <div className="space-y-1.5">
                                                         <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Requested Delivery Method</label>
                                                         <div className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-600">
                                                             {deliveryMethod === 'Supplier Fleet' ? 'Armada Toko (Supplier Fleet)' :
                                                              deliveryMethod === 'Self Order Logistics' ? 'Third-party (Self Order Gojek/Lalamove)' :
                                                              deliveryMethod === 'Hire Platform Courier' ? 'Platform Delivery (Sewa Kurir 4Ceria)' :
                                                              deliveryMethod === 'Customer Pickup' ? 'Customer Pickup (Ambil Sendiri)' :
                                                              deliveryMethod}
                                                         </div>
                                                     </div>
 
                                                     {deliveryMethod === 'Supplier Fleet' && (
                                                          <div className="space-y-1.5">
                                                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Shipping Cost (Rp)</label>
                                                              <div className="flex items-center gap-2 bg-white border border-red-200 rounded-xl px-3 py-1.5 shadow-sm focus-within:ring-2 ring-red-500/20 transition-all text-xs">
                                                                  <span className="text-gray-400 font-bold">Rp</span>
                                                                  <input 
                                                                      type="number" 
                                                                      value={shippingCost}
                                                                      disabled={quote.status !== 'pending' && quote.status !== 'awaiting_payment'}
                                                                      onChange={(e) => { setShippingCost(e.target.value); setShowReceipt(false); }}
                                                                      className="bg-transparent border-none outline-none font-bold text-gray-900 w-full disabled:opacity-50 text-xs"
                                                                  />
                                                              </div>
                                                          </div>
                                                     )}
                                                     
                                                     {deliveryMethod === 'Hire Platform Courier' && (
                                                          <div className="space-y-1.5">
                                                              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Shipping Cost (Rp)</label>
                                                              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                                                                  <p className="text-[10px] font-bold text-indigo-500 italic leading-snug">
                                                                      The exact shipping fee will be automatically calculated by the System via GPS Distance Matrix when approved.
                                                                  </p>
                                                              </div>
                                                          </div>
                                                     )}

                                                     <div className="space-y-1.5">
                                                         <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Estimated Weight (kg)</label>
                                                         <div className="flex items-center gap-2 bg-white border border-red-200 rounded-xl px-3 py-1.5 shadow-sm focus-within:ring-2 ring-red-500/20 transition-all text-xs">
                                                              <input 
                                                                  type="text" 
                                                                  placeholder="e.g. 500kg or 0.5 Ton"
                                                                  value={totalWeight}
                                                                  onChange={(e) => { setTotalWeight(e.target.value); setShowReceipt(false); }}
                                                                  className="bg-transparent border-none outline-none font-bold text-gray-900 w-full text-xs"
                                                              />
                                                         </div>
                                                     </div>

                                                     <div className="space-y-1.5">
                                                         <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Internal Order Notes</label>
                                                         <textarea 
                                                             placeholder="Add driver info, estimated arrival, or other internal notes..."
                                                             value={approvalNotes}
                                                             onChange={(e) => setApprovalNotes(e.target.value)}
                                                             className="w-full px-4 py-2 bg-white border border-red-200 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-red-500/20 transition-all text-gray-900 min-h-[60px] resize-none placeholder:text-gray-300"
                                                         />
                                                     </div>
                                                 </div>
 
                                                 {/* Right Column: Receipt Preview */}
                                                 <div className="relative">
                                                     {showReceipt ? (
                                                        <div className="animate-in slide-in-from-right duration-300">
                                                            {/* Ref Target for HTML2Canvas */}
                                                            <div ref={receiptRef} className="bg-white border text-gray-900 border-gray-100 rounded-xl p-4 md:p-6 relative shadow-sm overflow-hidden h-fit">
                                                                {/* Professional Receipt UI */}
                                                                <div className="flex justify-between items-start mb-6 pb-4 border-b border-gray-100">
                                                                    <div className="space-y-0.5">
                                                                        <h6 className="text-xl font-black text-gray-900 tracking-tighter uppercase leading-none">INVOICE / RECEIPT</h6>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none">REF. #{quote.id}-{Math.floor(Date.now() / 100000)}</p>
                                                                            {totalWeight && (
                                                                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[8px] font-black border border-gray-200">
                                                                                    {totalWeight} KG
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-[8px] font-medium text-gray-400 mt-1">Diterbitkan: {new Date().toLocaleDateString('id-ID', { dateStyle: 'medium' })}</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <h6 className="font-black text-indigo-700 text-sm uppercase leading-none">{quote.supplier?.store_name}</h6>
                                                                        <p className="text-[8px] font-bold text-gray-400 tracking-widest mt-0.5 whitespace-nowrap">OFFICIAL SUPPLIER MATERIAL</p>
                                                                        <div className="mt-2 text-[10px] font-medium text-gray-500 max-w-[150px] leading-tight text-right ml-auto">
                                                                            <span className="font-bold">Dikirim ke:</span> {quote.recipient_name || 'Owner'}<br/>
                                                                            {quote.delivery_address || 'Personal Address'}
                                                                            {quote.address_detail && <><br/><span className="italic">{quote.address_detail}</span></>}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-1.5 mb-4">
                                                                    <div className="grid grid-cols-12 border-b border-gray-900 pb-1 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                                        <div className="col-span-7">Item Description</div>
                                                                        <div className="col-span-2 text-center">QTY</div>
                                                                        <div className="col-span-3 text-right">Amount</div>
                                                                    </div>
                                                                    {quote.items?.map((item: any, idx: number) => (
                                                                        <div key={idx} className="grid grid-cols-12 text-xs font-bold text-gray-800 py-1 border-b border-gray-50">
                                                                            <div className="col-span-7 uppercase">{item.name}</div>
                                                                            <div className="col-span-2 text-center text-gray-500">{item.qty} {item.unit}</div>
                                                                            <div className="col-span-3 text-right font-mono self-end">
                                                                                Rp {new Intl.NumberFormat('id-ID').format(item.price_at_quote * item.qty)}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                <div className="space-y-1 pt-2 w-full max-w-xs ml-auto">
                                                                    <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                                                        <span>Subtotal Material</span>
                                                                        <span className="font-mono">Rp {new Intl.NumberFormat('id-ID').format(quote.total_amount)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                                                        <span>{deliveryMethod === 'Supplier Fleet' ? 'Ongkos Kirim Armada' : 'Biaya Kirim (oleh Pembeli)'}</span>
                                                                        <span className="font-mono">
                                                                            {(deliveryMethod === 'Self Order Logistics' || deliveryMethod === 'Hire Platform Courier') 
                                                                                ? <span className="text-emerald-600">DIBAYAR KE KURIR</span>
                                                                                : `Rp ${new Intl.NumberFormat('id-ID').format(parseFloat(shippingCost || '0'))}`
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center py-2 border-t border-b border-gray-900 mt-2">
                                                                        <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Grand Total</span>
                                                                        <span className="text-xl font-black text-indigo-700 tracking-tighter font-mono">
                                                                            Rp {new Intl.NumberFormat('id-ID').format(Number(quote.total_amount) + ((deliveryMethod === 'Self Order Logistics' || deliveryMethod === 'Hire Platform Courier') ? 0 : parseFloat(shippingCost || '0')))}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <div className="mt-4 flex justify-between items-end">
                                                                    <div className="px-3 py-1 bg-amber-50 rounded-lg border border-amber-100 text-[8px] font-black text-amber-600 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                                                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                                                                        {quote.status === 'paid' ? 'LUNAS / SIAP PROSES' : 'Menunggu Konfirmasi Pembayaran'}
                                                                    </div>
                                                                    {deliveryMethod === 'Self Order Logistics' && (
                                                                        <p className="text-[7px] font-bold text-gray-400 uppercase text-right max-w-[150px]">
                                                                            *Pembeli bertanggung jawab untuk booking & bayar kurir pihak ketiga sesuai dengan total berat di atas.
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-full min-h-[200px] flex items-center justify-center border-2 border-dashed border-red-100 rounded-xl bg-red-50/10 p-8 text-center">
                                                            <div className="space-y-3">
                                                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                                                                    <FileText size={24} className="text-red-200" />
                                                                </div>
                                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest max-w-[150px] mx-auto">
                                                                    Receipt preview will appear here once requested and finalized.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                 </div>
                                            </div>

                                            {/* Unified Bottom Action Footer */}
                                            <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md px-6 py-4 rounded-b-2xl border-t border-gray-200 flex items-center justify-between gap-4 z-20">
                                                <div className="flex items-center gap-3">
                                                    {renderModalActions(quote)}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {showReceipt && (
                                                        <button 
                                                            onClick={() => setShowReceipt(false)}
                                                            className="px-4 py-2.5 bg-white border border-gray-200 text-gray-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all font-mono"
                                                        >
                                                            Hide Receipt
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => setIsConverting(null)}
                                                        className="px-6 py-2.5 bg-white border border-red-200 text-red-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-50 transition-all font-mono"
                                                    >
                                                        Close Modals
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
