<style>
    body {
    background-color: #fff;
    font-family: 'Segoe UI', sans-serif;
    margin: 0;
    padding: 0;
    color: #2d3436;
}

.navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #f5f5f5;
    padding: 15px 30px;
    border-bottom: 2px solid #fd1d1d;
    margin-bottom: 30px;
}

.navbar-title {
    font-size: 20px;
    font-weight: bold;
    color: #000;
}

.navbar-right a {
    margin-left: 20px;
    text-decoration: none;
    color: #000;
    font-weight: 500;
    padding: 8px 12px;
    border-radius: 6px;
    transition: background-color 0.2s ease;
}

.navbar-right a:hover {
    background-color: #fd1d1d22;
}

.container {
    padding: 0 30px;
}

h2 {
    font-size: 26px;
    color: #fd1d1d;
    margin-bottom: 20px;
}

.no-projects {
    font-style: italic;
    color: #888;
}

.project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

.project-card {
    background-color: #fff;
    border: 1px solid #eee;
    border-left: 5px solid #fd1d1d;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.project-card h3 {
    margin-bottom: 10px;
    color: #333;
}

.project-card p {
    margin: 6px 0;
    font-size: 14px;
}

.btn-primary {
    display: inline-block;
    margin-top: 15px;
    background-color: #fd1d1d;
    color: white;
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    font-weight: bold;
    text-decoration: none;
    transition: background-color 0.3s ease;
}

.btn-primary:hover {
    background-color: #c41414;
}

</style>
<nav class="navbar">
    <div class="navbar-left">
        <span class="navbar-title">Bidding Arsitek</span>
    </div>
    <div class="navbar-right">
        <a href="{{ route('users-page.adminArsitek') }}">Home</a>
        <a href="{{ route('users-page.adminArsitek') }}">Dashboard</a>
        <form action="{{ route('logout') }}" method="POST" style="display:inline;">
            @csrf
            <button type="submit" class="logout-btn">Logout</button>
        </form>
    </div>
</nav>

<div class="container">
    <h2>Proyek Tersedia untuk Bidding</h2>

    @if($projects->isEmpty())
        <p class="no-projects">Tidak ada proyek yang tersedia.</p>
    @else
        <div class="project-grid">
            @foreach($projects as $project)
                <div class="project-card">
                    <h3>{{ $project->title }}</h3>
                    <p><strong>Deskripsi:</strong> {{ $project->description }}</p>
                    <p><strong>Budget:</strong> Rp{{ number_format($project->budget, 0, ',', '.') }}</p>
                    <p><strong>Lokasi:</strong> {{ $project->lokasi }}</p>
                    <p><strong>Jenis Proyek:</strong> {{ ucfirst($project->jenis_proyek) }}</p>

                    @php
                        $sudahBid = $project->bidsArsitek->where('arsitek_id', auth()->user()->arsitek->id)->isNotEmpty();
                    @endphp

                    @if($sudahBid)
                        <button class="btn-primary" disabled style="background-color: gray;">Sudah Bid</button>
                    @else
                        <a href="{{ route('formulir.bid.arsitek', $project->id) }}" class="btn-primary">Ajukan Bid</a>
                    @endif

                   
                    @if($project->bidsArsitek->isNotEmpty())
                        <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
                            <h4 style="color: #fd1d1d;">Daftar Riwayat Ngebid</h4>

                            @foreach($project->bidsArsitek as $bid)
                                <div style="margin-bottom: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                                    <p><strong>Nama Proyek:</strong> {{ $bid->project->title ?? 'Proyek tidak ditemukan' }}</p>
                                    <p><strong>Deskripsi:</strong> {{ $bid->project->description }}</p>
                                    <p><strong>Budget:</strong> Rp{{ number_format($bid->project->budget, 0, ',', '.') }}</p>
                                    <p><strong>Lokasi:</strong> {{ $bid->project->lokasi }}</p>
                                    <hr>
                                    <p><strong>Harga Ditawarkan:</strong> Rp{{ number_format($bid->price, 0, ',', '.') }}</p>
                                    <p><strong>Waktu Pengerjaan:</strong> {{ $bid->waktu_pengerjaan }} hari</p>
                                    <p><strong>Catatan:</strong> {{ $bid->catatan }}</p>
                                    <p><strong>Status Bid:</strong> {{ ucfirst($bid->status ?? 'pending') }}</p>

                                
                                   @if($bid->status === 'accepted')
    @if($project->user->phoneNumber->count())
        @foreach($project->user->phoneNumber as $phone)
            @php
                $noWhatsapp = $phone->contact;
                $pesan = "Halo, saya arsitek yang Anda pilih di proyek '" . $project->title . "'";
                $whatsappLink = 'https://wa.me/' . preg_replace('/[^0-9]/', '', $noWhatsapp) . '?text=' . urlencode($pesan);
            @endphp
            <a href="{{ $whatsappLink }}" target="_blank" class="btn-primary" style="background-color: #25D366; margin-top: 10px; display: block;">
                Hubungi User via WhatsApp ({{ $noWhatsapp }})
            </a>
        @endforeach
    @else
        <p style="color:red;">Nomor telepon user tidak tersedia.</p>
    @endif
@endif

                                </div>
                            @endforeach
                        </div>
                    @endif
                </div>
            @endforeach
        </div>
    @endif
</div>