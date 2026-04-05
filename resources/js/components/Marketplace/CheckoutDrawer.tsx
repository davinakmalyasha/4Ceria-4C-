import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, MapPin, Building2, User, ChevronRight, MessageSquare, Trash2, Plus, Minus, Loader2, Link as LinkIcon, ExternalLink, Map as MapIcon, CheckCircle, FileText, Truck } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import LocationPickerMap, { ReverseGeoData } from '../LocationPickerMap';

interface CheckoutDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onViewQuotes?: () => void;
}

export default function CheckoutDrawer({ isOpen, onClose, onViewQuotes }: CheckoutDrawerProps) {
    const { items, removeItem, updateQuantity, totalAmount, clearCart } = useCart();
    const [checkoutMode, setCheckoutMode] = useState<'project' | 'personal'>('project');
    const [projects, setProjects] = useState<any[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [personalAddress, setPersonalAddress] = useState('');
    const [addressDetail, setAddressDetail] = useState('');
    const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
    const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);
    const [orderNote, setOrderNote] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('Supplier Fleet');
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            // Reset success state when drawer is hidden
            setTimeout(() => setIsSuccess(false), 500);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && checkoutMode === 'project') {
            fetchProjects();
        }
    }, [isOpen, checkoutMode]);

    const fetchProjects = async () => {
        setIsLoadingProjects(true);
        try {
            const res = await axios.get('/projects'); 
            setProjects(res.data.data || []);
        } catch (err) {
            console.error('Failed to fetch projects', err);
        } finally {
            setIsLoadingProjects(false);
        }
    };

    const handleLocationChange = (lat: number, lng: number, geoData?: ReverseGeoData) => {
        setDeliveryLat(lat);
        setDeliveryLng(lng);
        if (geoData) {
            const parts = [
                geoData.street_name,
                geoData.kecamatan,
                geoData.city,
                geoData.province
            ].filter(Boolean);
            setPersonalAddress(parts.join(', '));
        }
    };

    const handleCheckout = async () => {
        if (items.length === 0) return;
        
        let deliveryAddress = '';
        let projectTitle = '';
        let contractorName = '';
        let selectedProjectObj = null;

        if (checkoutMode === 'project') {
            if (!selectedProjectId) {
                alert('Please select a project first.');
                return;
            }
            selectedProjectObj = projects.find(p => String(p.id) === String(selectedProjectId));
            const addressParts = [
                selectedProjectObj?.street_name,
                selectedProjectObj?.kelurahan,
                selectedProjectObj?.kecamatan,
                selectedProjectObj?.city,
                selectedProjectObj?.province
            ].filter(Boolean);
            
            // If we have detailed parts, use them. Otherwise fallback to the project's 'location' string.
            deliveryAddress = addressParts.length > 0 
                ? addressParts.join(', ') 
                : (selectedProjectObj?.location || 'Project Site');
            
            projectTitle = selectedProjectObj?.title;
            // The project resource should return the contractor info if it's there
            contractorName = selectedProjectObj?.kontraktor?.user?.name || selectedProjectObj?.kontraktor?.nama || 'My Team';
        } else {
            if (!personalAddress) {
                alert('Please enter a delivery address.');
                return;
            }
            deliveryAddress = personalAddress;
        }

        if (!deliveryAddress.trim()) {
            alert('Silakan isi alamat pengiriman terlebih dahulu.');
            return;
        }

        setIsSubmitting(true);
        try {
            const mainSupplierId = items[0].supplier_id;
            const baseNote = checkoutMode === 'project' ? `For project: ${projectTitle}` : 'Personal Order';
            const finalNote = orderNote ? `${baseNote} | Note: ${orderNote}` : baseNote;
            const supplierId = items[0].supplier_id;

            const payload = {
                supplier_id: mainSupplierId,
                project_id: checkoutMode === 'project' ? selectedProjectId : null,
                items: items.map(item => ({
                    material_id: item.material_id || item.id,
                    name: item.name,
                    price_at_quote: item.price,
                    qty: item.qty,
                    unit: item.unit
                })),
                delivery_address: deliveryAddress,
                address_detail: addressDetail,
                delivery_method: deliveryMethod,
                note: finalNote,
                latitude: checkoutMode === 'project' ? (selectedProjectObj?.latitude || null) : deliveryLat,
                longitude: checkoutMode === 'project' ? (selectedProjectObj?.longitude || null) : deliveryLng,
            };

            console.log('Checkout payload:', JSON.stringify(payload, null, 2));

            // 2. Save to Platform Database
            await axios.post('/material-quotes', payload);

            // 3. Construct WhatsApp Message (Indonesian, Clean, with Deep-Link)
            const materialList = items.map(i => {
                const priceFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(i.price);
                const subtotalFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(i.price * i.qty);
                return `Material: ${i.name}%0A      ${i.qty} ${i.unit} x ${priceFormatted}%0A      Subtotal: ${subtotalFormatted}`;
            }).join('%0A%0A');
            
            const totalStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalAmount);
            const dashboardLink = `${window.location.origin}/dashboard?tab=quotes`;
            
            let message = `Halo! Saya ingin meminta penawaran (quote) untuk material berikut melalui platform 4Ceria:%0A%0A`;
            message += `-----------------------------------%0A`;
            message += `${materialList}%0A`;
            message += `-----------------------------------%0A`;
            message += `Estimasi Total di Platform:%0A*${totalStr}*%0A%0A`;
            
            message += `Alamat Pengiriman:%0A${deliveryAddress}%0A%0A`;
            message += `Metode Pengiriman:%0A${deliveryMethod}%0A%0A`;
            
            if (orderNote) {
                message += `Catatan Tambahan:%0A${orderNote}%0A%0A`;
            }

            if (addressDetail) {
                message += `Detail Alamat (Blok/No/Lantai):%0A${addressDetail}%0A%0A`;
            }

            // Map links (Indonesian Labels)
            if (checkoutMode === 'personal' && deliveryLat && deliveryLng) {
                message += `Link Lokasi (Maps):%0Ahttps://www.google.com/maps?q=${deliveryLat},${deliveryLng}%0A%0A`;
            } else if (checkoutMode === 'project' && selectedProjectObj?.latitude && selectedProjectObj?.longitude) {
                message += `Link Lokasi Proyek (Maps):%0Ahttps://www.google.com/maps?q=${selectedProjectObj.latitude},${selectedProjectObj.longitude}%0A%0A`;
            }

            if (checkoutMode === 'project') {
                message += `Proyek: ${projectTitle}%0A`;
                message += `Kontraktor: ${contractorName}%0A%0A`;
            }

            message += `Kelola permintaan ini di Dashboard Supplier:%0A${dashboardLink}%0A%0A`;
            message += `Mohon konfirmasi ketersediaan dan biaya pengiriman. Terima kasih!`;

            // 4. Open WhatsApp
            const waUrl = `https://wa.me/${items[0].supplier_wa || '628'}?text=${message}`;
            window.open(waUrl, '_blank');
            
            setIsSuccess(true);
            clearCart();
            // We no longer call onClose() here, as the Success View will show up
        } catch (err: any) {
            console.error('Checkout failed:', err);
            console.error('Response data:', err.response?.data);
            console.error('Response status:', err.response?.status);
            
            let errorMsg = 'Failed to process your request.';
            if (err.response?.data?.errors) {
                // Laravel validation errors
                errorMsg = Object.values(err.response.data.errors).flat().join('\n');
            } else if (err.response?.data?.message) {
                // Laravel exception message
                errorMsg = err.response.data.message;
            } else if (err.response?.status) {
                errorMsg = `Server Error (${err.response.status}): ${err.response.statusText}`;
            } else if (err.message) {
                errorMsg = err.message;
            }
            alert(`Checkout Error:\n${errorMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100]"
                    />
                    <motion.div 
                        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[101] flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-red-50 text-red-500 rounded-2xl">
                                    <ShoppingCart size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Your Quote Selection</h3>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">{items.length} items ready</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-xl transition-colors">
                                <X size={24} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar relative">
                            {isSuccess ? (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="h-full flex flex-col items-center justify-center text-center space-y-8 py-12"
                                >
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-green-100/50 blur-3xl rounded-full scale-110" />
                                        <div className="relative w-24 h-24 bg-green-500 text-white rounded-[2.5rem] flex items-center justify-center shadow-xl shadow-green-500/20">
                                            <CheckCircle size={48} className="animate-bounce" />
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h3 className="text-3xl font-black text-gray-900 tracking-tight">Quote Requested!</h3>
                                        <p className="text-gray-500 font-medium max-w-[280px] mx-auto leading-relaxed italic">
                                            We've opened WhatsApp for you to connect with the supplier. Your request is now recorded.
                                        </p>
                                    </div>

                                    <div className="w-full flex flex-col gap-3 pt-6">
                                        <button 
                                            onClick={onViewQuotes}
                                            className="w-full bg-gray-900 text-white py-5 rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-3 group"
                                        >
                                            <FileText size={18} className="group-hover:scale-110 transition-transform" />
                                            View Quote History
                                        </button>
                                        <button 
                                            onClick={onClose}
                                            className="w-full bg-white text-gray-500 py-5 rounded-3xl font-black text-sm uppercase tracking-widest border border-gray-100 hover:bg-gray-50 transition-all"
                                        >
                                            Continue Browsing
                                        </button>
                                    </div>

                                    <div className="pt-8 opacity-40">
                                        <img src="/logo-long.png" className="h-6 grayscale mx-auto" />
                                    </div>
                                </motion.div>
                            ) : items.length > 0 ? (
                                <>
                                    {/* Items List */}
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Summary of Materials</h4>
                                        {items.map(item => (
                                            <div key={item.material_id} className="flex items-center gap-4 bg-gray-50 p-4 rounded-3xl group relative">
                                                <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center overflow-hidden border border-gray-100 shadow-sm flex-shrink-0">
                                                    {item.image_path ? (
                                                        <img src={`/storage/${item.image_path}`} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <ShoppingCart size={24} className="text-gray-200" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <h5 className="font-bold text-gray-900 text-sm line-clamp-1">{item.name}</h5>
                                                    <p className="text-xs text-gray-400 font-medium">Rp {item.price.toLocaleString()} / {item.unit}</p>
                                                    <div className="flex items-center gap-3 mt-2">
                                                        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
                                                            <button onClick={() => updateQuantity(item.material_id, item.qty - 1)} className="p-1 hover:bg-gray-50 text-gray-400 rounded-lg"><Minus size={12} /></button>
                                                            <span className="w-8 text-center text-xs font-black text-gray-900">{item.qty}</span>
                                                            <button onClick={() => updateQuantity(item.material_id, item.qty + 1)} className="p-1 hover:bg-gray-50 text-gray-400 rounded-lg"><Plus size={12} /></button>
                                                        </div>
                                                        <button onClick={() => removeItem(item.material_id)} className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:text-red-600 transition-colors">Remove</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Destination Selection */}
                                    <div className="space-y-6">
                                        <div className="flex flex-col gap-2">
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Where should we deliver?</h4>
                                            <div className="flex p-1 bg-gray-100 rounded-2xl">
                                                <button 
                                                    onClick={() => setCheckoutMode('project')}
                                                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${checkoutMode === 'project' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    Project Site
                                                </button>
                                                <button 
                                                    onClick={() => setCheckoutMode('personal')}
                                                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${checkoutMode === 'personal' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    Personal Needs
                                                </button>
                                            </div>
                                        </div>

                                        {checkoutMode === 'project' ? (
                                            <div className="space-y-4">
                                                <div className="relative">
                                                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                                    <select 
                                                        value={selectedProjectId}
                                                        onChange={(e) => setSelectedProjectId(e.target.value)}
                                                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold appearance-none outline-none focus:ring-4 focus:border-red-500 focus:ring-red-500/5 transition-all text-gray-900"
                                                    >
                                                        <option value="">Select an Active Project...</option>
                                                        {projects.map(p => (
                                                            <option key={p.id} value={p.id}>{p.title}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {isLoadingProjects && <p className="text-[10px] font-bold text-gray-400 animate-pulse uppercase tracking-widest">Loading your project sites...</p>}
                                                {selectedProjectId && projects.find(p => String(p.id) === String(selectedProjectId)) && (
                                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-red-50/50 rounded-3xl border border-red-100 space-y-3">
                                                        <div className="flex items-start gap-3">
                                                            <MapPin size={16} className="text-red-500 mt-0.5" />
                                                            <div>
                                                                <span className="block text-[8px] font-black text-red-400 uppercase tracking-widest mb-1">Delivery Address</span>
                                                                <p className="text-xs font-bold text-gray-900 leading-relaxed">
                                                                    {(() => {
                                                                        const p = projects.find(proj => String(proj.id) === String(selectedProjectId));
                                                                        if (!p) return 'Project Site';
                                                                        const parts = [p.street_name, p.kelurahan, p.kecamatan, p.city, p.province].filter(Boolean);
                                                                        return parts.length > 0 ? parts.join(', ') : (p.location || 'Project Site');
                                                                    })()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <User size={16} className="text-red-500" />
                                                            <div>
                                                                <span className="block text-[8px] font-black text-red-400 uppercase tracking-widest mb-1">Assigned Professional</span>
                                                                <p className="text-xs font-bold text-gray-900">
                                                                    {projects.find(p => String(p.id) === String(selectedProjectId))?.kontraktor?.user?.name || 'Contractor Team'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
                                                        <MapIcon size={12} />
                                                        Pin Delivery Location
                                                    </label>
                                                    <LocationPickerMap 
                                                        latitude={deliveryLat || -6.1751} 
                                                        longitude={deliveryLng || 106.8271} 
                                                        onChange={handleLocationChange} 
                                                    />
                                                </div>

                                                <div className="relative">
                                                    <MapPin className="absolute left-4 top-4 text-gray-400" size={18} />
                                                    <textarea 
                                                        placeholder="Full drop-off address for this order..."
                                                        value={personalAddress}
                                                        onChange={(e) => setPersonalAddress(e.target.value)}
                                                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:border-red-500 focus:ring-red-500/5 transition-all text-gray-900 min-h-[100px] resize-none"
                                                    />
                                                    <p className="mt-2 text-[10px] text-gray-400 font-medium italic">Selecting a location on the map will automatically fill this address.</p>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
                                                        Detail Alamat (No. Rumah/Blok/Lantai)
                                                    </label>
                                                    <textarea 
                                                        placeholder="e.g. Blok B No. 7, Pagar Hijau, Dekat Masjid..."
                                                        value={addressDetail}
                                                        onChange={(e) => setAddressDetail(e.target.value)}
                                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:border-red-500 focus:ring-red-500/5 transition-all text-gray-900 min-h-[80px] resize-none"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* Delivery Method Selection */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <Truck size={12} className="text-red-500" />
                                                Metode Pengiriman
                                            </label>
                                            <select 
                                                value={deliveryMethod}
                                                onChange={(e) => setDeliveryMethod(e.target.value)}
                                                className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:border-red-500 focus:ring-red-500/5 transition-all text-gray-900 appearance-none"
                                            >
                                                <option value="Supplier Fleet">Armada Toko (Supplier Fleet)</option>
                                                <option value="Self Order Logistics">Third-party (Self Order Gojek/Lalamove)</option>
                                                <option value="Hire Platform Courier">Platform Delivery (Sewa Kurir 4Ceria)</option>
                                                <option value="Customer Pickup">Customer Pickup (Ambil Sendiri)</option>
                                            </select>
                                        </div>

                                        {/* Order Notes Field */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <MessageSquare size={12} className="text-red-500" />
                                                Order Notes (Optional)
                                            </label>
                                            <textarea 
                                                placeholder="Any special instructions or questions for the supplier? (e.g. urgent delivery, specific gate instructions)"
                                                value={orderNote}
                                                onChange={(e) => setOrderNote(e.target.value)}
                                                className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:border-red-500 focus:ring-red-500/5 transition-all text-gray-900 min-h-[100px] resize-none"
                                            />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                        <ShoppingCart size={32} className="text-gray-200" />
                                    </div>
                                    <h4 className="text-lg font-bold text-gray-900 mb-2">Selection is empty</h4>
                                    <p className="text-sm text-gray-500 max-w-[240px] mx-auto font-medium">Browse the marketplace and add construction materials to your quote request.</p>
                                    <button onClick={onClose} className="mt-8 px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all text-xs tracking-widest uppercase">Start Browsing</button>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {items.length > 0 && !isSuccess && (
                            <div className="p-8 border-t border-gray-100 bg-white space-y-6">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Quote Estimate</span>
                                    <span className="text-2xl font-black text-gray-900">
                                        {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalAmount)}
                                    </span>
                                </div>
                                <button
                                    onClick={handleCheckout}
                                    disabled={isSubmitting}
                                    className="w-full bg-[#FF2D20] text-white py-5 rounded-3xl font-black text-sm uppercase tracking-[0.1em] shadow-xl shadow-red-500/20 hover:shadow-2xl hover:shadow-red-500/30 transition-all flex items-center justify-center gap-3 group active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="animate-spin" size={20} />
                                            <span>Processing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <MessageSquare size={20} className="group-hover:-rotate-12 transition-transform" />
                                            <span>Generate WhatsApp Quote</span>
                                            <ChevronRight size={18} className="translate-x-0 group-hover:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </button>
                                <p className="text-[9px] text-gray-400 font-bold text-center uppercase tracking-widest leading-relaxed">
                                    Final negotiation and payment happens via <span className="text-green-500">WhatsApp</span> with the supplier.
                                </p>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
