<x-app-layout>
    <link rel="stylesheet" href="{{ URL::asset('css/forumProject.css') }}">

    <div class="page-header">
        <h1>Forum Proyek Saya</h1>
        <a href="{{ route('form.post.project') }}" class="btn btn-primary">Buat Proyek Baru</a>
    </div>

    @foreach($projects as $project)
    <div class="project-card">
        <div class="project-header">
            <h2>{{ $project->title }}</h2>
            @php
    $statusText = '';

    if ($project->status === 'open') {
        $statusText = '🔍 Sedang mencari arsitek';
    } elseif ($project->status === 'accepted_arsitek') {
        if ($project->status_kontraktor === 'pending') {
            $statusText = '👷 Arsitek terpilih. Menunggu keputusan cari kontraktor.';
        } elseif ($project->status_kontraktor === 'skip') {
            $statusText = '✅ Arsitek dipilih. Tidak menggunakan kontraktor.';
        } elseif ($project->status_kontraktor === 'posted') {
            $statusText = '🏗️ Sedang mencari kontraktor';
        }
    } elseif ($project->status === 'accepted_kontraktor') {
        $statusText = '✅ Arsitek & kontraktor terpilih';
    } elseif ($project->status === 'completed') {
        $statusText = '🏁 Proyek selesai';
    }
@endphp

<p class="project-status"><strong>Status:</strong> {{ $statusText }}</p>

            <span class="budget">Rp{{ number_format($project->budget, 0, ',', '.') }}</span>
             @if (
    ($project->status === 'accepted_arsitek' && $project->status_kontraktor === 'skip') ||
    $project->status === 'accepted_kontraktor'
)
    <form action="{{ route('project.markCompleted', $project->id) }}" method="POST" onsubmit="return confirm('Yakin ingin menyelesaikan proyek ini?')">
        @csrf
        @method('PUT')
        <button type="submit" class="btn btn-success">
            ✅ Tandai Proyek Selesai
        </button>
    </form>
@endif
        </div>

        <p class="project-desc">{{ $project->description }}</p>
        <p class="meta-info">📍 {{ $project->lokasi }} | ⏱️ {{ $project->created_at->diffForHumans() }}</p>

        @if($project->deadline)
        <p class="meta-info">📅 Deadline: {{ \Carbon\Carbon::parse($project->deadline)->format('d M Y') }}</p>
        @endif

        @if($project->attachment)
        <div class="attachment">
            @if(Str::endsWith($project->attachment, ['jpg', 'jpeg', 'png']))
            <img src="{{ asset('storage/' . $project->attachment) }}" alt="Lampiran">
            @else
            <a href="{{ asset('storage/' . $project->attachment) }}" target="_blank">📎 Lihat Lampiran</a>
            @endif
        </div>
        @endif

        @if(Auth::id() === $project->user_id)
        <div class="action-buttons">
            <a href="{{ route('project.edit', $project->id) }}" class="btn btn-outline">Edit</a>
            <form action="{{ route('project.delete', $project->id) }}" method="POST" onsubmit="return confirm('Yakin ingin menghapus proyek ini?')">
                @csrf
                @method('DELETE')
                <button type="submit" class="btn btn-danger">Hapus</button>
            </form>
        </div>
        @endif
        <div class="section">
            <h3>👷 Bid dari Arsitek</h3>
            @forelse($project->bidsArsitek as $bid)
            <div class="bid-card">
                <img src="{{ asset('storage/' . $bid->arsitek->user->pic) }}" alt="Foto Arsitek">
                <div class="bid-info">
                    <h4>{{ $bid->arsitek->nama }}</h4>
                    <p>📞 {{ $bid->arsitek->no_telp }}</p>
                    <p>🎨 {{ $bid->arsitek->spesialisasi }}</p>
                    <p>⌛ {{ $bid->arsitek->pengalaman_tahun }} tahun</p>
                    <p>📝 Proposal:
                        <a href="{{ asset('storage/' . $bid->proposal) }}" target="_blank">
                            Lihat Proposal
                        </a>
                    </p>

                    <p>💰 Rp{{ number_format($bid->arsitek->rate_harga, 0, ',', '.') }}</p>
                    <p>Status: <strong>{{ ucfirst($bid->status) }}</strong></p>

                    <div class="bid-actions">
                        <a href="{{ route('arsitek.detail', $bid->arsitek->id) }}" class="btn btn-info">Lihat Profil</a>
                        @if(!$project->selected_arsitek_id)
                        <form action="{{ route('bid.arsitek.select', [$project->id, $bid->arsitek_id]) }}" method="POST">
                            @csrf
                            <button type="submit" class="btn btn-primary">Pilih Arsitek Ini</button>
                        </form>
                        @endif
                    </div>
                </div>
            </div>
            @empty
            <p class="no-bid">Belum ada bid dari arsitek.</p>
            @endforelse
        </div>

        @if($project->status == 'accepted_arsitek' && $project->status_kontraktor == 'pending')
        <div class="section contractor-options">
            <p>🔧 Ingin mencari kontraktor untuk proyek ini?</p>
            <form action="{{ route('project.updateStatusKontraktor', $project->id) }}" method="POST">
                @csrf
                @method('PUT')
                <button name="status_kontraktor" value="posted" class="btn btn-primary">Cari Kontraktor</button>
                <button name="status_kontraktor" value="skip" class="btn btn-outline">Hanya Hire Arsitek</button>
            </form>
        </div>
        @endif

        @if($project->status_kontraktor == 'posted')
        <div class="section">
            <h3>🚧 Bid dari Kontraktor</h3>
            @foreach($project->bidsKontraktor as $bid)
            <div class="bid-card">
                <img src="{{ asset('storage/' . $bid->kontraktor->user->pic) }}" alt="Foto Arsitek">
                <div class="bid-info">
                    <h4>{{ $bid->kontraktor->nama }}</h4>
                    <p>📞 {{ $bid->kontraktor->no_telp }}</p>
                    <p>💰 Penawaran: Rp{{ number_format($bid->price, 0, ',', '.') }}</p>
                    <p>📝 Proposal:
                        <a href="{{ asset('storage/' . $bid->proposal) }}" target="_blank">
                            Lihat Proposal
                        </a>
                    </p>

                    <p>Status: <strong>{{ ucfirst($bid->status) }}</strong></p>

                    <div class="bid-actions">
                        @if ($bid->kontraktor)
                        <a href="{{ route('kontraktor.detail', $bid->kontraktor->id) }}" class="btn btn-info">Lihat Profil</a>
                        @else
                        <span style="color:red">Profil kontraktor tidak tersedia</span>
                        @endif

                        @if(!$project->selected_kontraktor_id)
                        <form action="{{ route('bid.kontraktor.select', [$project->id, $bid->kontraktor_id]) }}" method="POST">
                            @csrf
                            <button type="submit" class="btn btn-primary">Pilih Kontraktor Ini</button>
                        </form>
                        @endif

                        @if($project->jenis_proyek !== 'umum')
                        <div class="checkbox-list">
                            <p>Pilih bidang kerja:</p>
                            @foreach(explode(',', $project->jenis_proyek) as $jenis)
                            <label><input type="checkbox" name="bidang_kerja[]" value="{{ $jenis }}"> {{ ucfirst($jenis) }}</label><br>
                            @endforeach
                        </div>
                        @endif
                    </div>
                </div>
            </div>
            @endforeach
        </div>
        @endif
    </div>
    @endforeach
</x-app-layout>