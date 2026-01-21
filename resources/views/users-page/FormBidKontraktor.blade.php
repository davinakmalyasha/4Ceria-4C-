<style>
.form-bid {
    margin-top: 20px;
    padding: 20px;
    background: #ffffff;
    border: 1px solid #fd1d1d;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(253, 29, 29, 0.1);
}

.form-bid .form-section {
    margin-bottom: 16px;
}

.form-bid label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
    color: #fd1d1d;
}

.form-bid input[type="number"],
.form-bid textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #fd1d1d;
    border-radius: 8px;
    font-size: 14px;
    background-color: #ffffff;
    color: #333;
}

.form-bid input[type="number"]:focus,
.form-bid textarea:focus {
    outline: none;
    border-color: #e60000;
    box-shadow: 0 0 5px rgba(253, 29, 29, 0.3);
}

.form-bid textarea {
    min-height: 120px;
    resize: vertical;
}

.form-bid .submit-btn {
    background-color: #fd1d1d;
    color: white;
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.form-bid .submit-btn:hover {
    background-color: #e60000;
}

.form-bid .posted-time {
    margin-top: 12px;
    font-size: 13px;
    font-style: italic;
    color: #999;
}


</style>

<form action="{{ route('bid.kontraktor', ['project' => $project->id]) }}" method="POST" class="form-bid" enctype="multipart/form-data">
    @csrf

    <div class="form-section">
        <label for="price">💰 Harga Penawaran</label>
        <input type="number" id="price" name="price" placeholder="Masukkan harga penawaran" required>
    </div>

    <div class="form-section">
    <label for="proposal">📝 Proposal</label>
    <input 
        type="file" 
        name="proposal" 
        id="proposal" 
        class="form-control" 
        accept=".pdf,.jpg,.png" 
        required>
</div>

<div class="form-section">
    <label for="waktu_pengerjaan">🕒 Waktu Pengerjaan (hari)</label>
    <input type="number" id="waktu_pengerjaan" name="waktu_pengerjaan" placeholder="Contoh: 14" required>
</div>


    <button type="submit" class="submit-btn">Submit Bid</button>

    <p class="posted-time">📅 Diposting: {{ \Carbon\Carbon::parse($project->created_at)->diffForHumans() }}</p>
</form>
