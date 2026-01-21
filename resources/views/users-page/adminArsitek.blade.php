<style>
    body {
    background-color: #ffffff;
    font-family: 'Segoe UI', sans-serif;
    color: #2d3436;
}
.navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
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

h1 {
    text-align: center;
    color: #fd1d1d;
    margin-bottom: 20px;
}

h2 {
    margin-top: 30px;
    color: #fd1d1d;
    font-size: 22px;
    border-bottom: 2px solid #fd1d1d;
    padding-bottom: 6px;
    margin-bottom: 20px;
}

a {
    color: #fd1d1d;
    text-decoration: none;
    font-weight: 500;
    display: inline-block;
    margin-bottom: 20px;
}

a:hover {
    text-decoration: underline;
}

form {
    background-color: #fefefe;
    padding: 25px;
    border: 1px solid #eee;
    border-radius: 12px;
    max-width: 700px;
    margin: 0 auto;
    box-shadow: 0 0 15px rgba(0,0,0,0.03);
}

.form-group {
    margin-bottom: 18px;
}

label {
    font-weight: bold;
    display: block;
    margin-bottom: 6px;
}

input[type="text"],
input[type="number"],
input[type="file"],
input[type="date"],
textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
}

textarea {
    resize: vertical;
    min-height: 80px;
}

.grid {
    display: grid;
}

.grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
}

.gap-2 {
    gap: 8px;
}

.mt-2 {
    margin-top: 8px;
}

.flex {
    display: flex;
}

.items-center {
    align-items: center;
}

.space-x-2 > * + * {
    margin-left: 8px;
}

button {
    background-color: #fd1d1d;
    color: white;
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease;
}

button:hover {
    background-color: #c91414;
}

#editFotoBtn,
#cancelFotoBtn {
    background-color: #fd1d1d;
    color: #fff;
    border: none;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    margin-top: 8px;
}

#editFotoBtn:hover,
#cancelFotoBtn:hover {
    background-color: #c91414;
}

img {
    border-radius: 8px;
    max-width: 150px;
    height: auto;
    margin-bottom: 10px;
}

.alert-success {
    background-color: #e6ffe6;
    color: green;
    padding: 10px 15px;
    border-radius: 8px;
    max-width: 700px;
    margin: 0 auto 20px auto;
    text-align: center;
}

</style>
<nav class="navbar">
    <div class="navbar-left">
        <span class="navbar-title">Dashboard Arsitek</span>
    </div>
    <div class="navbar-right">
        <a href="{{ route('users-page.adminArsitek') }}">Home</a>
        <a href="{{ route('arsitek.bidding') }}">Bidding Arsitek</a>
        <a href="{{ route('arsitek.riwayat') }}">Riwayat Proyek</a>

        <form action="{{ route('logout') }}" method="POST" style="display:inline;">
            @csrf
            <button type="submit" class="logout-btn">Logout</button>
        </form>
    </div>
</nav>


@if(session('success'))
    <p style="color: green;">{{ session('success') }}</p>
@endif


<form action="{{ route('arsitek.updateProfile') }}" method="POST" enctype="multipart/form-data">
    @csrf
    @method('PUT')

    <div style="margin-top:20px;">
        <label>Foto Profil:</label><br>

        @if(Auth::user()->pic)
            <div style="margin-bottom:10px;">
                <img src="{{ asset('storage/' . Auth::user()->pic) }}" alt="Foto Profil" style="max-width: 150px;">
            </div>
        @endif

        <div style="margin-bottom: 10px;">
            <button type="button" id="editFotoBtn" onclick="showPicInput()">Edit Foto Profil</button>
            <button type="button" id="cancelFotoBtn" onclick="cancelPicInput()" style="display:none; margin-left:10px;">Batal</button>
        </div>

        <input type="file" name="pic" id="picInput" style="display: none; margin-top:10px;">
    </div>
 @foreach($arsiteks as $arsitek)
    @if($arsitek->user_id === Auth::id())
        <div class="card-body">
            <h5>{{ $arsitek->nama }}</h5>
            @php
                $avg = number_format($arsitek->ratings_avg_rating ?? 0, 2);
                $total = $arsitek->ratings_count;
            @endphp
            <p>
                <strong>Rating Anda:</strong>
                {{ $avg }} / 5.00 ({{ $total }})
            </p>
        </div>
    @endif
@endforeach


    <br>

    <div style="margin-bottom: 10px;">
        <label>Nama:</label>
        <input type="text" name="nama" value="{{ Auth::user()->arsitek->nama ?? '' }}" required>
    </div>

    <div style="margin-bottom: 10px;">
        <label>No. Telp:</label>
        <input type="text" name="no_telp" value="{{ Auth::user()->arsitek->no_telp ?? '' }}">
    </div>

    <div style="margin-bottom: 10px;">
        <label>Rate Harga:</label>
        <input type="number" name="rate_harga" value="{{ Auth::user()->arsitek->rate_harga ?? '' }}">
    </div>

    <div style="margin-bottom: 10px;">
        <label>Spesialisasi:</label>
        @php
            $spesialisasiList = ['Residensial', 'Komersial', 'Interior', 'Hijau/Ramah lingkungan', 'Modern', 'Tradisional', 'Minimalis', 'Urban Planning'];
            $selectedSpesialisasi = explode(',', Auth::user()->arsitek->spesialisasi ?? '');
        @endphp

        <div class="grid grid-cols-2 gap-2 mt-2">
            @foreach ($spesialisasiList as $spesialisasi)
                <label class="flex items-center space-x-2">
                    <input type="checkbox" name="spesialisasi[]" value="{{ $spesialisasi }}"
                        {{ in_array($spesialisasi, $selectedSpesialisasi) ? 'checked' : '' }}>
                    <span>{{ $spesialisasi }}</span>
                </label>
            @endforeach
        </div>
    </div>

    <div style="margin-bottom: 10px;">
        <label>Deskripsi:</label>
        <textarea name="deskripsi">{{ Auth::user()->arsitek->deskripsi ?? '' }}</textarea>
    </div>

    <div style="margin-bottom: 10px;">
        <label>Lokasi:</label>
        <input type="text" name="lokasi" value="{{ Auth::user()->arsitek->lokasi ?? '' }}">
    </div>

    <div style="margin-bottom: 10px;">
        <label>Pengalaman (tahun):</label>
        <input type="number" name="pengalaman_tahun" value="{{ Auth::user()->arsitek->pengalaman_tahun ?? '' }}">
    </div>

    <button type="submit">Update Profil</button>
</form>

<script>
    function showPicInput() {
        document.getElementById('picInput').style.display = 'block';
        document.getElementById('cancelFotoBtn').style.display = 'inline-block';
        document.getElementById('editFotoBtn').style.display = 'none';
    }

    function cancelPicInput() {
        const picInput = document.getElementById('picInput');
        picInput.value = ''; // reset input file
        picInput.style.display = 'none';

        document.getElementById('editFotoBtn').style.display = 'inline-block';
        document.getElementById('cancelFotoBtn').style.display = 'none';
    }
</script>
