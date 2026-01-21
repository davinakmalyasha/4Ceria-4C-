<style>
    .rating-container {
    max-width: 1000px;
    margin: auto;
    padding: 2rem;
    font-family: 'Segoe UI', sans-serif;
}

.back-link {
    color: #fd1d1d;
    text-decoration: none;
    font-weight: bold;
    display: inline-block;
    margin-bottom: 1.5rem;
}

.section-heading {
    color: black;
    font-size: 2rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid #fd1d1d;
    padding-bottom: 0.5rem;
}

.card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.5rem;
}

.rating-card {
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    padding: 1.5rem;
    transition: transform 0.2s;
}

.rating-card:hover {
    transform: translateY(-4px);
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.8rem;
}

.project-title {
    color: #333;
    font-weight: 600;
    font-size: 1.25rem;
}

.date {
    font-size: 0.9rem;
    color: #888;
}

.card-body p {
    margin: 0.3rem 0;
    color: #555;
}

.rating-section {
    margin-top: 1rem;
    padding-top: 0.8rem;
    border-top: 1px dashed #ccc;
}

.rating-section h4 {
    margin-bottom: 0.5rem;
    color: #fd1d1d;
    font-size: 1rem;
}

.stars {
    display: flex;
    align-items: center;
    font-size: 1.2rem;
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
    font-size: 0.95rem;
    color: #444;
}

.comment {
    font-style: italic;
    color: #333;
    margin-top: 0.3rem;
}

.no-rating {
    font-style: italic;
    color: #999;
}

</style>

<div class="rating-container">
    <a href="{{ route('users-page.adminArsitek') }}" class="back-link">← Kembali ke Forum</a>
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

                        <div class="rating-section">
                            <h4>Rating dari Pengguna</h4>
                            @if($riwayat->arsitekRating)
                                <div class="stars">
                                    {!! str_repeat('<span class="star">★</span>', $riwayat->arsitekRating->rating) !!}
                                    {!! str_repeat('<span class="star inactive">★</span>', 5 - $riwayat->arsitekRating->rating) !!}
                                    <span class="rating-number">({{ $riwayat->arsitekRating->rating }}/5)</span>
                                </div>
                                <p class="comment">"{{ $riwayat->arsitekRating->komentar }}"</p>
                            @else
                                <p class="no-rating">Belum ada rating</p>
                            @endif
                        </div>
                    </div>
                </div>
            @endforeach
        </div>
    @endif
</div>
