import React, { useEffect, useState } from 'react';
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
    Search,
    UserPlus,
    Hammer,
    ShoppingBag
} from 'lucide-react';

export default function LandingPage() {
    const { user, isLoading } = useAuth();
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const toggleFaq = (index: number) => {
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

    useEffect(() => {
        const stickySections = Array.from(document.querySelectorAll('.sticky') as NodeListOf<HTMLElement>);
        const statistics = document.querySelectorAll('.statistic');

        const handleScroll = () => {
            stickySections.forEach((section) => {
                const parent = section.parentElement;
                if (!parent) return;
                const offsetTop = parent.offsetTop;
                const scrollSection = section.querySelector('.scroll_section') as HTMLElement;
                if (!scrollSection) return;

                let percentage = ((window.scrollY - offsetTop) / window.innerHeight) * 100;
                percentage = percentage < 0 ? 0 : percentage > 400 ? 400 : percentage;
                scrollSection.style.transform = `translate3d(${-percentage}vw, 0, 0)`;
            });
        };

        window.addEventListener('scroll', handleScroll);

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('show');
                    }
                });
            },
            { threshold: 0.4 }
        );

        statistics.forEach((stat) => observer.observe(stat));

        return () => {
            window.removeEventListener('scroll', handleScroll);
            observer.disconnect();
        };
    }, []);

    const solutions = [
        {
            title: "Effortless",
            desc: "Navigasi mudah tanpa hambatan, mempermudah pengalaman Anda.",
            icon: <MousePointerClick className="w-6 h-6 text-[#FD1D1D]" />,
            bg: "bg-red-50/50"
        },
        {
            title: "User-friendly",
            desc: "Desain sederhana dan intuitif, memudahkan akses kapan saja.",
            icon: <Users className="w-6 h-6 text-[#FD1D1D]" />,
            bg: "bg-blue-50/50"
        },
        {
            title: "Cepat",
            desc: "Proses instan untuk transaksi yang lebih efisien dan lancar.",
            icon: <Zap className="w-6 h-6 text-[#FD1D1D]" />,
            bg: "bg-yellow-50/50"
        },
        {
            title: "Aman",
            desc: "Keamanan terjamin dengan sistem proteksi data yang kuat.",
            icon: <ShieldCheck className="w-6 h-6 text-[#FD1D1D]" />,
            bg: "bg-green-50/50"
        }
    ];

    const reviews = [
        { date: '29 Desember, 2025', text: 'Lorem ipsum dolor sit amet consectetur...', author: 'DavinGans' },
        { date: '30 Desember, 2025', text: 'Obcaecati at eaque quas officiis...', author: 'JohnDoe' },
        { date: '31 Desember, 2025', text: 'Tenetur magnam sunt cupiditate...', author: 'JaneDoe' },
        { date: '1 Januari, 2026', text: 'Laborum, iusto minima.', author: 'User123' },
        { date: '1 Januari, 2026', text: 'Laborum, iusto minima.', author: 'User123' },
    ];
    const margins = ['10%', '45%', '14%', '47%', '14%'];

    return (
        <div className="min-h-screen bg-[var(--background)] selection:bg-red-100 selection:text-red-900">
            {!isLoading && user && <Navigate to="/dashboard" replace />}
            <Navbar />

            <div className="dalem">
                {/* Hero Section */}
                <section className="header relative px-6 text-center overflow-hidden flex items-center justify-center min-h-[70vh] py-12">

                    <motion.div 
                        variants={stagger}
                        initial="initial"
                        animate="animate"
                        className="relative z-10 max-w-4xl mx-auto"
                    >
                        <motion.span 
                            variants={fadeInUp}
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 text-[#FD1D1D] text-sm font-bold tracking-wide mb-8 border border-red-100/50"
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            All In One Construction Platform
                        </motion.span>

                        <motion.h1 
                            variants={fadeInUp}
                            className="text-5xl md:text-7xl font-black text-neutral-900 leading-[1.1] tracking-tight mb-6"
                        >
                            <span className="text-[#FD1D1D]">4C</span>reative, Comprehensive <br />
                            <span className="text-neutral-400">&amp;</span> Cool Construction
                        </motion.h1>

                        <motion.p 
                            variants={fadeInUp}
                            className="text-lg md:text-xl text-neutral-500 max-w-2xl mx-auto mb-10 leading-relaxed"
                        >
                            The complete platform to legalize, design, build, furnish, and manage your dream home — all in one place.
                        </motion.p>

                        <motion.div 
                            variants={fadeInUp}
                            className="flex flex-col sm:flex-row items-center justify-center gap-4"
                        >
                            <Link to="/register" className="w-full sm:w-auto px-8 py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-neutral-200">
                                Get Started Free
                            </Link>
                            <Link to="/pro/register" className="w-full sm:w-auto px-8 py-4 bg-white text-neutral-900 border border-neutral-200 rounded-2xl font-bold hover:border-[#FD1D1D] hover:text-[#FD1D1D] transition-all flex items-center justify-center gap-2">
                                Become a Partner <ArrowRight className="w-4 h-4" />
                            </Link>
                        </motion.div>
                    </motion.div>
                </section>

                {/* Logo Ticker Section */}
                <div className="w-full bg-[var(--background)] py-4 px-6">
                    <div className="logossponsor">
                        {[1, 2].map((group) => (
                            <div className="sponsorslide" key={group}>
                                <img src="/storage/Assets/google.png" alt="Google" />
                                <img src="/storage/Assets/bri.png" alt="BRI" />
                                <img src="/storage/Assets/mandiri.png" alt="Mandiri" />
                                <img src="/storage/Assets/cimbniaga.png" alt="CIMB" />
                                <img src="/storage/Assets/kominfo.png" alt="Kominfo" />
                                <img src="/storage/Assets/btn.png" alt="BTN" />
                                <img src="/storage/Assets/badanpertahanan.png" alt="Badan Pertahanan" />
                                <img src="/storage/Assets/pupr.png" alt="PUPR" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Solutions Section */}
                <section className="py-24 px-6 w-full max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-20 items-center">
                        <motion.div 
                            initial={{ opacity: 0, x: -30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8 }}
                        >
                            <h2 className="text-4xl md:text-5xl font-black text-neutral-900 leading-tight tracking-tight mb-6">
                                Solusi baru untuk jual beli rumah yang lebih mudah
                            </h2>
                            <p className="text-lg text-neutral-500 leading-relaxed mb-10">
                                Pilar utama kami untuk menciptakan layanan jual beli terbaik dengan pengalaman pengguna yang luar biasa.
                            </p>
                            
                            <div className="flex items-center gap-4 p-6 bg-neutral-50 rounded-3xl border border-neutral-100 w-fit">
                                <div className="flex -space-x-3">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-neutral-200 overflow-hidden">
                                            <img src={`https://i.pravatar.cc/100?u=${i}`} alt="user" />
                                        </div>
                                    ))}
                                </div>
                                <div className="pr-4">
                                    <p className="text-sm font-bold text-neutral-900 tracking-tight">4.9/5 Rating</p>
                                    <p className="text-xs text-neutral-500">From over 600+ happy clients</p>
                                </div>
                            </div>
                        </motion.div>

                        <div className="grid sm:grid-cols-2 gap-4">
                            {solutions.map((item, index) => (
                                <motion.div 
                                    key={index}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                    className="group p-8 bg-white border border-neutral-100 rounded-[32px] hover:border-[#FD1D1D] hover:shadow-2xl hover:shadow-red-500/5 transition-all duration-300"
                                >
                                    <div className={`w-14 h-14 ${item.bg} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                                        {item.icon}
                                    </div>
                                    <h3 className="text-xl font-bold text-neutral-900 mb-2 group-hover:text-[#FD1D1D] transition-colors">{item.title}</h3>
                                    <p className="text-sm text-neutral-500 leading-relaxed">{item.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                <div className="kelompokKeempat1">
                    <div className="kiriKelompok4">
                        <img src="/storage/Assets/4CTeam.jpg" width="630" height="auto" alt="Presentation" />
                    </div>
                    <div className="kananKelompok4">
                        <h4>Cari rumah</h4>
                        <h1>Rumah Yang Diinginkan</h1>
                        <h5>Temukan rumah idaman Anda dengan mudah melalui platform kami. Kami menyediakan berbagai pilihan properti yang sesuai dengan kebutuhan dan anggaran Anda.</h5>
                    </div>
                </div>

                <div className="kelompokKeempat2">
                    <div className="kananKelompok4">
                        <h4>Jual rumah</h4>
                        <h1>Bernegosiasi</h1>
                        <h5>Jual properti Anda dengan cepat dan aman. Platform kami mempertemukan Anda dengan pembeli potensial dan memfasilitasi proses negosiasi yang transparan.</h5>
                    </div>
                    <div className="kiriKelompok4">
                        <img src="/storage/Assets/4CTeam.jpg" width="630" height="auto" alt="Presentation" />
                    </div>
                </div>

                <div className="kelompokKeempat1">
                    <div className="kiriKelompok4">
                        <img src="/storage/Assets/4CTeam.jpg" width="630" height="auto" alt="Presentation" />
                    </div>
                    <div className="kananKelompok4">
                        <h4>Cari Arsitek</h4>
                        <h1>Arsitek Yang Diinginkan</h1>
                        <h5>Temukan arsitek profesional untuk merancang rumah impian Anda. Lihat portofolio dan pilih arsitek yang gaya desainnya paling sesuai dengan visi Anda.</h5>
                    </div>
                </div>

                <div className="kelompokKeempat2">
                    <div className="kananKelompok4">
                        <h4>Beli Bahan Bangunan</h4>
                        <h1>Untuk Kebutuhan Rumah Anda</h1>
                        <h5>Dapatkan bahan bangunan berkualitas dengan harga terbaik dari berbagai supplier terpercaya. Kami mempermudah Anda dalam memenuhi kebutuhan konstruksi.</h5>
                    </div>
                    <div className="kiriKelompok4">
                        <img src="/storage/Assets/4CTeam.jpg" width="630" height="auto" alt="Presentation" />
                    </div>
                </div>

                <div className="sticky_parent" style={{ width: '100%', backgroundColor: '#1e1e1e' }}>
                    <div className="sticky">
                        <div className="scroll_section">
                            <div className="statistic">
                                <h1><span className="counter">10,000</span> + <br />Rumah Terjual</h1>
                            </div>
                            <div className="statistic">
                                <h1><span className="counter">20.000.000</span> + <br />Pengguna Aktif</h1>
                            </div>
                            <div className="statistic">
                                <h1><span className="counter">120.000</span> + <br />Agen Terdaftar</h1>
                            </div>
                            <div className="statistic">
                                <h1><span className="counter">4</span> <br />Listing Properti</h1>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="faq-container">
                    <div className="faq-header">
                        <h3 className="h3FAQ">Masih ragu kenapa harus melakukan jual beli rumah di 4C? Kami punya jawabannya!</h3>
                    </div>
                    <h1 className="h1FAQ">ANDA TANYA, KAMI JAWAB</h1>

                    {[
                        { q: 'Bagaimana cara mendaftarkan properti saya untuk dijual?', a: 'Anda dapat mendaftarkan properti dengan membuat akun di situs tersebut, lalu mengunggah detail properti yang ingin dijual, termasuk foto, deskripsi, dan harga yang ditawarkan.' },
                        { q: 'Apakah ada biaya atau komisi untuk penjualan properti?', a: 'Tidak, website ini tidak mengenakan biaya apapun untuk mendaftarkan atau menjual properti. Anda bisa langsung memposting rumah Anda tanpa biaya tambahan.' },
                        { q: 'Bagaimana cara mencari properti yang sesuai dengan kebutuhan saya?', a: 'Anda dapat menggunakan fitur pencarian yang tersedia di situs, dengan menyaring berdasarkan lokasi, harga, tipe properti, dan kriteria lainnya untuk menemukan properti yang sesuai.' },
                        { q: 'Bagaimana cara menghubungi penjual atau agen properti?', a: 'Setelah menemukan properti yang diminati, Anda dapat menghubungi penjual atau agen melalui kontak yang disediakan di listing properti tersebut, baik melalui telepon, email, atau fitur pesan langsung di situs.' },
                        { q: 'Seberapa aman data akun dan nomor telepon saya?', a: 'Data akun dan nomor telepon Anda aman karena kami menggunakan sistem keamanan yang melindungi informasi pribadi pengguna. Kami tidak membagikan data pribadi kepada pihak ketiga tanpa izin Anda.' }
                    ].map((faq, index) => (
                        <div className={`faq-item ${openFaq === index ? 'active' : ''}`} onClick={() => toggleFaq(index)} key={index}>
                            <div className="faq-question">
                                <span>{faq.q}</span>
                                <svg className="arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                </svg>
                            </div>
                            <div className="faq-answer">
                                <p>{faq.a}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="kelompokKetiga">
                    <h1 className="stickyTitle">Testimonial User</h1>
                    <div className="geserKekiriReview">
                        {reviews.map((review, index) => (
                            <div className="kotakReview" style={{ marginLeft: margins[index % margins.length] }} key={index}>
                                <h4>{review.date}</h4>
                                <h2>{review.text}</h2>
                                <h5>{review.author}</h5>
                            </div>
                        ))}
                    </div>
                    <div className="adniasasdasd" style={{ height: '750px', width: '100%', backgroundColor: '#ffffff', marginTop: '360px', marginBottom: '90px' }}>
                        <img src="/storage/Assets/4CTeam.jpg" style={{ objectFit: 'cover', width: '100%', height: '100%' }} alt="Team" />
                    </div>
                </div>

                <div className="kelompokKe6">
                    <h1>Wujudkan Rumah Impianmu – Beli, Bangun, atau Jual!</h1>
                    <div className="bawahKelompok6">
                        <div className="kiriBawahKelompok6">
                            <div className="tengahKelompok6">
                                <img src="/storage/Assets/Logo4C.png" alt="Logo" />
                                <h3>4C 4Construction By 4C Team</h3>
                            </div>
                            <div className="textIsiKelompok6">
                                <img src="/storage/Assets/4CTeam.jpg" alt="Team" />
                                <p>Dapatkan rumah impian dengan kualitas premium dari tim berpengalaman.<span> Dengan proses yang mudah dan transparan, kami memastikan setiap hunian tidak hanya sesuai kebutuhan Anda, tetapi juga menghadirkan nilai terbaik dalam setiap langkahnya.</span></p>
                            </div>
                        </div>
                        <a href="/register">
                            <div className="tombolCta">
                                <div className="text-wrapper">
                                    <h3>Saya Tertarik!</h3>
                                    <div className="hover-text">Saya Tertarik!</div>
                                </div>
                            </div>
                        </a>
                    </div>
                </div>

                <footer>
                    <div className="atasFooter">
                        <div className="footerStart">
                            <h2>4Ceria</h2>
                            <h3>Made By Davin, Riza, Daffa And pen</h3>
                        </div>
                        <div className="footerList">
                            <div className="isiFooterList">
                                <ul>
                                    <li>Company</li>
                                    <li>About Us</li>
                                    <li>Products</li>
                                    <li>Contacts</li>
                                </ul>
                            </div>
                            <div className="isiFooterList">
                                <ul>
                                    <li>Company</li>
                                    <li>About Us</li>
                                    <li>Products</li>
                                    <li>Contacts</li>
                                </ul>
                            </div>
                        </div>
                        <div className="footerEnd">
                            <h2>Contact Us</h2>
                            <div className="kirimPesan">
                                <input type="text" placeholder="Kirim Pesan" />
                            </div>
                            <button>Kirim Pesan</button>
                        </div>
                    </div>
                    <div className="bawahFooter">
                        <ul className="term">
                            <li>©2025 | 4Ceria</li>
                            <li>Privacy Policy</li>
                            <li>Cookie Policy</li>
                            <li>Terms of Service</li>
                        </ul>
                        <ul className="logoSosmed">
                            <li>
                                <a href="#" target="_blank" rel="noreferrer">
                                    <img src="/storage/Assets/instagram.png" width="30" height="30" alt="IG" />
                                </a>
                            </li>
                            <li>
                                <a href="#" target="_blank" rel="noreferrer">
                                    <img src="/storage/Assets/linkedIn.png" width="30" height="30" alt="LinkedIn" />
                                </a>
                            </li>
                            <li>
                                <a href="#" target="_blank" rel="noreferrer">
                                    <img src="/storage/Assets/youtube.png" width="30" height="30" alt="YT" />
                                </a>
                            </li>
                        </ul>
                    </div>
                </footer>
            </div>
        </div>
    );
}
