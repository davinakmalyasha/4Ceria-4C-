import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    ArrowRight, Briefcase, FolderKanban, HardHat,
    Paintbrush, ShieldCheck, ShoppingBag, Truck, Users, Zap,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { LandingFaq } from '@/components/LandingFaq';
import { sessionToken } from '@/lib/session';

/**
 * The landing page — a port of `resources/js/pages/LandingPage.tsx`.
 *
 * WHAT IS IDENTICAL
 * -----------------
 * Every class string, every text node, the order of every section, the picture
 * markup, and the two marquees. The visual baseline `guest.route.root.png` was
 * captured from the legacy page and this must reproduce it.
 *
 * WHAT IS DIFFERENT, AND WHY
 * --------------------------
 *   - It is a SERVER component. The only client code on the page is the navbar
 *     (scroll + menus) and the FAQ (which answer is open).
 *   - The framer-motion wrappers are gone. They animated opacity and a 20px
 *     lift; the settled state they leave behind is the plain element, and P-6
 *     excludes animation timing from the visual contract.
 *   - The `isLoading && hasToken` splash screen is gone entirely. It existed
 *     because the SPA had to ask `/me` after the bundle loaded. Here the cookie
 *     is read on the server, so there is no unauthenticated-but-loading state
 *     to draw — a signed-in visitor is redirected before any markup is sent.
 *   - `localStorage.getItem('auth_token')` is gone: that is the point.
 *
 * The FAQ data and the workflow copy are kept verbatim, including the ones that
 * exist because the previous version invented testimonials (see the legacy
 * comment): replacing fabricated social proof with the real workflow is part of
 * the design, not part of the port.
 */

const PROFESSIONAL_ROLES = [
    { key: 'arsitek', label: 'Arsitek', icon: FolderKanban },
    { key: 'kontraktor', label: 'Kontraktor', icon: HardHat },
    { key: 'mep', label: 'MEP', icon: Zap },
    { key: 'structural', label: 'Struktural', icon: ShieldCheck },
    { key: 'interior', label: 'Interior', icon: Paintbrush },
    { key: 'notaris', label: 'Notaris', icon: Briefcase },
    { key: 'pm', label: 'Project Manager', icon: Users },
] as const;

const SOLUTIONS = [
    {
        title: 'Project Management Hub',
        desc: 'Kelola rencana kerja, design brief, dan progress konstruksi secara real-time.',
        icon: FolderKanban,
        bg: 'bg-red-50/50',
    },
    {
        title: 'Verified Professionals',
        desc: 'Hubungi arsitek, kontraktor, MEP engineer, dan notaris bersertifikasi resmi.',
        icon: HardHat,
        bg: 'bg-red-50/50',
    },
    {
        title: 'Material Marketplace',
        desc: 'Beli bahan bangunan berkualitas langsung dari supplier pilihan dengan aman.',
        icon: ShoppingBag,
        bg: 'bg-red-50/50',
    },
    {
        title: 'Smart Logistics',
        desc: 'Layanan kurir dengan Job Radar terintegrasi untuk pengiriman barang cepat.',
        icon: Truck,
        bg: 'bg-red-50/50',
    },
] as const;

const WORKFLOW = [
    { date: 'Tahap 1', text: 'Owner memposting proyek lengkap dengan dimensi, lokasi, dan peran profesional yang dibutuhkan.', author: 'Publish proyek' },
    { date: 'Tahap 2', text: 'Profesional terverifikasi menawar dengan rincian lingkup pekerjaan, durasi, dan biaya.', author: 'Menerima penawaran' },
    { date: 'Tahap 3', text: 'Setiap peran menandatangani SPK-nya sendiri, lalu menyusun jadwal termin yang wajib berjumlah 100%.', author: 'Menandatangani SPK' },
    { date: 'Tahap 4', text: 'Pembayaran dilepas hanya setelah milestone disetujui, dengan bukti transfer dan verifikasi.', author: 'Melepas pembayaran' },
] as const;

