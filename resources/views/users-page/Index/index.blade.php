<x-app-layout>
    <x-slot:slot>
        <link rel="stylesheet" href="{{URL::asset('css/index.css')}}">
        <div class="min-h-screen bg-white ">
            @if ($flashMessage)
            <div id="success-message">
                {{ $flashMessage }}
                <div id="progress-bar"></div>
            </div>
            @endif

            <div class="navbar">
                <!-- Navbar content -->
            </div>

            <div class="dalem">
                <div class="header">
                <h3>All In One Architechture Website</h3>
                    <div class="kalimat">
                        <h2><span>4C</span>reative, Compherensive</h2>
                        <h1>& Cool Construction</h1>
                    </div>
                    
                </div>

                <div class="bagiankeduaa">
                    <div class="logossponsor">
                        <div class="sponsorslide">
                            <img src="{{ asset('storage/Assets/google.png') }}" width="60px" height="60px" alt="">
                            <img src="{{ asset('storage/Assets/bri.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/mandiri.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/cimbniaga.png') }}" width="200px" height="10px" alt="">
                            <img src="{{ asset('storage/Assets/kominfo.png') }}" width="70px" height="70px" alt="">
                            <img src="{{ asset('storage/Assets/btn.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/badanpertahanan.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/pupr.png') }}" alt="">

                        </div>
                        <div class="sponsorslide">
                            <img src="{{ asset('storage/Assets/google.png') }}" width="60px" height="60px" alt="">
                            <img src="{{ asset('storage/Assets/bri.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/mandiri.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/cimbniaga.png') }}" width="200px" height="10px" alt="">
                            <img src="{{ asset('storage/Assets/kominfo.png') }}" width="70px" height="70px" alt="">
                            <img src="{{ asset('storage/Assets/btn.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/badanpertahanan.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/pupr.png') }}" alt="">
                        </div>
                        <div class="sponsorslide">
                            <img src="{{ asset('storage/Assets/google.png') }}" width="60px" height="60px" alt="">
                            <img src="{{ asset('storage/Assets/bri.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/mandiri.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/cimbniaga.png') }}" width="200px" height="10px" alt="">
                            <img src="{{ asset('storage/Assets/kominfo.png') }}" width="70px" height="70px" alt="">
                            <img src="{{ asset('storage/Assets/btn.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/badanpertahanan.png') }}" alt="">
                            <img src="{{ asset('storage/Assets/pupr.png') }}" alt="">
                        </div>
                    </div>
                </div>

                <div class="kelompokKedua">
                    <div class="bagianKiribgmerah">
                        <div class="kalimatKiriAtas">
                            <h1>Solusi baru untuk jual beli rumah yang lebih mudah</h1>
                            <p>Pilar utama kami untuk menciptakan layanan jual beli terbaik</p>
                        </div>
                        <div class="kalimatKiriBawah">
                            <img src="{{ asset('storage/Assets/Rating.png') }}" width="40px" height="40px" />
                            <p>Dinilai <span>4,9</span> dari lebih dari <span>600</span> ulasan</p>
                        </div>
                    </div>
                    <div class="bagianKananbgmerah">
                        <div class="indukKanan1">
                            <div class="kanansatu">
                                <div class="judulkanansatu">
                                    <img src="{{ asset('storage/Assets/effortless.png') }}" width="40px" height="40px" />
                                    <h2>Effortless</h2>
                                </div>
                                <div class="textkanansatu">
                                    <p>Navigasi mudah tanpa hambatan, mempermudah pengalaman Anda.</p>
                                </div>
                                <img src="{{ asset('storage/Assets/effortless.jpg') }}" width="100%" height="70px" style="object-fit: cover;" />
                            </div>
                            <hr>
                            <div class="kananDua">
                                <div class="judulkanansatu">
                                    <img src="{{ asset('storage/Assets/user-friendly.png') }}" width="40px" height="40px" />
                                    <h2>User-friendly</h2>
                                </div>
                                <div class="textkanansatu">
                                    <p>Desain sederhana dan intuitif, memudahkan akses kapan saja.</p>
                                </div>
                                <img src="{{ asset('storage/Assets/4CTeam.jpg') }}" width="100%" height="70px" style="object-fit: cover;" />
                            </div>
                        </div>
                        <div class="indukKanan2">
                            <div class="kanansatu1">
                                <div class="judulkanansatu1">
                                    <img src="{{ asset('storage/Assets/fast.png') }}" width="40px" height="40px" />
                                    <h2>Cepat</h2>
                                </div>
                                <div class="textkanansatu1">
                                    <p>Proses instan untuk transaksi yang lebih efisien dan lancar.</p>
                                </div>
                                <img src="{{ asset('storage/Assets/4CTeam.jpg') }}" width="100%" height="70px" style="object-fit: cover;" />
                            </div>
                            <hr>
                            <div class="kananDua1">
                                <div class="judulkanansatu1">
                                    <img src="{{ asset('storage/Assets/aman.png') }}" width="40px" height="40px" />
                                    <h2>Aman</h>
                                </div>
                                <div class="textkanansatu1">
                                    <p>Keamanan terjamin dengan sistem proteksi data yang kuat.</p>
                                </div>
                                <img src="{{ asset('storage/Assets/4CTeam.jpg') }}" width="100%" height="70px" style="object-fit: cover;" />
                            </div>
                        </div>
                    </div>
                </div>


                <div class="kelompokKeempat1">
                    <div class="kiriKelompok4">
                        <img src="{{ asset('storage/Assets/4CTeam.jpg') }}" width="630px" height="auto" />
                    </div>

                    <div class="kananKelompok4">
                        <h4>Cari rumah</h4>
                        <h1>Rumah Yang Diinginkan</h1>
                        <h5>Lorem ipsum dolor sit amet consectetur adipisicing elit. Nisi nihil quam cumque aliquid quo, libero perferendis laudantium! Iusto temporibus laborum in, modi illo corrupti dolores non veniam explicabo nihil. Sequi.</h5>
                    </div>
                </div>

                <div class="kelompokKeempat2">
                    <div class="kananKelompok4">
                        <h4>Jual rumah</h4>
                        <h1>Bernegosiasi</h1>
                        <h5>Lorem ipsum dolor sit amet consectetur adipisicing elit. Nisi nihil quam cumque aliquid quo, libero perferendis laudantium! Iusto temporibus laborum in, modi illo corrupti dolores non veniam explicabo nihil. Sequi.</h5>
                    </div>

                    <div class="kiriKelompok4">
                        <img src="{{ asset('storage/Assets/4CTeam.jpg') }}" width="630px" height="auto" />
                    </div>
                </div>

                <div class="kelompokKeempat1">
                    <div class="kiriKelompok4">
                        <img src="{{ asset('storage/Assets/4CTeam.jpg') }}" width="630px" height="auto" />
                    </div>

                    <div class="kananKelompok4">
                        <h4>Cari Arsitek</h4>
                        <h1>Arsitek Yang Diinginkan</h1>
                        <h5>Lorem ipsum dolor sit amet consectetur adipisicing elit. Nisi nihil quam cumque aliquid quo, libero perferendis laudantium! Iusto temporibus laborum in, modi illo corrupti dolores non veniam explicabo nihil. Sequi.</h5>
                    </div>
                </div>

                <div class="kelompokKeempat2">
                    <div class="kananKelompok4">
                        <h4>Beli Bahan Bangunan</h4>
                        <h1>Untuk Kebutuhan Rumah Anda</h1>
                        <h5>Lorem ipsum dolor sit amet consectetur adipisicing elit. Nisi nihil quam cumque aliquid quo, libero perferendis laudantium! Iusto temporibus laborum in, modi illo corrupti dolores non veniam explicabo nihil. Sequi.</h5>
                    </div>

                    <div class="kiriKelompok4">
                        <img src="{{ asset('storage/Assets/4CTeam.jpg') }}" width="630px" height="auto" />
                    </div>

                </div>


                <div class="sticky_parent" style="width: 100%; background-color: #1e1e1e;">
                    <div class="sticky">
                        <div class="scroll_section">
                            <div class="statistic">
                                <h1><span class="counter">10,000</span> + <br>Rumah Terjual</h1>
                            </div>
                            <div class="statistic">
                                <h1><span class="counter">20.000.000</span> + <br>Pengguna Aktif</h1>
                            </div>
                            <div class="statistic">
                                <h1><span class="counter">120.000</span> + <br>Agen Terdaftar</h1>
                            </div>
                            <div class="statistic">
                                <h1><span class="counter">4</span> <br>Listing Properti</h1>
                            </div>
                        </div>
                    </div>
                </div>


                <div class="faq-container">
                    <div class="faq-header">
                        <h3 class="h3FAQ">Masih ragu kenapa harus melakukan jual beli rumah di 4C? Kami punya jawabannya!</h3>
                        <div class="faq-arrow">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="white" class="arrow-icon">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                    </div>
                    <h1 class="h1FAQ">ANDA TANYA, KAMI JAWAB</h1>

                    <div class="faq-item" onclick="toggleFAQ(this)">
                        <div class="faq-question">
                            <span>Bagaimana cara mendaftarkan properti saya untuk dijual?</span>
                            <svg class="arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                        <div class="faq-answer">
                            <p>Anda dapat mendaftarkan properti dengan membuat akun di situs tersebut, lalu mengunggah detail properti yang ingin dijual, termasuk foto, deskripsi, dan harga yang ditawarkan.</p>
                        </div>
                    </div>

                    <div class="faq-item" onclick="toggleFAQ(this)">
                        <div class="faq-question">
                            <span>Apakah ada biaya atau komisi untuk penjualan properti?</span>
                            <svg class="arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                        <div class="faq-answer">
                            <p>Tidak, website ini tidak mengenakan biaya apapun untuk mendaftarkan atau menjual properti. Anda bisa langsung memposting rumah Anda tanpa biaya tambahan.</p>
                        </div>
                    </div>
                    <div class="faq-item" onclick="toggleFAQ(this)">
                        <div class="faq-question">
                            <span>Bagaimana cara mencari properti yang sesuai dengan kebutuhan saya?</span>
                            <svg class="arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                        <div class="faq-answer">
                            <p>Anda dapat menggunakan fitur pencarian yang tersedia di situs, dengan menyaring berdasarkan lokasi, harga, tipe properti, dan kriteria lainnya untuk menemukan properti yang sesuai.</p>
                        </div>
                    </div>
                    <div class="faq-item" onclick="toggleFAQ(this)">
                        <div class="faq-question">
                            <span>Bagaimana cara menghubungi penjual atau agen properti?</span>
                            <svg class="arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                        <div class="faq-answer">
                            <p>Setelah menemukan properti yang diminati, Anda dapat menghubungi penjual atau agen melalui kontak yang disediakan di listing properti tersebut, baik melalui telepon, email, atau fitur pesan langsung di situs.</p>
                        </div>
                    </div>
                    <div class="faq-item" onclick="toggleFAQ(this)">
                        <div class="faq-question">
                            <span>Seberapa aman data akun dan nomor telepon saya?</span>
                            <svg class="arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                        <div class="faq-answer">
                            <p>Data akun dan nomor telepon Anda aman karena kami menggunakan sistem keamanan yang melindungi informasi pribadi pengguna. Kami tidak membagikan data pribadi kepada pihak ketiga tanpa izin Anda.
                            </p>
                        </div>
                    </div>
                </div>


                <div class="kelompokKetiga">
                    <h1 class="stickyTitle">Testimonial User</h1>

                    <div class="geserKekiriReview">
                        <?php
                        $reviews = [
                            ["date" => "29 Desember, 2025", "text" => "Lorem ipsum dolor sit amet consectetur...", "author" => "DavinGans"],
                            ["date" => "30 Desember, 2025", "text" => "Obcaecati at eaque quas officiis...", "author" => "JohnDoe"],
                            ["date" => "31 Desember, 2025", "text" => "Tenetur magnam sunt cupiditate...", "author" => "JaneDoe"],
                            ["date" => "1 Januari, 2026", "text" => "Laborum, iusto minima.", "author" => "User123"],
                            ["date" => "1 Januari, 2026", "text" => "Laborum, iusto minima.", "author" => "User123"],
                        ];

                        $margins = ["10%", "45%", "14%", "47%", "14%"];
                        foreach ($reviews as $index => $review) {
                            $marginLeft = $margins[$index % count($margins)];
                            echo "
            <div class='kotakReview' style='margin-left: $marginLeft;'>
                <h4>{$review['date']}</h4>
                <h2>{$review['text']}</h2>
                <h5>{$review['author']}</h5>
            </div>
            ";
                        }
                        ?>
                    </div>
                    <div class="adniasasdasd" style="height: 750px; width: 100%; background-color: #ffffff; margin-top: 360px; margin-bottom: 90px;">
                    <img src="{{ asset('storage/Assets/4CTeam.jpg') }}" style="object-fit: cover;" width="100%" ; height="100%" ; />
                </div>
                </div>




                

                <div class="kelompokKe6">
                    <h1>Wujudkan Rumah Impianmu – Beli, Bangun, atau Jual!</h1>
                    <div class="bawahKelompok6">
                        <div class="kiriBawahKelompok6">
                            <div class="tengahKelompok6">
                                <img src="{{ asset('storage/Assets/Logo4C.png') }}" />
                                <h3>4C 4Construction By 4C Team</h3>
                            </div>
                            <div class="textIsiKelompok6">
                                <img src="{{ asset('storage/Assets/4CTeam.jpg') }}" />
                                <p>Dapatkan rumah impian dengan kualitas premium dari tim berpengalaman yang telah menangani berbagai proyek eksklusif.<span> Dengan proses yang mudah dan transparan, kami memastikan setiap hunian tidak hanya sesuai kebutuhan Anda, tetapi juga menghadirkan nilai terbaik dalam setiap langkahnya.</span></p>
                            </div>
                        </div>
                        <a href="">
                            <div class="tombolCta">
                                <div class="text-wrapper">
                                    <h3>Saya Tertarik!</h3>
                                    <div class="hover-text">Saya Tertarik!</div>
                                </div>
                            </div>
                        </a>
                    </div>

                </div>
                <footer>
                    <div class="atasFooter">
                        <div class="footerStart">
                            <h2>4Ceria</h2>
                            <h3>Made By Davin, Riza, Daffa And pen</h3>
                        </div>
                        <div class="footerList">
                            <div class="isiFooterList">
                                <ul>
                                    <li>Company</li>
                                    <li>About Us</li>
                                    <li>Products</li>
                                    <li>Contacts</li>
                                </ul>
                            </div>
                            <div class="isiFooterList">
                                <ul>
                                    <li>Company</li>
                                    <li>About Us</li>
                                    <li>Products</li>
                                    <li>Contacts</li>
                                </ul>
                            </div>

                        </div>
                        <div class="footerEnd">
                            <h2>Contact Us</h2>
                            <div class="kirimPesan">
                                <input type="text" placeholder="Kirim Pesan">
                            </div>
                            <button>Kirim Pesan</button>
                        </div>
                    </div>

                    <div class="bawahFooter">
                        <ul class="term">
                            <li>©2025 | 4Ceria</li>
                            <li>Privacy Policy</li>
                            <li>Cookie Policy</li>
                            <li>Terms of Service</li>
                        </ul>
                        <ul class="logoSosmed">
                            <li>
                                <a href="https://www.instagram.com/yourprofile" target="_blank">
                                    <img src="{{ asset('storage/Assets/instagram.png') }}" width="30px" height="30px" />
                                </a>
                            </li>
                            <li>
                                <a href="https://www.linkedin.com/in/yourprofile" target="_blank">
                                    <img src="{{ asset('storage/Assets/linkedIn.png') }}" width="30px" height="30px" />
                                </a>
                            </li>
                            <li>
                                <a href="https://www.youtube.com/c/yourchannel" target="_blank">
                                    <img src="{{ asset('storage/Assets/youtube.png') }}" width="30px" height="30px" />
                                </a>
                            </li>
                        </ul>

                    </div>
                </footer>

            </div>




        </div>
        </div>


        <script>
            const stickySections = [...document.querySelectorAll('.sticky')];
            window.addEventListener('scroll', () => {
                stickySections.forEach(section => {
                    transform(section);
                });
            });

            function transform(section) {
                const offsetTop = section.parentElement.offsetTop;
                const scrollSection = section.querySelector('.scroll_section');
                let percentage = ((window.scrollY - offsetTop) / window.innerHeight) * 100;
                percentage = percentage < 0 ? 0 : percentage > 400 ? 400 : percentage;
                scrollSection.style.transform = `translate3d(${-(percentage)}vw, 0, 0)`;
            }
            const statistics = document.querySelectorAll('.statistic');
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('show');
                    }
                });
            }, {
                threshold: 0.4
            });

            statistics.forEach(stat => observer.observe(stat));


            function toggleFAQ(element) {
                element.classList.toggle("active");
            }

            document.addEventListener("DOMContentLoaded", function() {
                const message = document.getElementById('success-message');
                message.classList.add('show');

                setTimeout(() => {
                    message.style.animation = 'fadeOut 1.5s';
                }, 1500);

                setTimeout(() => {
                    message.style.display = 'none';
                }, 2000);
            });


            document.addEventListener("DOMContentLoaded", function() {
                const title = document.querySelector(".stickyTitle");
                const reviewContainer = document.querySelector(".geserKekiriReview");
                const lastReview = reviewContainer.lastElementChild;

                let isSticky = false;
                let isEnd = false;

                window.addEventListener("scroll", () => {
                    const titleRect = title.getBoundingClientRect();
                    const lastReviewRect = lastReview.getBoundingClientRect();
                    const windowHeight = window.innerHeight;

                    if (titleRect.top <= windowHeight / 2 && !isSticky && !isEnd) {
                        title.classList.add("is-fixed");
                        title.style.position = "sticky";
                        title.style.transform = "translateY(0)";
                        isSticky = true;
                    }
                    if (titleRect.bottom >= imageRect.top) {
            title.style.position = "absolute";
            title.style.top = `${imageRect.top - title.offsetHeight}px`; // Biarkan turun perlahan
        } else {
            title.style.position = "sticky";
            title.style.top = "50px"; // Kembali ke posisi awal
        }

                    if (lastReviewRect.bottom <= windowHeight * 0.3 && !isEnd) {
                        title.classList.remove("is-fixed");
                        title.style.position = "relative";


                        const stickyEndY = windowHeight * 0.4;
                        const finalOffsetY = lastReview.offsetTop + lastReview.offsetHeight - title.offsetTop;


                        const extraGap = stickyEndY - lastReviewRect.bottom;

                        title.style.transform = `translateY(${finalOffsetY + extraGap}px)`;

                        title.classList.add("end-sticky");
                        isEnd = true;
                        isSticky = false;
                    }


                    if (lastReviewRect.bottom > windowHeight * 0.3 && isEnd) {
                        title.style.position = "sticky";


                        const stickyEndY = windowHeight * 0.4;
                        const finalOffsetY = lastReview.offsetTop + lastReview.offsetHeight - title.offsetTop;
                        const extraGap = stickyEndY - lastReviewRect.bottom;

                        title.style.transform = `translateY(${finalOffsetY + extraGap}px)`;

                        title.classList.remove("end-sticky");
                        isEnd = false;
                        isSticky = true;
                    }


                });
            });
        </script>
    </x-slot:slot>

</x-app-layout>