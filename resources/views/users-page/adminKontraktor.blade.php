<style>
    body {
    font-family: 'Segoe UI', sans-serif;
    margin: 0;
    padding: 0;
    background-color: #fff;
    color: #2d3436;
}

.navbar {
    background-color: #f5f5f5;
    padding: 15px 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid #fd1d1d;
}

.navbar-title {
    font-size: 20px;
    font-weight: bold;
    color: #000;
}

.navbar-right a,
.logout-btn {
    margin-left: 20px;
    background: none;
    border: none;
    font-weight: 500;
    color: #000;
    text-decoration: none;
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 6px;
    transition: background-color 0.2s ease;
}

.navbar-right a:hover,
.logout-btn:hover {
    background-color: #fd1d1d22;
}

.container {
    padding: 30px;
    max-width: 900px;
    margin: 0 auto;
}

h2, h3, h4 {
    color: #fd1d1d;
}

.form-group {
    margin-bottom: 15px;
}

input[type="text"],
input[type="email"],
input[type="number"],
input[type="file"] {
    width: 100%;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #ccc;
}

.profile-pic img {
    max-width: 150px;
    border-radius: 10px;
    margin-bottom: 10px;
}

.btn-primary {
    background-color: #fd1d1d;
    color: #fff;
    border: none;
    padding: 10px 16px;
    border-radius: 8px;
    font-weight: bold;
    text-decoration: none;
    display: inline-block;
    transition: background-color 0.3s ease;
}

.btn-primary:hover {
    background-color: #c41414;
}

.success-msg {
    color: green;
    font-weight: bold;
}

.table-container {
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
}

table, th, td {
    border: 1px solid #ccc;
}

th, td {
    padding: 10px;
    text-align: left;
}

</style>

<nav class="navbar">
    <div class="navbar-left">
        <span class="navbar-title">Dashboard Kontraktor</span>
    </div>
    <div class="navbar-right">
    <a href="{{ route('users-page.adminKontraktor') }}">Home</a>
    <a href="{{ route('kontraktor.bidding') }}">Bidding</a>
    <a href="{{ route('kontraktor.riwayat') }}">Riwayat Proyek</a>

        <form action="{{ route('logout') }}" method="POST" style="display:inline;">
            @csrf
            <button type="submit" class="logout-btn">Logout</button>
        </form>
    </div>
</nav>

<div class="container">
    @if(session('success'))
        <p class="success-msg">{{ session('success') }}</p>
    @endif

    <h2>Edit Profil</h2>
    <form action="{{ route('kontraktor.updateProfile') }}" method="POST" enctype="multipart/form-data">
        @csrf
        @method('PUT')

        <div class="form-group">
            <label>Foto Profil:</label><br>
            @if(Auth::user()->pic)
                <div class="profile-pic">
                    <img src="{{ asset('storage/' . Auth::user()->pic) }}" alt="Foto Profil">
                </div>
            @endif
            <input type="file" name="pic" id="picInput" style="display: none;">
            <button type="button" onclick="showPicInput()">Edit Foto Profil</button>
            <button type="button" id="cancelFotoBtn" onclick="cancelPicInput()" style="display:none;">Batal</button>
        </div>
        @foreach($kontraktors as $kontraktor)
    @if($kontraktor->user_id === Auth::id())
        <div class="card-body">
            <h5>{{ $kontraktor->nama }}</h5>
            @php
                $avg = number_format($kontraktor->ratings_avg_rating ?? 0, 2);
                $total = $kontraktor->ratings_count;
            @endphp
            <p>
                <strong>Rating Anda:</strong>
                {{ $avg }} / 5.00 ({{ $total }})
            </p>
        </div>
    @endif
@endforeach

        <div class="form-group"><label>Nama:</label><input type="text" name="nama" value="{{ Auth::user()->kontraktor->nama ?? '' }}" required></div>
        <div class="form-group"><label>Email:</label><input type="email" name="email" value="{{ Auth::user()->email ?? '' }}" required></div>
        <div class="form-group"><label>No. Telepon:</label><input type="text" name="no_telepon" value="{{ Auth::user()->kontraktor->no_telepon ?? '' }}"></div>
        <div class="form-group"><label>Alamat:</label><input type="text" name="alamat" value="{{ Auth::user()->kontraktor->alamat ?? '' }}"></div>
        <div class="form-group"><label>Jenis:</label><input type="text" name="jenis" value="{{ Auth::user()->kontraktor->jenis ?? '' }}"></div>
        <div class="form-group"><label>Nama Perusahaan:</label><input type="text" name="nama_perusahaan" value="{{ Auth::user()->kontraktor->nama_perusahaan ?? '' }}"></div>
        <div class="form-group"><label>NPWP:</label><input type="text" name="npwp" value="{{ Auth::user()->kontraktor->npwp ?? '' }}"></div>
        <div class="form-group"><label>SIUP:</label><input type="text" name="siup" value="{{ Auth::user()->kontraktor->siup ?? '' }}"></div>
        <div class="form-group"><label>Pengalaman (tahun):</label><input type="number" name="pengalaman" value="{{ Auth::user()->kontraktor->pengalaman ?? '' }}"></div>

        <h4>Spesialisasi Disetujui</h4>
        @if ($kontraktor->spesialisasis->isEmpty())
            <p>Belum ada spesialisasi yang disetujui.</p>
        @else
            <ul>
                @foreach ($kontraktor->spesialisasis as $item)
                    <li>{{ ucfirst($item->nama) }}</li>
                @endforeach
            </ul>
        @endif

        @php
            $punyaUmum = $kontraktor->spesialisasis->contains(fn($s) => strtolower($s->nama) === 'umum');
        @endphp

        @if (!$punyaUmum)
            <a href="{{ route('kontraktor.form-ajukan-spesialisasi') }}" class="btn-primary">Ajukan Spesialisasi Baru</a>
        @endif

        <button type="submit" class="btn-primary" style="margin-top:15px;">Update Profil</button>
    </form>

    <hr>
    <h3>Riwayat Pengajuan Spesialisasi</h3>
    @if ($kontraktor->pengajuanSpesialisasi->isEmpty())
        <p>Belum ada pengajuan.</p>
    @else
        <div class="table-container">
            <table>
                <tr>
                    <th>No</th>
                    <th>Spesialisasi</th>
                    <th>Status</th>
                    <th>File</th>
                    <th>Diajukan Pada</th>
                </tr>
                @foreach ($kontraktor->pengajuanSpesialisasi as $index => $pengajuan)
                    <tr>
                        <td>{{ $index + 1 }}</td>
                        <td>{{ ucfirst($pengajuan->spesialisasi->nama) }}</td>
                        <td>{{ ucfirst($pengajuan->status) }}</td>
                        <td><a href="{{ asset('storage/' . $pengajuan->file_sertifikat) }}" target="_blank">Lihat Sertifikat</a></td>
                        <td>{{ $pengajuan->created_at->format('d M Y') }}</td>
                    </tr>
                @endforeach
            </table>
        </div>
    @endif
</div>

<script>
    function showPicInput() {
        document.getElementById('picInput').style.display = 'block';
        document.getElementById('cancelFotoBtn').style.display = 'inline-block';
        document.querySelector('button[onclick="showPicInput()"]').style.display = 'none';
    }

    function cancelPicInput() {
        const picInput = document.getElementById('picInput');
        picInput.value = '';
        picInput.style.display = 'none';
        document.querySelector('button[onclick="showPicInput()"]').style.display = 'inline-block';
        document.getElementById('cancelFotoBtn').style.display = 'none';
    }
</script>
