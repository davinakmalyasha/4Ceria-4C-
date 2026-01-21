<style>
    /* ===== GLOBAL ===== */
* {
    font-family: 'Plus Jakarta Sans', sans-serif;
    box-sizing: border-box;
}

body {
    background-color: #fff;
    color: #333;
    margin: 0;
    padding: 0;
}

.container {
    max-width: 960px;
    margin: auto;
    padding: 20px;
}

/* ===== HEADER & BUTTON ===== */
h3 {
    margin-top: 20px;
    font-weight: 600;
}

.btn-secondary {
    background-color: #ccc;
    color: #333;
    border: none;
}

.btn-secondary:hover {
    background-color: #aaa;
    color: white;
}

/* ===== ALERT ===== */
.alert-success {
    background-color: #d4edda;
    border-left: 6px solid #28a745;
    color: #155724;
    padding: 10px 15px;
    border-radius: 6px;
}

/* ===== TABLE ===== */
.table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
    background-color: #fff;
}

.table thead {
    background-color: #f8f8f8;
}

.table th,
.table td {
    padding: 12px;
    border: 1px solid #ddd;
    text-align: center;
    vertical-align: middle;
}

.table tbody tr:hover {
    background-color: #fff5f5;
}

/* ===== BUTTON Aksi ===== */
.btn-sm {
    font-size: 14px;
    padding: 6px 10px;
    border-radius: 5px;
}

.btn-success {
    background-color: #28a745;
    color: white;
    border: none;
}

.btn-success:hover {
    background-color: #218838;
}

.btn-danger {
    background-color: #fd1d1d;
    color: white;
    border: none;
}

.btn-danger:hover {
    background-color: #c91313;
}

/* ===== LINK SERTIFIKAT ===== */
a[target="_blank"] {
    color: #fd1d1d;
    font-weight: 500;
}

a[target="_blank"]:hover {
    text-decoration: underline;
}

</style>
<div class="container mt-4">
<a href="{{ route('users-page.admin') }}" class="btn btn-secondary">Kembali</a>
    <h3>Daftar Pengajuan Spesialisasi Kontraktor</h3>

    @if(session('success'))
        <div class="alert alert-success mt-2">{{ session('success') }}</div>
    @endif

    <table class="table table-bordered mt-3">
        <thead>
            <tr>
                <th>Nama Kontraktor</th>
                <th>Spesialisasi</th>
                <th>Bukti Sertifikat</th>
                <th>Aksi</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($pengajuan as $item)
                <tr>
                    <td>{{ $item->kontraktor->nama }}</td>
                    <td>{{ $item->spesialisasi->nama }}</td>
                    <td>
                        <a href="{{ asset('storage/' . $item->file_sertifikat) }}" target="_blank">Lihat Sertifikat</a>
                    </td>
                    <td>
                        <form action="{{ route('admin.proses-pengajuan-spesialisasi', $item->id) }}" method="POST" class="d-inline">
                            @csrf
                            <button type="submit" name="status" value="approved" class="btn btn-success btn-sm">Setujui</button>
                            <button type="submit" name="status" value="rejected" class="btn btn-danger btn-sm">Tolak</button>
                        </form>
                    </td>
                </tr>
            @endforeach

            @if($pengajuan->isEmpty())
                <tr>
                    <td colspan="4" class="text-center">Tidak ada pengajuan saat ini.</td>
                </tr>
            @endif
        </tbody>
    </table>
</div>

