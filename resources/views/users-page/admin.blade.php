<style>
    .admin-navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: #fd1d1d;
    padding: 16px 32px;
    border-radius: 0 0 12px 12px;
    color: white;
    font-family: 'Segoe UI', sans-serif;
}

.admin-profile {
    font-size: 18px;
    font-weight: bold;
}

.nav-links {
    display: flex;
    list-style: none;
    gap: 24px;
    margin: 0;
    padding: 0;
}

.nav-links li a {
    text-decoration: none;
    color: white;
    font-weight: 500;
    transition: color 0.3s ease;
}

.nav-links li a:hover {
    color: #ffeaea;
}

.logout-form {
    display: inline;
}

.logout-form button {
    background-color: transparent;
    border: 2px solid white;
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-weight: 500;
}

.logout-form button:hover {
    background-color: white;
    color: #fd1d1d;
}

</style>
<div class="admin-navbar">
    <div class="admin-profile">Admin - {{ Auth::user()->name }}</div>
    <ul class="nav-links">
        <li><a href="{{ route('admin.manage-users') }}">Manage Users</a></li>
        <li><a href="{{ route('admin.pengajuan-spesialisasi') }}">Validasi Spesialisasi</a></li>
        <li><a href="{{ route('admin.rumah-user') }}">Rumah Dijual</a></li>
        <li><a href="{{ route('admin.project') }}">Project</a></li>
        <li>
            <form action="{{ route('logout') }}" method="POST" class="logout-form">
                @csrf
                <button type="submit">Logout</button>
            </form>
        </li>
    </ul>
</div>