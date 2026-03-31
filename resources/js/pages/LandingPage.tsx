import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
    const { user, isLoading } = useAuth();
    // FAQ Toggle state
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const toggleFaq = (index: number) => {
        setOpenFaq(openFaq === index ? null : index);
    };

    // Scroll effect for sticky and statistics
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

    const reviews = [
        { date: '29 Desember, 2025', text: 'Lorem ipsum dolor sit amet consectetur...', author: 'DavinGans' },
        { date: '30 Desember, 2025', text: 'Obcaecati at eaque quas officiis...', author: 'JohnDoe' },
        { date: '31 Desember, 2025', text: 'Tenetur magnam sunt cupiditate...', author: 'JaneDoe' },
        { date: '1 Januari, 2026', text: 'Laborum, iusto minima.', author: 'User123' },
        { date: '1 Januari, 2026', text: 'Laborum, iusto minima.', author: 'User123' },
    ];
    const margins = ['10%', '45%', '14%', '47%', '14%'];

    return (
        <div className="min-h-screen bg-white">
            {!isLoading && user && <Navigate to="/dashboard" replace />}
            <Navbar />

            <div className="dalem">
                <div className="header">
                    <h3>All In One Architechture Website</h3>
                    <div className="kalimat">
                        <h2><span>4C</span>reative, Compherensive</h2>
                        <h1>&amp; Cool Construction</h1>
                    </div>
                </div>

                <div className="bagiankeduaa">
                    <div className="logossponsor">
                        {[1, 2, 3].map((i) => (
                            <div className="sponsorslide" key={i}>
                                <img src="/storage/Assets/google.png" width="60" height="60" alt="Google" />
                                <img src="/storage/Assets/bri.png" alt="BRI" />
                                <img src="/storage/Assets/mandiri.png" alt="Mandiri" />
                                <img src="/storage/Assets/cimbniaga.png" width="200" height="10" alt="CIMB" />
                                <img src="/storage/Assets/kominfo.png" width="70" height="70" alt="Kominfo" />
                                <img src="/storage/Assets/btn.png" alt="BTN" />
                                <img src="/storage/Assets/badanpertahanan.png" alt="Badan Pertahanan" />
                                <img src="/storage/Assets/pupr.png" alt="PUPR" />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="kelompokKedua">
                    <div className="bagianKiribgmerah">
                        <div className="kalimatKiriAtas">
                            <h1>Solusi baru untuk jual beli rumah yang lebih mudah</h1>
                            <p>Pilar utama kami untuk menciptakan layanan jual beli terbaik</p>
                        </div>
                        <div className="kalimatKiriBawah">
                            <img src="/storage/Assets/Rating.png" width="40" height="40" alt="Rating" />
                            <p>Dinilai <span>4,9</span> dari lebih dari <span>600</span> ulasan</p>
                        </div>
                    </div>
                    <div className="bagianKananbgmerah">
                        <div className="indukKanan1">
                            <div className="kanansatu">
                                <div className="judulkanansatu">
                                    <img src="/storage/Assets/effortless.png" width="40" height="40" alt="Effortless" />
                                    <h2>Effortless</h2>
                                </div>
                                <div className="textkanansatu">
                                    <p>Navigasi mudah tanpa hambatan, mempermudah pengalaman Anda.</p>
                                </div>
                                <img src="/storage/Assets/effortless.jpg" style={{ width: '100%', height: '70px', objectFit: 'cover' }} alt="Effortless cover" />
                            </div>
                            <hr />
                            <div className="kananDua">
                                <div className="judulkanansatu">
                                    <img src="/storage/Assets/user-friendly.png" width="40" height="40" alt="User friendly" />
                                    <h2>User-friendly</h2>
                                </div>
                                <div className="textkanansatu">
                                    <p>Desain sederhana dan intuitif, memudahkan akses kapan saja.</p>
                                </div>
                                <img src="/storage/Assets/4CTeam.jpg" style={{ width: '100%', height: '70px', objectFit: 'cover' }} alt="Team" />
                            </div>
                        </div>
                        <div className="indukKanan2">
                            <div className="kanansatu1">
                                <div className="judulkanansatu1">
                                    <img src="/storage/Assets/fast.png" width="40" height="40" alt="Fast" />
                                    <h2>Cepat</h2>
                                </div>
                                <div className="textkanansatu1">
                                    <p>Proses instan untuk transaksi yang lebih efisien dan lancar.</p>
                                </div>
                                <img src="/storage/Assets/4CTeam.jpg" style={{ width: '100%', height: '70px', objectFit: 'cover' }} alt="Team" />
                            </div>
                            <hr />
                            <div className="kananDua1">
                                <div className="judulkanansatu1">
                                    <img src="/storage/Assets/aman.png" width="40" height="40" alt="Secure" />
                                    <h2>Aman</h2>
                                </div>
                                <div className="textkanansatu1">
                                    <p>Keamanan terjamin dengan sistem proteksi data yang kuat.</p>
                                </div>
                                <img src="/storage/Assets/4CTeam.jpg" style={{ width: '100%', height: '70px', objectFit: 'cover' }} alt="Team" />
                            </div>
                        </div>
                    </div>
                </div>

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
