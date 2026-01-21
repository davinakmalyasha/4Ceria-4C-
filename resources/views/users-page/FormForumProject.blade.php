<x-app-layout>
    <style>
        body {
    background-color: #fff;
    font-family: 'Segoe UI', sans-serif;
    color: #2d3436;
}

.form-container {
    max-width: 600px;
    margin: 40px auto;
    background: #fff;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 0 20px rgba(0,0,0,0.05);
}

h2 {
    color: #fd1d1d;
    margin-bottom: 25px;
    text-align: center;
}

.form-group {
    margin-bottom: 20px;
}

label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
}

input[type="text"],
input[type="number"],
input[type="date"],
input[type="file"],
select,
textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 8px;
    font-size: 15px;
    transition: 0.2s border-color ease;
}

input:focus,
textarea:focus,
select:focus {
    border-color: #fd1d1d;
    outline: none;
}

textarea {
    resize: vertical;
}

.form-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 30px;
}

.btn {
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
    text-decoration: none;
    border: none;
    transition: all 0.2s ease-in-out;
    display: inline-block;
}

.btn-primary {
    background-color: #fd1d1d;
    color: white;
}

.btn-outline {
    border: 2px solid #fd1d1d;
    color: #fd1d1d;
    background-color: transparent;
}

    </style>

    <div class="form-container">
        <h2>📋 Tambah Proyek</h2>
        <form action="{{ route('project.store') }}" method="POST" enctype="multipart/form-data">
            @csrf

            <div class="form-group">
                <label for="title">Judul Proyek</label>
                <input type="text" name="title" id="title" required>
            </div>

            <div class="form-group">
                <label for="description">Deskripsi</label>
                <textarea name="description" id="description" rows="4" required></textarea>
            </div>

            <div class="form-group">
                <label for="budget">Budget (Rp)</label>
                <input type="number" name="budget" id="budget" required>
            </div>

            <div class="form-group">
                <label for="lokasi">Lokasi</label>
                <input type="text" name="lokasi" id="lokasi" required>
            </div>

            <div class="form-group">
                <label for="jenis_proyek">Jenis Proyek</label>
                <select name="jenis_proyek" id="jenis_proyek" required>
                    <option value="umum">Umum</option>
                    <option value="fondasi">Fondasi</option>
                    <option value="struktur">Struktur</option>
                    <option value="dinding">Dinding</option>
                    <option value="atap">Atap</option>
                    <option value="lantai">Lantai</option>
                    <option value="ventilasi">Ventilasi</option>
                    <option value="listrik">Listrik</option>
                </select>
            </div>

            <div class="form-group">
                <label for="deadline">Deadline Proyek</label>
                <input type="date" name="deadline" id="deadline" required>
            </div>

            <div class="form-group">
                <label for="attachment">Lampiran (Opsional)</label>
                <input type="file" name="attachment" id="attachment">
            </div>

            <div class="form-actions">
                <button type="submit" class="btn btn-primary">🚀 Tambah Proyek</button>
                <a href="{{ route('forum.project') }}" class="btn btn-outline">Kembali</a>
            </div>
        </form>
    </div>
</x-app-layout>
