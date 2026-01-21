<style>
    * {
        font-family: "Plus Jakarta Sans", sans-serif;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        background-color: #fff;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        padding: 20px;
    }

    .form-container {
        background-color: #fff;
        padding: 30px 40px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        width: 100%;
        max-width: 500px;
    }

    .form-container h2 {
        font-size: 28px;
        color: #fd1d1d;
        margin-bottom: 25px;
        text-align: center;
    }

    form label {
        display: block;
        font-size: 14px;
        margin-bottom: 6px;
        margin-top: 16px;
        color: #333;
    }

    form input[type="text"],
    form input[type="number"],
    form input[type="date"],
    form textarea,
    form input[type="file"] {
        width: 100%;
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid #ccc;
        font-size: 14px;
        transition: border 0.3s;
    }

    form input[type="text"]:focus,
    form input[type="number"]:focus,
    form input[type="date"]:focus,
    form textarea:focus {
        border-color: #fd1d1d;
        outline: none;
    }

    form textarea {
        resize: vertical;
        min-height: 100px;
    }

    .form-container button {
        width: 100%;
        background-color: #fd1d1d;
        color: white;
        border: none;
        padding: 12px;
        font-size: 16px;
        border-radius: 6px;
        margin-top: 25px;
        cursor: pointer;
        transition: background 0.3s;
    }

    .form-container button:hover {
        background-color: #e01313;
    }

    .form-container .current-attachment {
        margin-top: 10px;
        font-size: 14px;
    }

    .form-container a.back-link {
        display: block;
        margin-top: 20px;
        text-align: center;
        color: #fd1d1d;
        text-decoration: none;
        font-size: 14px;
    }

    .form-container a.back-link:hover {
        text-decoration: underline;
    }
</style>

<div class="form-container">
    <h2>Edit Proyek</h2>
    <form action="{{ route('project.update', $project->id) }}" method="POST" enctype="multipart/form-data">
        @csrf
        @method('PUT')

        <label for="title">Judul Proyek</label>
        <input type="text" name="title" value="{{ $project->title }}" required>

        <label for="description">Deskripsi</label>
        <textarea name="description" required>{{ $project->description }}</textarea>

        <label for="budget">Budget</label>
        <input type="number" name="budget" value="{{ $project->budget }}" required>

        <label for="deadline">Deadline</label>
        <input type="date" name="deadline" value="{{ $project->deadline }}" required>

        <label for="attachment">Ganti Lampiran (Opsional)</label>
        <input type="file" name="attachment">

        @if($project->attachment)
            <p class="current-attachment">
                Lampiran saat ini:
                <a href="{{ asset('storage/' . $project->attachment) }}" target="_blank">Lihat</a>
            </p>
        @endif

        <button type="submit">Simpan Perubahan</button>
    </form>

    <a href="{{ route('forum.project') }}" class="back-link">← Kembali ke Forum</a>
</div>