const FAQS = [
    { q: 'Bagaimana cara merekrut profesional di platform ini?', a: 'Anda dapat masuk ke Dashboard, pilih kategori profesional yang dibutuhkan (Arsitek, Kontraktor, MEP, Notaris), lalu buat ajakan wawancara atau ajukan proyek ke Bidding Board untuk mendapatkan penawaran.' },
    { q: 'Apakah ada proteksi transaksi selama pembangunan berlangsung?', a: 'Ya, seluruh pembayaran material dan penawaran kerja dikelola melalui sistem terintegrasi. Dana dilepaskan berdasarkan milestone proyek yang telah disetujui bersama.' },
    { q: 'Bagaimana cara kurir menerima pekerjaan pengantaran?', a: 'Kurir yang terverifikasi dapat masuk ke Job Radar di Dashboard mereka untuk melihat daftar pengiriman material konstruksi yang aktif, lengkap dengan tarif dan peta rute.' },
    { q: 'Bagaimana cara supplier mendaftarkan bahan bangunan?', a: 'Setelah mendaftar sebagai Supplier, Anda dapat mengelola etalase toko, memasukkan stok inventori material, serta melacak order masuk dari kontraktor atau pemilik proyek.' },
] as const;

const SPONSORS = ['google', 'bri', 'mandiri', 'cimbniaga', 'kominfo', 'btn', 'badanpertahanan', 'pupr'] as const;

const STATS = [
    { value: '1,200+', label: 'Proyek Selesai', desc: 'Rumah tinggal, gedung komersial, dan renovasi terselesaikan.' },
    { value: '50,000+', label: 'Material Terjual', desc: 'Pasokan semen, besi, bata, hingga dekorasi interior terdistribusi.' },
    { value: '4,500+', label: 'Mitra Terdaftar', desc: 'Arsitek, kontraktor, notaris, dan supplier terverifikasi sistem.' },
    { value: '24/7', label: 'Monitoring Proyek', desc: 'Pemantauan progress lelang dan pengiriman bahan real-time.' },
] as const;

