<style>
    .form-bid {
    background-color: #fff;
    border: 1px solid #fd1d1d;
    padding: 32px;
    border-radius: 16px;
    box-shadow: 0 6px 15px rgba(0, 0, 0, 0.1);
    max-width: 600px;
    margin: 30px auto;
    font-family: 'Segoe UI', sans-serif;
    color: #333;
}

.form-bid h2 {
    color: #fd1d1d;
    text-align: center;
    margin-bottom: 24px;
}

.form-section {
    margin-bottom: 20px;
}

.form-section label {
    display: block;
    font-weight: 600;
    margin-bottom: 8px;
    color: #fd1d1d;
}

.form-section input[type="number"],
.form-section textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #ccc;
    border-radius: 8px;
    font-size: 15px;
    transition: border 0.2s ease;
}

.form-section input[type="number"]:focus,
.form-section textarea:focus {
    border-color: #fd1d1d;
    outline: none;
}

textarea {
    resize: vertical;
    min-height: 100px;
}

.submit-btn {
    background-color: #fd1d1d;
    color: #fff;
    border: none;
    padding: 12px 20px;
    font-size: 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    display: block;
    width: 100%;
    margin-top: 10px;
}

.submit-btn:hover {
    background-color: #d91717;
}

.posted-time {
    font-size: 14px;
    color: #777;
    margin-top: 18px;
    text-align: right;
}

.btn-back {
    display: block;
    text-align: center;
    margin: 20px auto 0;
    padding: 10px 20px;
    border: 2px solid #fd1d1d;
    color: #fd1d1d;
    text-decoration: none;
    border-radius: 8px;
    font-weight: bold;
    width: fit-content;
    transition: background-color 0.3s, color 0.3s;
}

.btn-back:hover {
    background-color: #fd1d1d;
    color: #fff;
}

</style>

<div class="form-bid">
<form action="{{ route('bid.arsitek', ['project' => $project->id]) }}" method="POST" enctype="multipart/form-data">
        @csrf

        <div class="form-section">
            <label>Harga Penawaran:</label>
            <input type="number" name="price" required>
        </div>

        <div class="form-section">
            <label>Waktu Pengerjaan (dalam hari):</label>
            <input type="number" name="waktu_pengerjaan" required>
        </div>

        <div class="form-section">
            <label>Catatan (opsional):</label>
            <textarea name="catatan"></textarea>
        </div>

        <div class="form-section">
        <label for="proposal">📝 Proposal</label>
        <input 
            type="file" 
            name="proposal" 
            id="proposal" 
            accept=".pdf,.jpg,.png" 
            required>
    </div>

        <button type="submit" class="submit-btn">Submit Bid</button>

        <p class="posted-time"><strong>Diposting:</strong> {{ \Carbon\Carbon::parse($project->created_at)->diffForHumans() }}</p>
    </form>

    <a href="{{ route('arsitek.bidding') }}" class="btn-back">Kembali</a>
</div>
