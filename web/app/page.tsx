import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
    ArrowRight,
    BadgeCheck,
    Briefcase,
    CheckCircle2,
    FolderKanban,
    HardHat,
    Layers,
    Paintbrush,
    ShieldCheck,
    ShoppingBag,
    Smartphone,
    Truck,
    Users,
    Wallet,
    Zap,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import { LandingFaq } from '@/components/LandingFaq';
import { sessionToken } from '@/lib/session';

const PROFESSIONAL_ROLES = [
    { label: 'Arsitek', icon: FolderKanban },
    { label: 'Kontraktor', icon: HardHat },
    { label: 'MEP', icon: Zap },
    { label: 'Struktural', icon: ShieldCheck },
    { label: 'Interior', icon: Paintbrush },
    { label: 'Notaris', icon: Briefcase },
    { label: 'Project Manager', icon: Users },
] as const;

const SOLUTIONS = [
    {
        title: 'Project Management Hub',
        desc: 'Brief desain, milestone, dokumen, dan progres konstruksi dalam satu ruang kerja yang bisa diaudit.',
        icon: FolderKanban,
    },
    {
        title: 'Verified Professionals',
        desc: 'Arsitek, kontraktor, MEP, notaris, dan spesialis lain dengan profil, portofolio, dan verifikasi.',
        icon: BadgeCheck,
    },
    {
        title: 'Material Marketplace',
        desc: 'Bandingkan supplier, ajukan penawaran, dan lacak pesanan material sampai diterima di lokasi.',
        icon: ShoppingBag,
    },
    {
        title: 'Smart Logistics',
        desc: 'Job Radar menghubungkan pengiriman material dengan kurir di sekitar lokasi proyek.',
        icon: Truck,
    },
] as const;

const WORKFLOW = [
    {
        step: '01',
        title: 'Publikasikan proyek',
        text: 'Owner menjelaskan kebutuhan, lokasi, dimensi, dan peran profesional yang dibutuhkan.',
    },
    {
        step: '02',
        title: 'Terima penawaran',
        text: 'Profesional terverifikasi menawar dengan lingkup pekerjaan, durasi, dan biaya yang jelas.',
    },
    {
        step: '03',
        title: 'Sepakati kontrak',
        text: 'Setiap peran menandatangani SPK dan menyusun termin pembayaran yang berjumlah 100%.',
    },
    {
        step: '04',
        title: 'Lepas pembayaran',
        text: 'Dana milestone hanya dilepas setelah pekerjaan disetujui, dengan bukti dan jejak audit.',
    },
] as const;

const FAQS = [
    {
        q: 'Bagaimana cara merekrut profesional di platform ini?',
        a: 'Masuk ke dashboard, pilih kategori profesional yang dibutuhkan, lalu kirim undangan wawancara atau buka proyek ke Bidding Board untuk menerima penawaran.',
    },
    {
        q: 'Apakah transaksi selama pembangunan terlindungi?',
        a: 'Ya. Pembayaran material dan jasa dikelola melalui ledger proyek. Dana milestone hanya dilepas setelah pekerjaan disetujui, dan sengketa membekukan pembayaran terkait.',
    },
    {
        q: 'Bagaimana kurir menerima pekerjaan pengantaran?',
        a: 'Kurir terverifikasi membuka Job Radar untuk melihat pengiriman material aktif di sekitarnya, lengkap dengan tarif dan rute, lalu mengambil dan mengantar pesanan.',
    },
    {
        q: 'Bagaimana supplier mendaftarkan bahan bangunan?',
        a: 'Setelah mendaftar sebagai Supplier, Anda mengelola etalase, stok inventori, penawaran, pesanan masuk, dan status pengiriman dari satu tempat.',
    },
] as const;

const FACTS = [
    { value: '7', label: 'Peran profesional', desc: 'Satu alur untuk arsitek, kontraktor, MEP, struktural, interior, notaris, dan PM.' },
    { value: '100%', label: 'Milestone terlacak', desc: 'Setiap pembayaran terhubung ke pekerjaan, bukti, dan persetujuan.' },
    { value: '1', label: 'Ledger proyek', desc: 'Termin, addendum, material, dan sengketa pada satu catatan yang konsisten.' },
    { value: '0', label: 'Aplikasi toko', desc: 'Pasang langsung dari browser — cepat, ringan, dan tetap bisa dibuka saat offline.' },
] as const;

