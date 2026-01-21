    <style>
        * {
    font-family: 'Plus Jakarta Sans', sans-serif;
    box-sizing: border-box;
}
    </style>
    
    <div class="container">
    <a href="{{ route('users-page.admin') }}" class="btn btn-secondary">Kembali</a>
        <h2 class="mb-4">Daftar Rumah Yang Dijual User</h2>

        @include('users-page.house.house-list')

    </div>

