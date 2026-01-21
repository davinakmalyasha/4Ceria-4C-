<x-app-layout>
  <style>
    .kontraktor-container {
    max-width: 800px;
    margin: 40px auto;
    padding: 20px;
}

.kontraktor-card {
    background-color: #fff;
    border-radius: 16px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
    padding: 30px;
    text-align: center;
    font-family: 'Segoe UI', sans-serif;
}

/* Header (foto + nama) */
.kontraktor-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 24px;
}

.kontraktor-photo img {
    width: 90px;
    height: 90px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid #fd1d1d;
    margin-bottom: 16px;
}

.kontraktor-name {
    font-size: 26px;
    color: #333;
    margin: 0;
}

/* Informasi kontraktor */
.kontraktor-info p {
    font-size: 16px;
    color: #555;
    margin: 8px 0;
    text-align: left;
}

/* Tombol */
.kontraktor-actions {
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

.btn-secondary {
    background-color: #6c757d;
    color: white;
}

.btn-secondary:hover {
    background-color: #545b62;
}

  </style>
        <link rel="stylesheet" href="{{ URL::asset('css/kontraktor.css') }}">

        <div class="kontraktor-container">
            <div class="kontraktor-card">
                <div class="kontraktor-header">
                    <div class="kontraktor-photo">
                        @if ($kontraktor->user->pic)
                            <img src="{{ asset('storage/' . $kontraktor->user->pic) }}" alt="Foto Kontraktor">
                        @else
                            <img src="{{ asset('storage/Assets/Logo4C.png') }}" alt="Foto Default Kontraktor">
                        @endif
                    </div>
                    <h2 class="kontraktor-name">{{ $kontraktor->nama }}</h2>
                </div>

                <div class="kontraktor-info">
                    <p><strong>📧 Email:</strong> {{ $kontraktor->email }}</p>
                    <p><strong>📞 No Telepon:</strong> {{ $kontraktor->no_telepon }}</p>
                    <p><strong>📍 Alamat:</strong> {{ $kontraktor->alamat }}</p>
                    <p><strong>🔹 Jenis:</strong> {{ ucfirst($kontraktor->jenis) }}</p>

                    @if($kontraktor->jenis === 'perusahaan')
                        <p><strong>🏢 Nama Perusahaan:</strong> {{ $kontraktor->nama_perusahaan }}</p>
                        <p><strong>🆔 NPWP:</strong> {{ $kontraktor->npwp }}</p>
                        <p><strong>📜 SIUP:</strong> {{ $kontraktor->siup }}</p>
                    @endif

                    <p><strong>📌 Spesialisasi:</strong> {{ $kontraktor->spesialisasi }}</p>
                    <p><strong>📆 Pengalaman:</strong> {{ $kontraktor->pengalaman }} tahun</p>
                </div>
<style>
.blamok {
    background-color: #fd1d1d;
    color: white;
    padding: 12px;
    border-radius: 8px;
    text-decoration: none
}
</style>
@if($kontraktor->projects->count())
    <div class="kontraktor-docs">
        <h3>📁 Riwayat Proyek</h3>
        @foreach($kontraktor->projects as $project)
            <div>
                <strong>{{ $project->title }}</strong><br>
                <small>Dibuat pada: {{ $project->created_at->format('d M Y') }}</small><br>

                @php
                    $avgRating = $project->kontraktorRating->rating ?? null;
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

                <div class="kontraktor-actions">
                <a href="https://wa.me/{{ $kontraktor->no_telp }}" class="blamok">💬 Chat via WhatsApp</a>
                    <a href="{{ url()->previous() }}" class="btn btn-secondary">🔙 Kembali</a>
                </div>
            </div>
        </div>
    
</x-app-layout>