export default async function LandingPage() {
    if (await sessionToken()) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 selection:bg-red-100 selection:text-red-900 font-sans">
            <Navbar authed={false} />

            {/* Hero Section */}
            <section className="relative px-6 text-center overflow-hidden flex items-center justify-center min-h-[calc(100vh-3.5rem)] mt-14 py-20 bg-white">
                <div className="absolute inset-0 bg-[radial-gradient(#fd1d1d08_1px,transparent_1px)] bg-size-[16px_16px] pointer-events-none" />

                <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 text-[#FD1D1D] text-xs font-extrabold tracking-wider uppercase mb-8 border border-red-100/50">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        4C: Creative, Comprehensive, Collaborative &amp; Cool
                    </span>

                    <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-neutral-900 leading-[1.15] tracking-tight mb-8">
                        Sistem Konstruksi <br />
                        <span className="text-[#FD1D1D]">End-to-End</span> Terintegrasi
                    </h1>

                    <p className="text-base sm:text-lg md:text-xl text-neutral-500 max-w-2xl mx-auto mb-12 leading-relaxed">
                        Platform digital pertama untuk legalitas notaris, perancangan arsitek, kolaborasi kontraktor, pembelian supplier material, hingga pengiriman logistik kurir.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
                        <Link href="/register" className="w-full sm:w-auto px-8 py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-neutral-200 text-center">
                            Mulai Proyek Baru
                        </Link>
                        <Link href="/pro/register" className="w-full sm:w-auto px-8 py-4 bg-white text-neutral-900 border border-neutral-200 rounded-2xl font-bold hover:border-[#FD1D1D] hover:text-[#FD1D1D] transition-all flex items-center justify-center gap-2">
                            Gabung Mitra Profesional <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Logo Ticker Section */}
            <div className="w-full bg-white border-y border-neutral-100 py-6 overflow-hidden">
                <div className="sponsor-marquee-container">
                    <div className="sponsor-marquee-track">
                        {[...SPONSORS, ...SPONSORS].map((logo, idx) => (
                            <picture key={`${logo}-${idx}`}>
                                <source srcSet={`/storage/Assets/${logo}.avif`} type="image/avif" />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/storage/Assets/${logo}.png`} alt={`${logo} logo`} className="sponsor-marquee-item" />
                            </picture>
                        ))}
                    </div>
                </div>
            </div>

            {/* Solutions Section */}
            <section className="py-24 px-6 w-full max-w-7xl mx-auto">
                <div className="grid lg:grid-cols-12 gap-16 items-center">
                    <div className="lg:col-span-5">
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-neutral-900 leading-tight tracking-tight mb-6">
                            Ekosistem Lengkap untuk Mewujudkan Hunian Anda
                        </h2>
                        <p className="text-base sm:text-lg text-neutral-500 leading-relaxed mb-10">
                            Kami menghubungkan seluruh pelaku industri konstruksi dalam satu jaringan dinamis demi menciptakan efisiensi maksimal.
                        </p>

                        <div className="flex items-center gap-4 p-5 bg-white rounded-3xl border border-neutral-200/60 shadow-sm w-fit">
                            <div className="flex -space-x-3">
                                {PROFESSIONAL_ROLES.map((role) => (
                                    <div key={role.key} className="w-10 h-10 rounded-full border-2 border-white bg-neutral-100 overflow-hidden grid place-items-center">
                                        <role.icon className="w-4 h-4 text-neutral-500" aria-hidden="true" />
                                    </div>
                                ))}
                            </div>
                            <div className="pr-4">
                                <p className="text-sm font-extrabold text-neutral-900 tracking-tight">
                                    {PROFESSIONAL_ROLES.length} peran profesional terverifikasi
                                </p>
                                <p className="text-xs text-neutral-500">Arsitek, kontraktor, notaris, interior, dan rekayasa</p>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-7 grid sm:grid-cols-2 gap-6">
                        {SOLUTIONS.map((item, index) => (
                            <div
                                key={index}
                                className="group p-8 bg-white border border-neutral-100 rounded-3xl hover:border-red-200 hover:shadow-xl hover:shadow-red-500/2 transition-all duration-300"
                            >
                                <div className={`w-12 h-12 ${item.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-red-100/30`}>
                                    <item.icon className="w-6 h-6 text-[#FD1D1D]" />
                                </div>
                                <h3 className="text-lg font-bold text-neutral-900 mb-2 group-hover:text-[#FD1D1D] transition-colors">{item.title}</h3>
                                <p className="text-sm text-neutral-500 leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Feature Showcases */}
            <section className="py-12 bg-white">
                <div className="max-w-7xl mx-auto px-6 space-y-24">
                    <div id="showcase-professionals" className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
                        <div className="w-full lg:w-1/2">
                            <picture>
                                <source srcSet="/storage/Assets/rumah1.avif" type="image/avif" />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/storage/Assets/rumah1.png" className="w-full h-auto rounded-3xl shadow-lg border border-neutral-100 object-cover aspect-4/3" alt="Roster & Ahli" />
                            </picture>
                        </div>
                        <div className="w-full lg:w-1/2 space-y-6">
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
                        </div>
                    </div>

                    <div id="showcase-properties" className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-20">
                        <div className="w-full lg:w-1/2">
                            <picture>
                                <source srcSet="/storage/Assets/2 (City).avif" type="image/avif" />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/storage/Assets/2 (City).jpg" className="w-full h-auto rounded-3xl shadow-lg border border-neutral-100 object-cover aspect-4/3" alt="Project Hub" />
                            </picture>
                        </div>
                        <div className="w-full lg:w-1/2 space-y-6">
                            <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D]">Collaborative Workspace</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 leading-tight">Project Management &amp; Bidding Board</h2>
                            <p className="text-neutral-500 leading-relaxed text-base">
                                Pantau jalannya pembangunan secara mendetail. Buka papan lelang proyek (Bidding Board) untuk membandingkan proposal harga mitra, kelola design brief arsitektur, buat catatan perencanaan harian, dan unggah dokumen penting ke dalam Project Vault yang aman.
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><FolderKanban className="w-3.5 h-3.5" /> Project Vault</span>
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> Bidding Board</span>
                            </div>
                        </div>
                    </div>

                    <div id="showcase-marketplace" className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
                        <div className="w-full lg:w-1/2">
                            <picture>
                                <source srcSet="/storage/Assets/konsultan2.avif" type="image/avif" />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/storage/Assets/konsultan2.png" className="w-full h-auto rounded-3xl shadow-lg border border-neutral-100 object-cover aspect-4/3" alt="Marketplace Store" />
                            </picture>
                        </div>
                        <div className="w-full lg:w-1/2 space-y-6">
                            <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D]">Building Materials</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 leading-tight">Belanja di Toko Material Terpercaya</h2>
                            <p className="text-neutral-500 leading-relaxed text-base">
                                Supplier dapat membuka toko bahan bangunan digital mereka sendiri dan melacak order masuk. Sebagai pembeli, cari kebutuhan besi, semen, keramik, cat, hingga perkakas konstruksi terlengkap langsung lewat menu Marketplace.
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5" /> Storefront</span>
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Instant Order</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-20">
                        <div className="w-full lg:w-1/2">
                            <picture>
                                <source srcSet="/storage/Assets/rumah3.avif" type="image/avif" />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/storage/Assets/rumah3.png" className="w-full h-auto rounded-3xl shadow-lg border border-neutral-100 object-cover aspect-4/3" alt="Logistics Courier" />
                            </picture>
                        </div>
                        <div className="w-full lg:w-1/2 space-y-6">
                            <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D]">Courier Services</span>
                            <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 leading-tight">Pengiriman Cepat lewat Job Radar</h2>
                            <p className="text-neutral-500 leading-relaxed text-base">
                                Untuk memperlancar pengiriman bahan material, kurir logistik independen dapat mencari pesanan aktif di wilayah sekitar mereka lewat fitur Job Radar, mengambil barang dari toko supplier, dan mengantarkannya langsung ke lokasi proyek konstruksi.
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Courier Job Radar</span>
                                <span className="px-3 py-1 bg-neutral-100 text-neutral-800 text-xs font-bold rounded-lg flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Logistics Network</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Statistics Section */}
            <section className="py-24 bg-white border-y border-neutral-100 overflow-hidden">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-16">
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

                        <div className="w-full lg:w-7/12 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-16">
                            {STATS.map((stat, idx) => (
                                <div key={idx} className="space-y-3 relative group text-center sm:text-left pl-0 sm:pl-4">
                                    <div className="absolute -left-1 top-2 w-1.5 h-1.5 rounded-full bg-[#FD1D1D] opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden sm:block" />
                                    <p className="text-5xl sm:text-6xl font-black text-neutral-900 tracking-tighter group-hover:text-[#FD1D1D] transition-colors duration-300">
                                        {stat.value}
                                    </p>
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-black text-neutral-800 uppercase tracking-wider">{stat.label}</h4>
                                        <p className="text-xs text-neutral-400 leading-relaxed font-semibold">{stat.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Workflow section */}
            <section className="py-24 px-6 max-w-7xl mx-auto">
                <div className="text-center max-w-2xl mx-auto mb-16">
                    <span className="text-xs font-black uppercase tracking-widest text-[#FD1D1D] mb-3 block">Alur Kerja</span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-neutral-900">Empat Tahap, dari Posting sampai Serah Terima</h2>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {WORKFLOW.map((step, index) => (
                        <div
                            key={step.author}
                            className="bg-white border border-neutral-100 p-8 rounded-3xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex items-baseline gap-2 mb-4">
                                    <span className="text-3xl font-black text-[#FD1D1D]">{String(index + 1).padStart(2, '0')}</span>
                                    <span className="text-xs font-black uppercase tracking-widest text-neutral-400">{step.date}</span>
                                </div>
                                <p className="text-neutral-600 text-sm leading-relaxed mb-6">{step.text}</p>
                            </div>
                            <div>
                                <p className="font-extrabold text-neutral-900 text-sm">{step.author}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-20 rounded-3xl overflow-hidden shadow-xl border border-neutral-200/50 aspect-21/9 max-h-[500px]">
                    <picture>
                        <source srcSet="/storage/Assets/4CTeam.avif" type="image/avif" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/storage/Assets/4CTeam.jpg" className="w-full h-full object-cover" alt="4C Development Team" />
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

                    <LandingFaq faqs={FAQS.map((faq) => ({ q: faq.q, a: faq.a }))} />
                </div>
            </section>

            {/* Original CTA Section */}
            <section className="py-24 bg-white border-t border-neutral-100">
                <div className="kelompokKe6">
                    <h1>Wujudkan Rumah Impianmu – Beli, Bangun, atau Jual!</h1>
                    <div className="bawahKelompok6">
                        <div className="kiriBawahKelompok6">
                            <div className="tengahKelompok6">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/assets/Logo4C.png" alt="Logo" />
                                <h3>4C 4Construction By 4C Team</h3>
                            </div>
                            <div className="textIsiKelompok6">
                                <picture>
                                    <source srcSet="/storage/Assets/4CTeam.avif" type="image/avif" />
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/storage/Assets/4CTeam.jpg" alt="Team" />
                                </picture>
                                <p>
                                    Dapatkan rumah impian dengan kualitas premium dari tim berpengalaman.
                                    <span>
                                        {' '}
                                        Dengan proses yang mudah dan transparan, kami memastikan setiap hunian tidak hanya sesuai kebutuhan Anda, tetapi juga menghadirkan nilai terbaik dalam setiap langkahnya.
                                    </span>
                                </p>
                            </div>
                        </div>
                        <Link href="/register">
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
                            <button type="button" className="bg-[#FD1D1D] hover:bg-[#e01a1a] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0">
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