export default async function LandingPage() {
    if (await sessionToken()) {
        redirect('/dashboard');
    }

    return (
        <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900 selection:bg-red-100 selection:text-red-900">
            <Navbar authed={false} />

            <section className="relative mt-[calc(3.5rem+env(safe-area-inset-top))] overflow-hidden bg-white">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#fd1d1d0a_1px,transparent_1px)] bg-size-[18px_18px]" />
                <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 py-20 lg:grid-cols-12 lg:py-28">
                    <div className="lg:col-span-6">
                        <span className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#FD1D1D]">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                            </span>
                            Creative · Comprehensive · Collaborative · Cool
                        </span>

                        <h1 className="mt-7 text-4xl font-black leading-[1.08] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
                            Konstruksi yang terkoordinasi,
                            <span className="text-[#FD1D1D]"> dari brief sampai serah terima.</span>
                        </h1>

                        <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-500 sm:text-lg">
                            Satu workspace untuk owner, profesional terverifikasi, supplier material, dan
                            kurir — dengan penawaran yang transparan dan pembayaran yang mengikuti
                            pekerjaan.
                        </p>

                        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                            <Link
                                href="/register"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-7 py-4 text-sm font-bold text-white shadow-lg shadow-neutral-200 transition hover:-translate-y-0.5 hover:bg-neutral-800 active:translate-y-0"
                            >
                                Mulai proyek baru
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                href="/pro/register"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white px-7 py-4 text-sm font-bold text-neutral-900 transition hover:border-[#FD1D1D] hover:text-[#FD1D1D]"
                            >
                                Gabung sebagai profesional
                            </Link>
                        </div>

                        <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-xs font-semibold text-neutral-500">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                Escrow per milestone
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                Profil terverifikasi
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                Bisa dipasang sebagai app
                            </div>
                        </dl>
                    </div>

                    <div className="relative lg:col-span-6">
                        <div className="relative overflow-hidden rounded-[2rem] border border-neutral-200 bg-neutral-100 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
                            <Image
                                src="/assets/home-1.webp"
                                alt="Rumah modern dengan taman"
                                width={1200}
                                height={800}
                                priority
                                sizes="(max-width: 1024px) 100vw, 50vw"
                                className="h-[360px] w-full object-cover sm:h-[440px]"
                            />
                            <div className="absolute inset-0 bg-linear-to-t from-neutral-950/55 via-transparent to-transparent" />

                            <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/15 bg-white/95 p-4 shadow-xl backdrop-blur">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                            Modern Minimalist Villa · Ubud
                                        </p>
                                        <p className="mt-1 text-sm font-black text-neutral-900">
                                            Milestone 3 of 5 · Struktur
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                                        On track
                                    </span>
                                </div>
                                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                                    <div className="h-full w-3/5 rounded-full bg-[#FD1D1D]" />
                                </div>
                                <div className="mt-2 flex justify-between text-[10px] font-semibold text-neutral-400">
                                    <span>Rp 420.000.000 terverifikasi</span>
                                    <span>60% selesai</span>
                                </div>
                            </div>
                        </div>

                        <div className="absolute -left-4 top-8 hidden rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-xl sm:block">
                            <p className="flex items-center gap-2 text-[11px] font-black text-neutral-900">
                                <Wallet className="h-4 w-4 text-[#FD1D1D]" />
                                Escrow aktif
                            </p>
                            <p className="mt-1 text-[10px] font-semibold text-neutral-400">
                                Pembayaran menunggu persetujuan
                            </p>
                        </div>

                        <div className="absolute -right-3 bottom-24 hidden rounded-2xl border border-neutral-100 bg-white px-4 py-3 shadow-xl sm:block">
                            <p className="flex items-center gap-2 text-[11px] font-black text-neutral-900">
                                <Layers className="h-4 w-4 text-emerald-500" />
                                Ledger konsisten
                            </p>
                            <p className="mt-1 text-[10px] font-semibold text-neutral-400">
                                Tanpa pembulatan float
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-y border-neutral-100 bg-white py-6">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-4 px-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                        Dirancang untuk
                    </p>
                    {PROFESSIONAL_ROLES.map((role) => (
                        <span
                            key={role.label}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600"
                        >
                            <role.icon className="h-3.5 w-3.5 text-[#FD1D1D]" />
                            {role.label}
                        </span>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 py-24">
                <div className="grid items-center gap-16 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                            Satu ekosistem
                        </span>
                        <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-neutral-900 sm:text-4xl">
                            Semua pihak, satu versi kebenaran.
                        </h2>
                        <p className="mt-5 text-base leading-relaxed text-neutral-500">
                            Setiap peran melihat pekerjaan, dokumen, dan uang dari sudut yang sama. Tidak
                            ada penawaran yang hilang di chat, tidak ada pembayaran tanpa bukti.
                        </p>

                        <div className="mt-8 flex items-center gap-4 rounded-3xl border border-neutral-200/70 bg-white p-4 shadow-sm">
                            <div className="flex -space-x-3">
                                {PROFESSIONAL_ROLES.map((role) => (
                                    <span
                                        key={role.label}
                                        className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border-2 border-white bg-neutral-100"
                                    >
                                        <role.icon className="h-4 w-4 text-neutral-500" />
                                    </span>
                                ))}
                            </div>
                            <div>
                                <p className="text-sm font-extrabold tracking-tight text-neutral-900">
                                    7 peran profesional terverifikasi
                                </p>
                                <p className="text-xs text-neutral-500">
                                    Ditambah supplier, kurir, dan admin platform
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
                        {SOLUTIONS.map((item) => (
                            <div
                                key={item.title}
                                className="group rounded-3xl border border-neutral-100 bg-white p-7 transition duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-xl hover:shadow-red-500/5"
                            >
                                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-red-100/50 bg-red-50 text-[#FD1D1D] transition group-hover:scale-105">
                                    <item.icon className="h-6 w-6" />
                                </div>
                                <h3 className="text-lg font-bold text-neutral-900">{item.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="bg-white py-8">
                <div className="mx-auto max-w-7xl space-y-24 px-6 py-10">
                    <div id="showcase-professionals" className="scroll-mt-24 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
                        <div className="overflow-hidden rounded-3xl border border-neutral-100 shadow-lg">
                            <Image
                                src="/assets/project-1.webp"
                                alt="Tim proyek di lokasi konstruksi"
                                width={1400}
                                height={900}
                                sizes="(max-width: 1024px) 100vw, 50vw"
                                className="aspect-4/3 w-full object-cover"
                            />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                                Collaborative workspace
                            </span>
                            <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-neutral-900 sm:text-4xl">
                                Bidding Board dan Project Vault
                            </h2>
                            <p className="mt-4 text-base leading-relaxed text-neutral-500">
                                Bandingkan proposal, kirim undangan wawancara, tanda tangani kontrak, dan
                                simpan dokumen di satu tempat. Riwayat aktivitas membuat setiap keputusan
                                bisa ditelusuri.
                            </p>
                            <ul className="mt-6 grid gap-3 text-sm font-semibold text-neutral-700 sm:grid-cols-2">
                                {['Penawaran & negosiasi', 'Kontrak digital', 'Dokumen terkunci', 'Jejak audit'].map(
                                    (item) => (
                                        <li key={item} className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            {item}
                                        </li>
                                    ),
                                )}
                            </ul>
                        </div>
                    </div>

                    <div id="showcase-marketplace" className="scroll-mt-24 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
                        <div className="order-2 lg:order-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                                Building materials
                            </span>
                            <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-neutral-900 sm:text-4xl">
                                Supplier, penawaran, dan pengiriman
                            </h2>
                            <p className="mt-4 text-base leading-relaxed text-neutral-500">
                                Cari material dari supplier terverifikasi, minta penawaran, lalu ikuti
                                status pembayaran dan pengiriman. Kurir melihat pekerjaan yang tersedia
                                lewat Job Radar.
                            </p>
                            <ul className="mt-6 grid gap-3 text-sm font-semibold text-neutral-700 sm:grid-cols-2">
                                {['Etalase supplier', 'Stok real-time', 'Penawaran material', 'Job Radar'].map(
                                    (item) => (
                                        <li key={item} className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            {item}
                                        </li>
                                    ),
                                )}
                            </ul>
                        </div>
                        <div className="order-1 overflow-hidden rounded-3xl border border-neutral-100 shadow-lg lg:order-2">
                            <Image
                                src="/assets/materials-1.webp"
                                alt="Material konstruksi di lokasi"
                                width={1400}
                                height={900}
                                sizes="(max-width: 1024px) 100vw, 50vw"
                                className="aspect-4/3 w-full object-cover"
                            />
                        </div>
                    </div>

                    <div id="showcase-properties" className="scroll-mt-24 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
                        <div className="overflow-hidden rounded-3xl border border-neutral-100 shadow-lg">
                            <Image
                                src="/assets/home-2.webp"
                                alt="Interior rumah modern"
                                width={1400}
                                height={900}
                                sizes="(max-width: 1024px) 100vw, 50vw"
                                className="aspect-4/3 w-full object-cover"
                            />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                                Property marketplace
                            </span>
                            <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-neutral-900 sm:text-4xl">
                                Temukan rumah, lalu bangun dengan tim yang tepat
                            </h2>
                            <p className="mt-4 text-base leading-relaxed text-neutral-500">
                                Jelajahi properti dengan filter lokasi, harga, kamar, dan fasilitas.
                                Simpan favorit, ajukan pertanyaan ke pemilik, dan lanjutkan ke proses
                                desain serta konstruksi tanpa pindah platform.
                            </p>
                            <div className="mt-7 flex flex-wrap gap-2">
                                {['Filter lokasi', 'Simpan favorit', 'Tanya pemilik', 'Rencana renovasi'].map(
                                    (tag) => (
                                        <span
                                            key={tag}
                                            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700"
                                        >
                                            {tag}
                                        </span>
                                    ),
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="overflow-hidden border-y border-neutral-100 bg-white py-24">
                <div className="mx-auto max-w-7xl px-6">
                    <div className="grid items-start gap-16 lg:grid-cols-12">
                        <div className="space-y-6 text-center lg:col-span-5 lg:text-left">
                            <span className="inline-block rounded-full bg-red-50 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                                Dibangun untuk dipercaya
                            </span>
                            <h2 className="text-3xl font-black leading-[1.1] tracking-tight text-neutral-900 sm:text-4xl">
                                Transparansi yang bisa diperiksa, bukan janji.
                            </h2>
                            <p className="text-sm leading-relaxed text-neutral-500 sm:text-base">
                                Uang bergerak sebagai satuan minor integer, aturan escrow tinggal di domain
                                dan database, dan setiap aksi penting meninggalkan jejak.
                            </p>
                            <div className="mx-auto h-1 w-20 rounded-full bg-[#FD1D1D] lg:mx-0" />
                        </div>

                        <div className="grid grid-cols-1 gap-x-12 gap-y-12 sm:grid-cols-2 lg:col-span-7">
                            {FACTS.map((fact) => (
                                <div key={fact.label} className="text-center sm:text-left">
                                    <p className="text-5xl font-black tracking-tighter text-neutral-900 sm:text-6xl">
                                        {fact.value}
                                    </p>
                                    <h3 className="mt-3 text-sm font-black uppercase tracking-wider text-neutral-800">
                                        {fact.label}
                                    </h3>
                                    <p className="mt-1 text-xs font-semibold leading-relaxed text-neutral-400">
                                        {fact.desc}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 py-24">
                <div className="mx-auto mb-16 max-w-2xl text-center">
                    <span className="mb-3 block text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                        Alur kerja
                    </span>
                    <h2 className="text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
                        Empat tahap, dari posting sampai serah terima
                    </h2>
                </div>

                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                    {WORKFLOW.map((item) => (
                        <div
                            key={item.step}
                            className="flex flex-col justify-between rounded-3xl border border-neutral-100 bg-white p-7 shadow-sm transition hover:shadow-md"
                        >
                            <div>
                                <div className="mb-4 flex items-baseline gap-2">
                                    <span className="text-3xl font-black text-[#FD1D1D]">{item.step}</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                        Tahap
                                    </span>
                                </div>
                                <h3 className="text-base font-extrabold text-neutral-900">{item.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-neutral-500">{item.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="border-y border-neutral-100 bg-white py-24">
                <div className="mx-auto max-w-4xl px-6">
                    <div className="mb-14 text-center">
                        <span className="mb-3 block text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                            FAQ
                        </span>
                        <h2 className="text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
                            Anda tanya, kami jawab
                        </h2>
                    </div>
                    <LandingFaq faqs={FAQS.map((faq) => ({ q: faq.q, a: faq.a }))} />
                </div>
            </section>

            <section className="relative overflow-hidden bg-neutral-950 py-24">
                <Image
                    src="/assets/team-1.webp"
                    alt=""
                    width={1400}
                    height={900}
                    sizes="100vw"
                    className="absolute inset-0 h-full w-full object-cover opacity-25"
                />
                <div className="absolute inset-0 bg-linear-to-r from-neutral-950 via-neutral-950/85 to-neutral-950/40" />
                <div className="relative mx-auto max-w-7xl px-6">
                    <div className="max-w-xl">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FD1D1D]">
                            Mulai dari sini
                        </span>
                        <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
                            Rumah impian dimulai dengan rencana yang jelas.
                        </h2>
                        <p className="mt-4 text-sm leading-relaxed text-neutral-300 sm:text-base">
                            Buat proyek, temukan profesional, dan kelola setiap milestone dengan catatan
                            yang bisa dipercaya.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link
                                href="/register"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FD1D1D] px-7 py-4 text-sm font-bold text-white transition hover:bg-red-600"
                            >
                                Buat akun owner
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                href="/pro/register"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-7 py-4 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15"
                            >
                                Daftar sebagai profesional
                            </Link>
                        </div>
                        <p className="mt-6 flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
                            <Smartphone className="h-3.5 w-3.5" />
                            Bisa dipasang ke home screen — tanpa app store.
                        </p>
                    </div>
                </div>
            </section>

            <footer className="border-t border-neutral-800 bg-neutral-950 px-6 py-16 text-neutral-400">
                <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 pb-12 md:grid-cols-2 lg:grid-cols-12">
                    <div className="space-y-5 lg:col-span-5">
                        <h2 className="text-3xl font-black tracking-tighter text-white">
                            4Ceria<span className="text-[#FD1D1D]">.</span>
                        </h2>
                        <p className="max-w-sm text-sm leading-relaxed text-neutral-500">
                            Construction coordination and real-estate marketplace. Satu workspace untuk
                            owner, profesional, supplier, dan kurir.
                        </p>
                        <p className="text-xs font-semibold text-neutral-600">
                            Portfolio reference implementation. Semua data adalah data demo.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-8 lg:col-span-4">
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Produk</h3>
                            <ul className="space-y-2 text-sm">
                                <li>
                                    <Link href="/dashboard/houses" className="transition hover:text-white">
                                        Cari rumah
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/dashboard/architects" className="transition hover:text-white">
                                        Cari profesional
                                    </Link>
                                </li>
                                <li>
                                    <Link
                                        href="/dashboard/marketplace-materials"
                                        className="transition hover:text-white"
                                    >
                                        Material
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/help" className="transition hover:text-white">
                                        Pusat bantuan
                                    </Link>
                                </li>
                            </ul>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Akun</h3>
                            <ul className="space-y-2 text-sm">
                                <li>
                                    <Link href="/login" className="transition hover:text-white">
                                        Masuk
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/register" className="transition hover:text-white">
                                        Daftar owner
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/pro/register" className="transition hover:text-white">
                                        Daftar profesional
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/forgot-password" className="transition hover:text-white">
                                        Lupa password
                                    </Link>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="space-y-3 lg:col-span-3">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Platform</h3>
                        <p className="text-sm leading-relaxed text-neutral-500">
                            Go · PostgreSQL · Next.js. Escrow dengan satuan minor integer, ledger
                            PostgreSQL, dan PWA tanpa app store.
                        </p>
                        <a
                            href="https://github.com/davinakmalyasha/4Ceria-4C-"
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-300 transition hover:text-white"
                        >
                            Lihat repository
                            <ArrowRight className="h-3.5 w-3.5" />
                        </a>
                    </div>
                </div>

                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-neutral-800 pt-8 text-xs text-neutral-600 sm:flex-row">
                    <p>© {new Date().getFullYear()} 4Ceria. Demo project.</p>
                    <p>Creative, Comprehensive, Collaborative &amp; Cool.</p>
                </div>
            </footer>
        </div>
    );
}
