import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    MousePointerClick, 
    Users, 
    Zap, 
    ShieldCheck, 
    ArrowRight,
    MessageSquare,
    CheckCircle,
    Star,
    ChevronDown,
    FolderKanban,
    HardHat,
    Truck,
    Briefcase,
    ShoppingBag,
    Paintbrush
} from 'lucide-react';

interface SolutionItem {
    title: string;
    desc: string;
    icon: React.ReactNode;
    bg: string;
}

interface ReviewItem {
    date: string;
    text: string;
    author: string;
}

interface FAQItem {
    q: string;
    a: string;
}

export default function LandingPage(): React.ReactElement {
    const { user, isLoading } = useAuth();
    const hasToken = !!localStorage.getItem('auth_token');

    if (isLoading && hasToken) {
        return (
            <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center relative overflow-hidden select-none">
                {/* Background Glows */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />

                {/* Content Wrapper */}
                <div className="relative flex flex-col items-center gap-6 text-center px-6">
                    {/* Logo Outer Ring */}
                    <div className="relative p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)]">
                        {/* Pulse Ring */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-red-500 to-amber-500 rounded-[2.5rem] opacity-20 blur-md animate-pulse" />
                        
                        <div className="relative w-16 h-16 flex items-center justify-center">
                            <img className="w-16 h-16 object-contain" src="/storage/Assets/Logo4C.png" alt="4C Logo" />
                        </div>
                    </div>

                    {/* Text Details */}
                    <div className="space-y-1.5 mt-2">
                        <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2 justify-center">
                            4Ceria<span className="text-[#FF2D20]">.</span>
                        </h2>
                        <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest leading-none">
                            Creative Comprehensive Construction
                        </p>
                    </div>

                    {/* Progress Indicator */}
                    <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden mt-2 relative">
                        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#FF2D20] to-red-500 rounded-full w-1/2 animate-[loading-slide_1.5s_infinite_ease-in-out]" style={{
                            animationName: 'loading-slide',
                            animationDuration: '1.5s',
                            animationIterationCount: 'infinite',
                            animationTimingFunction: 'ease-in-out'
                        }} />
                    </div>
                </div>

                {/* Inline CSS for the loading animation keyframe */}
                <style dangerouslySetInnerHTML={{__html: `
                    @keyframes loading-slide {
                        0% { transform: translateX(-100%); }
                        50% { transform: translateX(100%); }
                        100% { transform: translateX(200%); }
                    }
                `}} />
            </div>
        );
    }

    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const toggleFaq = (index: number): void => {
        setOpenFaq(openFaq === index ? null : index);
    };

    const fadeInUp = {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.6 }
    };

    const stagger = {
        animate: {
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const solutions: SolutionItem[] = [
        {
            title: "Project Management Hub",
            desc: "Kelola rencana kerja, design brief, dan progress konstruksi secara real-time.",
            icon: <FolderKanban className="w-6 h-6 text-[#FD1D1D]" />,
            bg: "bg-red-50/50"
        },
        {
            title: "Verified Professionals",
            desc: "Hubungi arsitek, kontraktor, MEP engineer, dan notaris bersertifikasi resmi.",
            icon: <HardHat className="w-6 h-6 text-[#FD1D1D]" />,
            bg: "bg-red-50/50"
        },
        {
            title: "Material Marketplace",
            desc: "Beli bahan bangunan berkualitas langsung dari supplier pilihan dengan aman.",
            icon: <ShoppingBag className="w-6 h-6 text-[#FD1D1D]" />,
            bg: "bg-red-50/50"
        },
        {
            title: "Smart Logistics",
            desc: "Layanan kurir dengan Job Radar terintegrasi untuk pengiriman barang cepat.",
            icon: <Truck className="w-6 h-6 text-[#FD1D1D]" />,
            bg: "bg-red-50/50"
        }
    ];

    const reviews: ReviewItem[] = [
        { date: '29 Desember, 2025', text: 'Sangat terbantu mencari kontraktor dan arsitek. Proses pembayaran dan progress terpantau detail di dashboard.', author: 'DavinGans' },
        { date: '30 Desember, 2025', text: 'Sebagai supplier, inventory dan order tracking sistem di platform ini mempermudah penjualan toko kami.', author: 'FarizSupplier' },
        { date: '31 Desember, 2025', text: 'Proses pengiriman bahan konstruksi lancar karena kurir langsung mengambil order dari Job Radar.', author: 'FarizCourier' },
        { date: '1 Januari, 2026', text: 'Negosiasi proyek dengan arsitek sangat transparan melalui fitur Bidding Board. Sangat professional!', author: 'User123' },
    ];

    const faqs: FAQItem[] = [
        { q: 'Bagaimana cara merekrut profesional di platform ini?', a: 'Anda dapat masuk ke Dashboard, pilih kategori profesional yang dibutuhkan (Arsitek, Kontraktor, MEP, Notaris), lalu buat ajakan wawancara atau ajukan proyek ke Bidding Board untuk mendapatkan penawaran.' },
        { q: 'Apakah ada proteksi transaksi selama pembangunan berlangsung?', a: 'Ya, seluruh pembayaran material dan penawaran kerja dikelola melalui sistem terintegrasi. Dana dilepaskan berdasarkan milestone proyek yang telah disetujui bersama.' },
        { q: 'Bagaimana cara kurir menerima pekerjaan pengantaran?', a: 'Kurir yang terverifikasi dapat masuk ke Job Radar di Dashboard mereka untuk melihat daftar pengiriman material konstruksi yang aktif, lengkap dengan tarif dan peta rute.' },
        { q: 'Bagaimana cara supplier mendaftarkan bahan bangunan?', a: 'Setelah mendaftar sebagai Supplier, Anda dapat mengelola etalase toko, memasukkan stok inventori material, serta melacak order masuk dari kontraktor atau pemilik proyek.' }
    ];

    const sponsors: string[] = [
        'google', 'bri', 'mandiri', 'cimbniaga', 'kominfo', 'btn', 'badanpertahanan', 'pupr'
    ];

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 selection:bg-red-100 selection:text-red-900 font-sans">
            {!isLoading && user && <Navigate to="/dashboard" replace />}
            <Navbar />

            {/* Hero Section */}
            <section className="relative px-6 text-center overflow-hidden flex items-center justify-center min-h-[85vh] py-20 bg-white">
                <div className="absolute inset-0 bg-[radial-gradient(#fd1d1d08_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
                
                <motion.div 
                    variants={stagger}
                    initial="initial"
                    animate="animate"
                    className="relative z-10 max-w-4xl mx-auto flex flex-col items-center"
                >
                    <motion.span 
                        variants={fadeInUp}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 text-[#FD1D1D] text-xs font-extrabold tracking-wider uppercase mb-8 border border-red-100/50"
                    >
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        4C: Creative, Comprehensive, Collaborative &amp; Cool
                    </motion.span>

                    <motion.h1 
                        variants={fadeInUp}
                        className="text-4xl sm:text-5xl md:text-7xl font-black text-neutral-900 leading-[1.15] tracking-tight mb-8"
                    >
                        Sistem Konstruksi <br />
                        <span className="text-[#FD1D1D]">End-to-End</span> Terintegrasi
                    </motion.h1>

                    <motion.p 
                        variants={fadeInUp}
                        className="text-base sm:text-lg md:text-xl text-neutral-500 max-w-2xl mx-auto mb-12 leading-relaxed"
                    >
                        Platform digital pertama untuk legalitas notaris, perancangan arsitek, kolaborasi kontraktor, pembelian supplier material, hingga pengiriman logistik kurir.
                    </motion.p>

                    <motion.div 
                        variants={fadeInUp}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto"
                    >
                        <Link to="/register" className="w-full sm:w-auto px-8 py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-neutral-200 text-center">
                            Mulai Proyek Baru
                        </Link>
                        <Link to="/pro/register" className="w-full sm:w-auto px-8 py-4 bg-white text-neutral-900 border border-neutral-200 rounded-2xl font-bold hover:border-[#FD1D1D] hover:text-[#FD1D1D] transition-all flex items-center justify-center gap-2">
                            Gabung Mitra Profesional <ArrowRight className="w-4 h-4" />
                        </Link>
                    </motion.div>
                </motion.div>
            </section>

            {/* Logo Ticker Section */}
            <div className="w-full bg-white border-y border-neutral-100 py-6 overflow-hidden">
                <div className="sponsor-marquee-container">
                    <div className="sponsor-marquee-track">
                        {[...sponsors, ...sponsors].map((logo, idx) => (
                            <picture key={`${logo}-${idx}`}>
                                <source srcSet={`/storage/Assets/${logo}.avif`} type="image/avif" />
                                <img 
                                    src={`/storage/Assets/${logo}.png`} 
                                    alt={`${logo} logo`} 
                                    className="sponsor-marquee-item" 
                                />
                            </picture>
                        ))}
                    </div>
                </div>
            </div>

            {/* Solutions Section */}
            <section className="py-24 px-6 w-full max-w-7xl mx-auto">
                <div className="grid lg:grid-cols-12 gap-16 items-center">
                    <motion.div 
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8 }}
                        className="lg:col-span-5"
                    >
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-neutral-900 leading-tight tracking-tight mb-6">
                            Ekosistem Lengkap untuk Mewujudkan Hunian Anda
                        </h2>
                        <p className="text-base sm:text-lg text-neutral-500 leading-relaxed mb-10">
                            Kami menghubungkan seluruh pelaku industri konstruksi dalam satu jaringan dinamis demi menciptakan efisiensi maksimal.
                        </p>
                        
                        <div className="flex items-center gap-4 p-5 bg-white rounded-3xl border border-neutral-200/60 shadow-sm w-fit">
                            <div className="flex -space-x-3">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-neutral-200 overflow-hidden">
                                        <img src={`https://i.pravatar.cc/100?u=${i}`} alt="user avatar" />
                                    </div>
                                ))}
                            </div>
                            <div className="pr-4">
                                <p className="text-sm font-extrabold text-neutral-900 tracking-tight flex items-center gap-1">
                                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> 4.9/5 Rating
                                </p>
                                <p className="text-xs text-neutral-500">Dari 1000+ proyek sukses terlaksana</p>
                            </div>
                        </div>
                    </motion.div>

                    <div className="lg:col-span-7 grid sm:grid-cols-2 gap-6">
                        {solutions.map((item, index) => (
                            <motion.div 
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="group p-8 bg-white border border-neutral-100 rounded-3xl hover:border-red-200 hover:shadow-xl hover:shadow-red-500/[0.02] transition-all duration-300"
                            >
                                <div className={`w-12 h-12 ${item.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-red-100/30`}>
                                    {item.icon}
                                </div>
                                <h3 className="text-lg font-bold text-neutral-900 mb-2 group-hover:text-[#FD1D1D] transition-colors">{item.title}</h3>
                                <p className="text-sm text-neutral-500 leading-relaxed">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Feature Showcases */}
            <section className="py-12 bg-white">
                <div className="max-w-7xl mx-auto px-6 space-y-24">
                    
                    {/* Showcase 1: Roster & Ahli */}
                    <div id="showcase-professionals" className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
                        <motion.div 
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="w-full lg:w-1/2"
                        >
                            <picture>
                                <source srcSet="/storage/Assets/rumah1.avif" type="image/avif" />
                                <img 
                                    src="/storage/Assets/rumah1.png" 
                                    className="w-full h-auto rounded-3xl shadow-lg border border-neutral-100 object-cover aspect-[4/3]" 
                                    alt="Roster & Ahli" 
                                />
                            </picture>
                        </motion.div>
                        <motion.div 
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="w-full lg:w-1/2 space-y-6"
                        >
                            <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D]">Professional Directory</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 leading-tight">Rekrut Tim Ahli Berlisensi</h2>
                            <p className="text-neutral-500 leading-relaxed text-base">
                                Temukan dan pekerjakan arsitek perancang blueprint, kontraktor sipil pelaksana lapangan, desainer interior, spesialis ME/Struktur, hingga PPAT/Notaris hukum untuk verifikasi sertifikat kepemilikan Anda.
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><Paintbrush className="w-3.5 h-3.5" /> Interior</span>
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><HardHat className="w-3.5 h-3.5" /> Kontraktor</span>
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Notaris</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* Showcase 2: Project Hub */}
                    <div id="showcase-properties" className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-20">
                        <motion.div 
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="w-full lg:w-1/2"
                        >
                            <picture>
                                <source srcSet="/storage/Assets/2 (City).avif" type="image/avif" />
                                <img 
                                    src="/storage/Assets/2 (City).jpg" 
                                    className="w-full h-auto rounded-3xl shadow-lg border border-neutral-100 object-cover aspect-[4/3]" 
                                    alt="Project Hub" 
                                />
                            </picture>
                        </motion.div>
                        <motion.div 
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="w-full lg:w-1/2 space-y-6"
                        >
                            <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D]">Collaborative Workspace</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 leading-tight">Project Management &amp; Bidding Board</h2>
                            <p className="text-neutral-500 leading-relaxed text-base">
                                Pantau jalannya pembangunan secara mendetail. Buka papan lelang proyek (Bidding Board) untuk membandingkan proposal harga mitra, kelola design brief arsitektur, buat catatan perencanaan harian, dan unggah dokumen penting ke dalam Project Vault yang aman.
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><FolderKanban className="w-3.5 h-3.5" /> Project Vault</span>
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> Bidding Board</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* Showcase 3: Marketplace */}
                    <div id="showcase-marketplace" className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
                        <motion.div 
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="w-full lg:w-1/2"
                        >
                            <picture>
                                <source srcSet="/storage/Assets/konsultan2.avif" type="image/avif" />
                                <img 
                                    src="/storage/Assets/konsultan2.png" 
                                    className="w-full h-auto rounded-3xl shadow-lg border border-neutral-100 object-cover aspect-[4/3]" 
                                    alt="Marketplace Store" 
                                />
                            </picture>
                        </motion.div>
                        <motion.div 
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="w-full lg:w-1/2 space-y-6"
                        >
                            <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D]">Building Materials</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 leading-tight">Belanja di Toko Material Terpercaya</h2>
                            <p className="text-neutral-500 leading-relaxed text-base">
                                Supplier dapat membuka toko bahan bangunan digital mereka sendiri dan melacak order masuk. Sebagai pembeli, cari kebutuhan besi, semen, keramik, cat, hingga perkakas konstruksi terlengkap langsung lewat menu Marketplace.
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5" /> Storefront</span>
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Instant Order</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* Showcase 4: Logistics & Courier */}
                    <div className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-20">
                        <motion.div 
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="w-full lg:w-1/2"
                        >
                            <picture>
                                <source srcSet="/storage/Assets/rumah3.avif" type="image/avif" />
                                <img 
                                    src="/storage/Assets/rumah3.png" 
                                    className="w-full h-auto rounded-3xl shadow-lg border border-neutral-100 object-cover aspect-[4/3]" 
                                    alt="Logistics Courier" 
                                />
                            </picture>
                        </motion.div>
                        <motion.div 
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="w-full lg:w-1/2 space-y-6"
                        >
                            <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D]">Courier Services</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 leading-tight">Pengiriman Cepat lewat Job Radar</h2>
                            <p className="text-neutral-500 leading-relaxed text-base">
                                Untuk memperlancar pengiriman bahan material, kurir logistik independen dapat mencari pesanan aktif di wilayah sekitar mereka lewat fitur Job Radar, mengambil barang dari toko supplier, dan mengantarkannya langsung ke lokasi proyek konstruksi.
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Courier Job Radar</span>
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Logistics Network</span>
                            </div>
                        </motion.div>
                    </div>

                </div>
            </section>

            {/* Statistics Section */}
            <section className="py-24 bg-white border-y border-neutral-100 overflow-hidden">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-16">
                        {/* Left Content Column */}
                        <div className="w-full lg:w-5/12 space-y-6 text-center lg:text-left">
                            <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D] bg-red-50 px-4 py-1.5 rounded-full inline-block">
                                Laporan Kinerja
                            </span>
                            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-neutral-900 leading-[1.1] tracking-tight">
                                Transparansi dan Skala dalam Setiap Detik
                            </h2>
                            <p className="text-neutral-500 text-sm sm:text-base leading-relaxed">
                                Kami menyatukan seluruh rantai pasok industri konstruksi di Indonesia. Dari perencanaan desain oleh arsitek terverifikasi hingga pengiriman bahan bangunan oleh jaringan kurir logistik kami.
                            </p>
                            <div className="pt-4 flex justify-center lg:justify-start">
                                <div className="h-1 w-20 bg-[#FD1D1D] rounded-full" />
                            </div>
                        </div>

                        {/* Right Stats Grid Column */}
                        <div className="w-full lg:w-7/12 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-16">
                            {[
                                { value: "1,200+", label: "Proyek Selesai", desc: "Rumah tinggal, gedung komersial, dan renovasi terselesaikan." },
                                { value: "50,000+", label: "Material Terjual", desc: "Pasokan semen, besi, bata, hingga dekorasi interior terdistribusi." },
                                { value: "4,500+", label: "Mitra Terdaftar", desc: "Arsitek, kontraktor, notaris, dan supplier terverifikasi sistem." },
                                { value: "24/7", label: "Monitoring Proyek", desc: "Pemantauan progress lelang dan pengiriman bahan real-time." }
                            ].map((stat, idx) => (
                                <motion.div 
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6, delay: idx * 0.1, ease: [0.16, 1, 0.3, 1] }}
                                    className="space-y-3 relative group text-center sm:text-left pl-0 sm:pl-4"
                                >
                                    {/* Subtle decorative dot */}
                                    <div className="absolute -left-1 top-2 w-1.5 h-1.5 rounded-full bg-[#FD1D1D] opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden sm:block" />
                                    
                                    <p className="text-5xl sm:text-6xl font-black text-neutral-900 tracking-tighter group-hover:text-[#FD1D1D] transition-colors duration-300">
                                        {stat.value}
                                    </p>
                                    
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-black text-neutral-800 uppercase tracking-wider">
                                            {stat.label}
                                        </h4>
                                        <p className="text-xs text-neutral-400 leading-relaxed font-semibold">
                                            {stat.desc}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Testimonial Section */}
            <section className="py-24 px-6 max-w-7xl mx-auto">
                <div className="text-center max-w-2xl mx-auto mb-16">
                    <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D] mb-3 block">Testimonials</span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-neutral-900">Suara Pengguna Kami</h2>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {reviews.map((review, index) => (
                        <motion.div 
                            key={index}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="bg-white border border-neutral-100 p-8 rounded-3xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex gap-1 mb-4 text-[#FD1D1D]">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} className="w-4 h-4 fill-[#FD1D1D]" />
                                    ))}
                                </div>
                                <p className="text-neutral-600 text-sm leading-relaxed mb-6 italic">"{review.text}"</p>
                            </div>
                            <div>
                                <p className="font-extrabold text-neutral-900 text-sm">{review.author}</p>
                                <p className="text-[10px] text-neutral-400 mt-1">{review.date}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Team photo section */}
                <div className="mt-20 rounded-3xl overflow-hidden shadow-xl border border-neutral-200/50 aspect-[21/9] max-h-[500px]">
                    <picture>
                        <source srcSet="/storage/Assets/4CTeam.avif" type="image/avif" />
                        <img 
                            src="/storage/Assets/4CTeam.jpg" 
                            className="w-full h-full object-cover" 
                            alt="4C Development Team" 
                        />
                    </picture>
                </div>
            </section>

            {/* FAQ Section */}
            <section id="faq" className="py-24 bg-white border-y border-neutral-100">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D] mb-3 block">FAQ</span>
                        <h2 className="text-3xl sm:text-4xl font-black text-neutral-900 leading-tight">Anda Tanya, Kami Jawab</h2>
                    </div>

                    <div className="space-y-4">
                        {faqs.map((faq, index) => {
                            const isOpen = openFaq === index;
                            return (
                                <div 
                                    key={index} 
                                    className="border border-neutral-200/80 rounded-2xl overflow-hidden bg-neutral-50/50 hover:bg-neutral-50 transition-colors"
                                >
                                    <button 
                                        onClick={() => toggleFaq(index)}
                                        className="w-full px-6 py-5 text-left flex justify-between items-center gap-4 focus:outline-none"
                                    >
                                        <span className="font-bold text-neutral-800 text-sm sm:text-base">{faq.q}</span>
                                        <ChevronDown 
                                            className={`w-5 h-5 text-neutral-400 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#FD1D1D]' : ''}`} 
                                        />
                                    </button>
                                    
                                    <AnimatePresence initial={false}>
                                        {isOpen && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                            >
                                                <div className="px-6 pb-5 pt-0 border-t border-neutral-100 text-neutral-500 text-sm leading-relaxed">
                                                    {faq.a}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Original CTA Section */}
            <section className="py-24 bg-white border-t border-neutral-100">
                <div className="kelompokKe6">
                    <h1>Wujudkan Rumah Impianmu – Beli, Bangun, atau Jual!</h1>
                    <div className="bawahKelompok6">
                        <div className="kiriBawahKelompok6">
                            <div className="tengahKelompok6">
                                <img src="/storage/Assets/Logo4C.png" alt="Logo" />
                                <h3>4C 4Construction By 4C Team</h3>
                            </div>
                            <div className="textIsiKelompok6">
                                <picture>
                                    <source srcSet="/storage/Assets/4CTeam.avif" type="image/avif" />
                                    <img src="/storage/Assets/4CTeam.jpg" alt="Team" />
                                </picture>
                                <p>
                                    Dapatkan rumah impian dengan kualitas premium dari tim berpengalaman.
                                    <span>
                                        {" "}
                                        Dengan proses yang mudah dan transparan, kami memastikan setiap hunian tidak hanya sesuai kebutuhan Anda, tetapi juga menghadirkan nilai terbaik dalam setiap langkahnya.
                                    </span>
                                </p>
                            </div>
                        </div>
                        <Link to="/register">
                            <div className="tombolCta">
                                <div className="text-wrapper">
                                    <h3>Saya Tertarik!</h3>
                                    <div className="hover-text">Saya Tertarik!</div>
                                </div>
                            </div>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-neutral-900 border-t border-neutral-800 text-neutral-400 py-16 px-6">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 pb-12 border-b border-neutral-800">
                    <div className="lg:col-span-5 space-y-6">
                        <h2 className="text-3xl font-black text-white tracking-tighter">4Ceria<span className="text-[#FD1D1D]">.</span></h2>
                        <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">
                            The complete creative comprehensive construction platform made with passion and dedication.
                        </p>
                    </div>
                    
                    <div className="lg:col-span-4 grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h4 className="text-white text-xs font-black uppercase tracking-widest">Company</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Products</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                            </ul>
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-white text-xs font-black uppercase tracking-widest">Resources</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <div className="lg:col-span-3 space-y-4">
                        <h4 className="text-white text-xs font-black uppercase tracking-widest">Contact Us</h4>
                        <p className="text-sm text-neutral-500 leading-relaxed">
                            Have questions or feedback? Send us a message!
                        </p>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="Pesan Anda" 
                                className="bg-neutral-800 border border-neutral-700/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FD1D1D] text-white w-full"
                            />
                            <button className="bg-[#FD1D1D] hover:bg-[#e01a1a] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0">
                                Kirim
                            </button>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-neutral-500">
                    <p>© {new Date().getFullYear()} 4Ceria. All rights reserved.</p>
                    <div className="flex gap-6">
                        <a href="#" className="hover:text-white transition-colors">Instagram</a>
                        <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
                        <a href="#" className="hover:text-white transition-colors">YouTube</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
