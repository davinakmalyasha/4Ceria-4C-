<style>
    .rating-container {
    max-width: 1100px;
    margin: auto;
    padding: 2rem;
    font-family: 'Segoe UI', sans-serif;
}

.section-heading {
    color: #fd1d1d;
    font-size: 2rem;
    margin-bottom: 2rem;
    border-bottom: 2px solid #fd1d1d;
    padding-bottom: 0.5rem;
}

.no-data {
    text-align: center;
    color: #777;
    font-style: italic;
}

.card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 1.5rem;
}

.rating-card {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    padding: 1.5rem;
    transition: 0.3s;
}

.rating-card:hover {
    transform: translateY(-4px);
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.8rem;
}

.project-title {
    font-size: 1.3rem;
    font-weight: bold;
    color: #333;
}

.date {
    font-size: 0.9rem;
    color: #888;
}

.card-body p {
    margin: 0.4rem 0;
    color: #555;
    font-size: 0.95rem;
}

.section-block {
    margin-top: 1rem;
    border-top: 1px dashed #ccc;
    padding-top: 1rem;
}

.section-block h4 {
    color: #222;
    margin-bottom: 0.5rem;
    font-size: 1.1rem;
}

.stars {
    display: flex;
    align-items: center;
    font-size: 1.1rem;
    margin-bottom: 0.3rem;
}

.star {
    color: #fd1d1d;
    margin-right: 2px;
}

.star.inactive {
    color: #ddd;
}

.rating-number {
    margin-left: 8px;
    color: #444;
    font-weight: 500;
}

.comment {
    font-style: italic;
    color: #333;
    margin-bottom: 0.5rem;
}

.btn-rate {
    display: inline-block;
    padding: 0.4rem 0.9rem;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    font-size: 0.9rem;
    transition: 0.2s;
}

.btn-rate.arsitek {
    border: 1px solid #007bff;
    color: #007bff;
}

.btn-rate.arsitek:hover {
    background-color: #007bff;
    color: white;
}

.btn-rate.kontraktor {
    border: 1px solid #28a745;
    color: #28a745;
}

.btn-rate.kontraktor:hover {
    background-color: #28a745;
    color: white;
}

</style>
<a href="{{ route('forum.project') }}" class="back-link">← Kembali ke Forum</a>
<div class="rating-container">
    <h2 class="section-heading">Riwayat Proyek Anda</h2>

    @if($riwayats->isEmpty())
        <p class="no-data">Belum ada proyek yang selesai.</p>
    @else
        <div class="card-grid">
            @foreach($riwayats as $riwayat)
                <div class="rating-card">
                    <div class="card-header">
                        <h3 class="project-title">{{ $riwayat->project->title }}</h3>
                        <span class="date">{{ \Carbon\Carbon::parse($riwayat->selesai_pada)->translatedFormat('d F Y') }}</span>
                    </div>

                    <div class="card-body">
                        <p><strong>Client:</strong> {{ $riwayat->user->name }}</p>
                        <p><strong>Lokasi:</strong> {{ $riwayat->project->lokasi }}</p>
                        <p><strong>Catatan:</strong> {{ $riwayat->keterangan }}</p>

                        {{-- Arsitek --}}
                        @if($riwayat->arsitek)
                            <div class="section-block">
                                <h4>Arsitek: {{ $riwayat->arsitek->nama }}</h4>
                                @if($riwayat->arsitekRating)
                                    <div class="stars">
                                        {!! str_repeat('<span class="star">★</span>', $riwayat->arsitekRating->rating) !!}
                                        {!! str_repeat('<span class="star inactive">★</span>', 5 - $riwayat->arsitekRating->rating) !!}
                                        <span class="rating-number">({{ $riwayat->arsitekRating->rating }}/5)</span>
                                    </div>
                                    <p class="comment">"{{ $riwayat->arsitekRating->komentar }}"</p>
                                @else
                                    <a href="{{ route('user.rating.form', ['project_id' => $riwayat->project->id, 'tipe' => 'arsitek']) }}"
                                       class="btn-rate arsitek">Beri Penilaian Arsitek</a>
                                @endif
                            </div>
                        @endif

                        {{-- Kontraktor --}}
                        @if($riwayat->kontraktor)
                            <div class="section-block">
                                <h4>Kontraktor: {{ $riwayat->kontraktor->nama }}</h4>
                                @if($riwayat->kontraktorRating)
                                    <div class="stars">
                                        {!! str_repeat('<span class="star">★</span>', $riwayat->kontraktorRating->rating) !!}
                                        {!! str_repeat('<span class="star inactive">★</span>', 5 - $riwayat->kontraktorRating->rating) !!}
                                        <span class="rating-number">({{ $riwayat->kontraktorRating->rating }}/5)</span>
                                    </div>
                                    <p class="comment">"{{ $riwayat->kontraktorRating->komentar }}"</p>
                                @else
                                    <a href="{{ route('user.rating.form', ['project_id' => $riwayat->project->id, 'tipe' => 'kontraktor']) }}"
                                       class="btn-rate kontraktor">Beri Penilaian Kontraktor</a>
                                @endif
                            </div>
                        @endif
                    </div>
                </div>
            @endforeach
        </div>
    @endif
</div>
