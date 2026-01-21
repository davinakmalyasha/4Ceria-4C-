<style>
    body {
        font-family: Arial, sans-serif;
        background: #f7f7f7;
        margin: 0;
        padding: 0;
    }

    .rating-container {
        max-width: 600px;
        margin: 40px auto;
        padding: 20px;
    }

    .rating-title {
        text-align: center;
        color: #333;
        margin-bottom: 20px;
    }

    .rating-card {
        background-color: #fff;
        border: 2px solid #fd1d1d;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
    }

    .rating-header {
        display: flex;
        align-items: center;
        gap: 15px;
        margin-bottom: 20px;
    }

    .avatar {
        width: 50px;
        height: 50px;
        background-color: #fd1d1d;
        color: white;
        font-size: 24px;
        font-weight: bold;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    form label {
        display: block;
        margin-top: 15px;
        margin-bottom: 5px;
        font-weight: bold;
        color: #333;
    }

    select,
    textarea {
        width: 100%;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 8px;
        font-size: 14px;
        resize: vertical;
    }

    .btn-group {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
    }

    .btn-submit,
    .btn-cancel {
        padding: 10px 20px;
        border: none;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .btn-submit {
        background-color: #fd1d1d;
        color: white;
    }

    .btn-submit:hover {
        background-color: #d31414;
    }

    .btn-cancel {
        background-color: #e0e0e0;
        color: #333;
        text-decoration: none;
        display: inline-block;
        text-align: center;
    }

    .btn-cancel:hover {
        background-color: #c5c5c5;
    }
</style>


<div class="rating-container">
    <h2 class="rating-title">Beri Rating untuk {{ ucfirst($tipe) }}</h2>

    <div class="rating-card">
        <div class="rating-header">
            <div class="avatar">{{ strtoupper(substr($target->nama, 0, 1)) }}</div>
            <h3>{{ $target->nama }}</h3>
        </div>

        <form method="POST" action="{{ route('user.rating.submit', ['project_id' => $project->id, 'tipe' => $tipe]) }}">
            @csrf
            <input type="hidden" name="tipe" value="{{ $tipe }}">

            <label for="rating">Rating (1-5)</label>
            <select name="rating" required>
                <option value="">-- Pilih --</option>
                @for($i = 1; $i <= 5; $i++)
                    <option value="{{ $i }}">{{ $i }} ⭐</option>
                @endfor
            </select>

            <label for="komentar">Komentar (opsional)</label>
            <textarea name="komentar" rows="3" placeholder="Tulis komentar Anda..."></textarea>

            <div class="btn-group">
                <button type="submit" class="btn-submit">Kirim Rating</button>
                <a href="{{ route('user.project.riwayat') }}" class="btn-cancel">Batal</a>
            </div>
        </form>
    </div>
</div>
