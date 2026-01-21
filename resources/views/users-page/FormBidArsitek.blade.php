<form action="{{ route('bid.arsitek', ['project' => $project->id]) }}" method="POST">
    @csrf
    <label>Harga Penawaran:</label>
    <input type="number" name="price" required>

    <label>Proposal:</label>
    <textarea name="proposal" required></textarea>

    <button type="submit">Submit Bid</button>
    <p><strong>Diposting:</strong> {{ \Carbon\Carbon::parse($project->created_at)->diffForHumans() }}</p>
</form>