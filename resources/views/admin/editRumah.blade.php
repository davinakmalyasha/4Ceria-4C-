<style>
    /* Bisa diletakkan di file CSS utama atau <style> di blade */

.edit-container {
    max-width: 900px;
    margin: 30px auto;
    padding: 30px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    font-family: 'Segoe UI', sans-serif;
}

.btn-back {
    display: inline-block;
    margin-bottom: 20px;
    color: #2c3e50;
    text-decoration: none;
    font-weight: bold;
}

.form-edit {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
}

.form-group, .form-group-full {
    display: flex;
    flex-direction: column;
}

.form-group-full {
    grid-column: 1 / -1;
}

label {
    font-weight: 600;
    margin-bottom: 6px;
}

input[type="text"],
input[type="number"],
textarea {
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 10px;
    font-size: 14px;
    width: 100%;
    resize: vertical;
}

textarea {
    min-height: 80px;
}

.room-section {
    margin-top: 30px;
    padding: 20px;
    background: #f7f7f7;
    border-radius: 12px;
    border-left: 5px solid #3498db;
}

.btn-submit {
    align-self: flex-start;
    padding: 12px 24px;
    background-color: #fd1d1d;
    color: white;
    border: none;
    border-radius: 12px;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.3s;
}

.btn-submit:hover {
    background-color: #fd1d1d;
}

</style>

<a class="btn-back" href="{{ route('admin.house.detail', ['id' => $house->id]) }}">← Kembali</a>

<div class="edit-container">
    <h2>Edit Data Rumah</h2>

    <form class="form-edit" action="{{ route('admin.update-rumah', $house->id) }}" method="POST">
        @csrf
        <div class="form-grid">
            <div class="form-group"><label>Nama Rumah</label><input type="text" name="name" value="{{ old('name', $house->name) }}" required></div>
            <div class="form-group"><label>Harga</label><input type="number" name="price" value="{{ old('price', $house->price) }}" required></div>
            <div class="form-group-full"><label>Deskripsi</label><textarea name="house_desc">{{ old('house_desc', $house->house_desc) }}</textarea></div>
            <div class="form-group"><label>Lantai</label><input type="number" name="floors" value="{{ old('floors', $house->floors) }}" required></div>
            <div class="form-group"><label>Kamar Tidur</label><input type="number" name="br" value="{{ old('br', $house->br) }}" required></div>
            <div class="form-group"><label>Kamar Mandi</label><input type="number" name="ba" value="{{ old('ba', $house->ba) }}" required></div>
            <div class="form-group"><label>Lebar</label><input type="number" name="width" value="{{ old('width', $house->width) }}" required></div>
            <div class="form-group"><label>Panjang</label><input type="number" name="length" value="{{ old('length', $house->length) }}" required></div>
            <div class="form-group"><label>Provinsi</label><input type="text" name="province" value="{{ old('province', $house->province) }}"></div>
            <div class="form-group"><label>Kab/Kota</label><input type="text" name="kab_kota" value="{{ old('kab_kota', $house->kab_kota) }}"></div>
            <div class="form-group"><label>Kecamatan</label><input type="text" name="kecamatan" value="{{ old('kecamatan', $house->kecamatan) }}"></div>
            <div class="form-group"><label>Kelurahan</label><input type="text" name="kelurahan" value="{{ old('kelurahan', $house->kelurahan) }}"></div>
            <div class="form-group"><label>Kode Pos</label><input type="text" name="postal_code" value="{{ old('postal_code', $house->postal_code) }}"></div>
            <div class="form-group-full"><label>Alamat Detail</label><input type="text" name="street_name" value="{{ old('street_name', $house->street_name) }}"></div>
            <div class="form-group-full"><label>Koordinat (lat,lng)</label><input type="text" name="coordinate" value="{{ old('coordinate', $house->coordinate) }}"></div>
        </div>

        <h3>Daftar Ruangan</h3>
        @foreach ($house->room as $i => $room)
            <div class="room-section">
                <div class="form-group"><label>Nama Ruangan</label><input type="text" name="rooms[{{ $i }}][name]" value="{{ old("rooms.$i.name", $room->name) }}"></div>
                <div class="form-group"><label>Lebar (m)</label><input type="number" name="rooms[{{ $i }}][width]" value="{{ old("rooms.$i.width", $room->width) }}"></div>
                <div class="form-group"><label>Panjang (m)</label><input type="number" name="rooms[{{ $i }}][length]" value="{{ old("rooms.$i.length", $room->length) }}"></div>
                <div class="form-group-full"><label>Deskripsi</label><textarea name="rooms[{{ $i }}][desc]">{{ old("rooms.$i.desc", $room->desc) }}</textarea></div>
                <input type="hidden" name="rooms[{{ $i }}][id]" value="{{ $room->id }}">
            </div>
        @endforeach

        <button type="submit" class="btn-submit">Simpan Perubahan</button>
    </form>
</div>
