<h1>Edit Proyek</h1>

<form action="{{ route('admin.project.update', $project->id) }}" method="POST">
    @csrf
    @method('PUT')

    <label>Judul Proyek:</label>
    <input type="text" name="title" value="{{ $project->title }}">

    <label>Deskripsi:</label>
    <textarea name="description">{{ $project->description }}</textarea>

    <label>Anggaran:</label>
    <input type="number" name="budget" value="{{ $project->budget }}">

    <label>Lokasi:</label>
    <input type="text" name="lokasi" value="{{ $project->lokasi }}">

    <label>Jenis Proyek:</label>
    <input type="text" name="lokasi" value="{{ $project->jenis_proyek }}">

   

    <button type="submit">Simpan Perubahan</button>
</form>
