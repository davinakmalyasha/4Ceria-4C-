@php
    $activeRole = request('role'); 
@endphp

<style>
   /* ====== GLOBAL ====== */
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

a {
    text-decoration: none;
    color: inherit;
}

/* ====== BUTTONS ====== */
.btn {
    border-radius: 6px;
    padding: 8px 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
}

.btn-primary {
    background-color: #fd1d1d;
    color: #fff;
    border: none;
}

.btn-primary:hover {
    background-color: #e41414;
}

.btn-secondary {
    background-color: #ccc;
    color: #333;
}

.btn-danger {
    background-color: #fd1d1d;
    color: white;
    border: none;
}

.btn-danger:hover {
    background-color: #c91313;
}

/* ====== KEMBALI LINK ====== */
.kembali-link {
    display: inline-block;
    margin-bottom: 20px;
    color: #fd1d1d;
    font-weight: bold;
}

/* ====== KARTU RINGKASAN ====== */
.card-hover {
    transition: all 0.3s ease;
}

.card-hover:hover .card {
    transform: translateY(-5px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

.card-active .card {
    border: 2px solid #fd1d1d;
    box-shadow: 0 0 12px rgba(253, 29, 29, 0.5);
}

/* ====== TABEL ====== */
table {
    width: 100%;
    border-collapse: collapse;
}

.table th,
.table td {
    padding: 12px;
    text-align: center;
}

.table th {
    background-color: #f5f5f5;
}

.table-hover tbody tr:hover {
    background-color: #ffecec;
}

/* ====== PAGINATION ====== */
.pagination {
    display: flex;
    justify-content: center;
    gap: 6px;
    margin-top: 20px;
}

.pagination a,
.pagination span {
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid #ddd;
    color: #333;
}

.pagination span strong {
    background-color: #fd1d1d;
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
}

/* ====== INPUT GROUP ====== */
.input-group {
    display: flex;
    max-width: 500px;
    margin-bottom: 20px;
}

.input-group input[type="text"] {
    flex: 1;
    padding: 10px;
    border: 1px solid #ccc;
    border-right: none;
    border-radius: 6px 0 0 6px;
}

.input-group button {
    background-color: #fd1d1d;
    color: white;
    border: 1px solid #fd1d1d;
    border-radius: 0 6px 6px 0;
}

</style>


<div class="container">
<a href="{{ route('users-page.admin') }}">Kembali</a>
    <h2 class="mb-4">Kelola Pengguna</h2>
    <div style="display: flex; gap: 20px;" class="row mb-4">
    <div class="col-md-3">
    <a href="{{ route('admin.manage-users', ['role' => null]) }}" class="card-hover {{ is_null($activeRole) ? 'card-active' : '' }}">
        <div class="card text-white bg-primary mb-3">
            <div class="card-body">
                <h5 class="card-title">Total Pengguna</h5>
                <p class="card-text fs-4">{{ $jumlahUserPerRole['total'] }}</p>
            </div>
        </div>
    </a>
</div>

<div class="col-md-3">
    <a href="{{ route('admin.manage-users', ['role' => 'user']) }}" class="card-hover {{ $activeRole == 'user' ? 'card-active' : '' }}">
        <div class="card text-white bg-success mb-3">
            <div class="card-body">
                <h5 class="card-title">User Biasa</h5>
                <p class="card-text fs-4">{{ $jumlahUserPerRole['user'] }}</p>
            </div>
        </div>
    </a>
</div>

<div class="col-md-3">
    <a href="{{ route('admin.manage-users', ['role' => 'arsitek']) }}" class="card-hover {{ $activeRole == 'arsitek' ? 'card-active' : '' }}">
        <div class="card text-white bg-warning mb-3">
            <div class="card-body">
                <h5 class="card-title">Arsitek</h5>
                <p class="card-text fs-4">{{ $jumlahUserPerRole['arsitek'] }}</p>
            </div>
        </div>
    </a>
</div>

<div class="col-md-3">
    <a href="{{ route('admin.manage-users', ['role' => 'kontraktor']) }}" class="card-hover {{ $activeRole == 'kontraktor' ? 'card-active' : '' }}">
        <div class="card text-white bg-info mb-3">
            <div class="card-body">
                <h5 class="card-title">Kontraktor</h5>
                <p class="card-text fs-4">{{ $jumlahUserPerRole['kontraktor'] }}</p>
            </div>
        </div>
    </a>
</div>

</div>


    @if (session('success'))
        <div class="alert alert-success">{{ session('success') }}</div>
    @endif

   <form method="GET" action="{{ route('admin.manage-users') }}" class="mb-3">
    <input type="hidden" name="role" value="{{ request('role') }}">
    <div class="input-group">
        <input type="text" name="search" class="form-control" placeholder="Cari nama / username / email / no telp..." value="{{ request('search') }}">
        <button type="submit" class="btn btn-primary">Cari</button>
    </div>
</form>



     <table class="table table-bordered table-hover">
        <thead class="table-light">
            <tr>
                <th>No</th>
                <th>Nama</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Aksi</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($users as $index => $user)
                <tr>
                    <td>{{ ($users->currentPage() - 1) * $users->perPage() + $index + 1 }}</td>
                    <td>{{ $user->name }}</td>
                    <td>{{ $user->username }}</td>
                    <td>{{ $user->email }}</td>
                    <td>{{ $user->role_type }}</td>
                    <td>
                        <form action="{{ route('admin.delete-user', $user->id) }}" method="POST" onsubmit="return confirm('Yakin ingin menghapus user ini?')">
                            @csrf
                            @method('DELETE')
                            <button class="btn btn-danger btn-sm">Hapus</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="6" class="text-center">Tidak ada data pengguna</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <div class="pagination">
    @if ($users->onFirstPage())
        <span>«</span>
    @else
        <a href="{{ $users->previousPageUrl() }}">«</a>
    @endif

    @for ($i = 1; $i <= $users->lastPage(); $i++)
        @if ($i == $users->currentPage())
            <span><strong>{{ $i }}</strong></span>
        @else
            <a href="{{ $users->url($i) }}">{{ $i }}</a>
        @endif
    @endfor

    @if ($users->hasMorePages())
        <a href="{{ $users->nextPageUrl() }}">»</a>
    @else
        <span>»</span>
    @endif
</div>
