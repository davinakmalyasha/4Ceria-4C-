<style>
/* Styling tombol Kembali */
.btn-secondary {
    background-color: #6c757d;
    color: white;
    padding: 10px 20px;
    text-decoration: none;
    border-radius: 5px;
    font-weight: bold;
    display: inline-block;
    margin-bottom: 20px;
}

.btn-secondary:hover {
    background-color: #5a6268;
}

/* Styling untuk header */
h1 {
    font-size: 24px;
    font-weight: bold;
    color: #495057;
    margin-bottom: 20px;
}

h2 {
    font-size: 20px;
    font-weight: bold;
    color: #495057;
    margin-top: 40px;
}

/* Styling untuk tabel */
table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
}

table th, table td {
    padding: 10px;
    text-align: left;
    border: 1px solid #ddd;
}

table th {
    background-color: #f8f9fa;
    color: #343a40;
    font-weight: bold;
}

table tr:nth-child(even) {
    background-color: #f2f2f2;
}

table tr:hover {
    background-color: #e9ecef;
}

/* Styling untuk tombol Edit dan Hapus */
.btn-edit, .btn-delete {
    padding: 6px 12px;
    font-size: 14px;
    border-radius: 4px;
    text-decoration: none;
    cursor: pointer;
    display: inline-block;
}

.btn-edit {
    background-color: #007bff;
    color: white;
    margin-right: 5px;
}

.btn-edit:hover {
    background-color: #0056b3;
}

.btn-delete {
    background-color: #dc3545;
    color: white;
    border: none;
}

.btn-delete:hover {
    background-color: #c82333;
}

/* Responsive design untuk tabel */




</style>

<a href="{{ route('users-page.admin') }}" class="btn btn-secondary mb-3">Kembali</a>

<h1>Daftar Proyek </h1>

<table class="table table-striped table-bordered">
    <thead>
        <tr>
            <th>ID</th>
            <th>User ID</th>
            <th>Judul Proyek</th>
            <th>Deskripsi</th>
            <th>Anggaran</th>
            <th>Lokasi</th>
            <th>Status</th>
            <th>Arsitek Terpilih</th>
            <th>Kontraktor Terpilih</th>
            <th>Status Kontraktor</th>
            <th>Jenis Proyek</th>
            <th>Edit</th>
            <th>Hapus</th>
        </tr>
    </thead>
    <tbody>
        @foreach($projects as $project)
            <tr>
                <td>{{ $project->id }}</td>
                <td>{{ $project->user_id }}</td>
                <td>{{ $project->title }}</td>
                <td>{{ $project->description }}</td>
                <td>{{ number_format($project->budget, 0, ',', '.') }}</td>
                <td>{{ $project->lokasi }}</td>
                <td>{{ $project->status }}</td>
                <td>{{ $project->selected_arsitek_id }}</td>
                <td>{{ $project->selected_kontraktor_id }}</td>
                <td>{{ $project->status_kontraktor }}</td>
                <td>{{ $project->jenis_proyek }}</td>
                <td> <a href="{{ route('admin.project.edit', $project->id) }}" class="btn-edit">Edit</a>

               <td><form action="{{ route('admin.project.delete', $project->id) }}" method="POST" style="display:inline;">
                    @csrf
                    @method('DELETE')
                    <button type="submit" class="btn-delete" onclick="return confirm('Yakin ingin menghapus proyek ini?')">Hapus</button>
                </form></td>
            </tr>
        @endforeach
    </tbody>
</table>

<h2 style="margin-top: 40px;">Daftar Bidding Arsitek</h2>

<table class="table table-striped table-bordered">
    <thead>
        <tr>
            <th>ID</th>
            <th>Project ID</th>
            <th>Arsitek ID</th>
            <th>Email Arsitek</th>
            <th>Harga Penawaran</th>
            <th>Proposal</th>
            <th>Status</th>
        </tr>
    </thead>
    <tbody>
        @foreach($bidsArsitek as $bid)
            <tr>
                <td>{{ $bid->id }}</td>
                <td>{{ $bid->project_id }}</td>
                <td>{{ $bid->arsitek_id }}</td>
                <td>{{ $bid->email_arsitek }}</td>
                <td>{{ number_format($bid->price, 0, ',', '.') }}</td>
                <td>{{ $bid->proposal }}</td>
                <td>{{ $bid->status }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

<h2 style="margin-top: 40px;">Daftar Bidding Kontraktor</h2>

<table class="table table-striped table-bordered">
    <thead>
        <tr>
            <th>ID</th>
            <th>Project ID</th>
            <th>Kontraktor ID</th>
            <th>Harga Penawaran</th>
            <th>Proposal</th>
            <th>Status</th>
        </tr>
    </thead>
    <tbody>
        @foreach($bidsKontraktor as $bid)
            <tr>
                <td>{{ $bid->id }}</td>
                <td>{{ $bid->project_id }}</td>
                <td>{{ $bid->kontraktor_id }}</td>
                <td>{{ number_format($bid->price, 0, ',', '.') }}</td>
                <td>{{ $bid->proposal }}</td>
                <td>{{ $bid->status }}</td>
            </tr>
        @endforeach
    </tbody>
</table>
