<x-app-layout>
<style>
.arsitek-container {
    max-width: 800px;
    margin: 40px auto;
    padding: 20px;
}

.arsitek-card {
    background-color: #fff;
    border-radius: 16px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
    padding: 30px;
    text-align: center;
    font-family: 'Segoe UI', sans-serif;
}
.arsitek-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 24px;
}

.arsitek-photo img {
    width: 90px;
    height: 90px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid #fd1d1d;
    margin-bottom: 16px;
}

.arsitek-name {
    font-size: 26px;
    color: #333;
    margin: 0;
}

.arsitek-info p {
    font-size: 16px;
    color: #555;
    margin: 8px 0;
    text-align: left;
}

.arsitek-docs {
    margin-top: 30px;
    text-align: left;
}

.arsitek-docs h3 {
    font-size: 20px;
    color: #fd1d1d;
    margin-bottom: 10px;
}

.arsitek-docs a {
    display: block;
    color: #fd1d1d;
    text-decoration: none;
    margin-bottom: 8px;
}

.arsitek-docs a:hover {
    text-decoration: underline;
}

.arsitek-actions {
    margin-top: 30px;
}

.btn {
    display: inline-block;
    padding: 10px 18px;
    margin: 8px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    transition: background-color 0.3s ease;
}

.btn-primary {
    background-color: #fd1d1d;
    color: white;
}

.btn-primary:hover {
    background-color: #fd1d1d;
}

.btn-secondary {
    background-color: white;
    color: #fd1d1d;
}

.btn-secondary:hover {
    background-color: #545b62;
}

</style>
        <link rel="stylesheet" href="{{ URL::asset('css/arsitek.css') }}">

        <div class="arsitek-container">
            <div class="arsitek-card">
                <div class="arsitek-header">
                    <div class="arsitek-photo">
                        @if ($arsitek->user->pic)
                            <img src="{{ asset('storage/' . $arsitek->user->pic) }}" alt="Foto Arsitek">
                        @else
                            <img src="{{ asset('storage/Assets/Logo4C.png') }}" alt="Foto Default Arsitek">
                        @endif
                    </div>
                    <h2 class="arsitek-name">{{ $arsitek->nama }}</h2>
                </div>

                <div class="arsitek-info">
                    <p><strong>📞 No. Telepon:</strong> {{ $arsitek->no_telp }}</p>
                    <p><strong>📍 Lokasi:</strong> {{ $arsitek->lokasi }}</p>
                    <p><strong>🎨 Spesialisasi:</strong> {{ $arsitek->spesialisasi }}</p>
                    <p><strong>⌛ Pengalaman:</strong> {{ $arsitek->pengalaman_tahun }} tahun</p>
                    <p><strong>💰 Rate Harga:</strong> Rp{{ number_format($arsitek->rate_harga, 0, ',', '.') }}</p>
                    <p><strong>📝 Deskripsi:</strong> {{ $arsitek->deskripsi }}</p>
                </div>
                
                @if($arsitek->projects->count())
    <div class="arsitek-docs">
        <h3>📁 Riwayat Proyek</h3>
        @foreach($arsitek->projects as $project)
    <div>
        <strong>{{ $project->title }}</strong><br>
        <small>Dibuat pada: {{ $project->created_at->format('d M Y') }}</small><br>

        @php
            $avgRating = $project->ratings->avg('rating') ?? 0;
        @endphp

         @if($avgRating)
                    <span>⭐ Rating: {{ number_format($avgRating, 2) }} / 5.00</span>
                @else
                    <span>Belum dinilai</span>
                @endif
    </div>
    <hr>
@endforeach

    </div>
@else
    <p><em>Belum ada riwayat proyek.</em></p>
@endif

            

                <div class="arsitek-actions">
                    <a href="https://wa.me/{{ $arsitek->no_telp }}" class="btn btn-primary">💬 Chat via WhatsApp</a>
                    <a href="{{ url()->previous() }}" class="btn btn-secondary">🔙 Kembali</a>
                </div>
            </div>
        </div>
   
</x-app-layout>
