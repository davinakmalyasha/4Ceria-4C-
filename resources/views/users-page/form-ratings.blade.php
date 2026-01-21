<div class="container py-4">
    <h2>Beri Rating untuk Arsitek</h2>

    <div class="card mt-3">
        <div class="card-body">
            <h5 class="card-title">{{ $arsitek->nama }}</h5>
            <form method="POST" action="{{ route('user.rating.submit', $project->id) }}">
                @csrf

                <div class="mb-3">
                    <label for="rating" class="form-label">Rating (1-5)</label>
                    <select class="form-select" name="rating" required>
                        <option value="">-- Pilih --</option>
                        @for($i = 1; $i <= 5; $i++)
                            <option value="{{ $i }}">{{ $i }} ⭐</option>
                        @endfor
                    </select>
                </div>

                <div class="mb-3">
                    <label for="komentar" class="form-label">Komentar (opsional)</label>
                    <textarea class="form-control" name="komentar" rows="3"></textarea>
                </div>

                <button type="submit" class="btn btn-success">Kirim Rating</button>
                <a href="{{ route('user.project.riwayat') }}" class="btn btn-secondary">Batal</a>
            </form>
        </div>
    </div>
</div>

