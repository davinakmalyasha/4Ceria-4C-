<div class="container mt-5">
<a href="{{ route('users-page.adminKontraktor') }}" class="btn btn-secondary">Kembali</a>
    <h2 class="mb-4">Ajukan Spesialisasi</h2>

    {{-- Success Message --}}
    @if(session('success'))
        <div class="alert alert-success">{{ session('success') }}</div>
    @endif

    {{-- Error Validation --}}
    @if ($errors->any())
        <div class="alert alert-danger">
            <strong>Terjadi kesalahan:</strong>
            <ul>
                @foreach ($errors->all() as $error)
                    <li>{{ $error }}</li>
                @endforeach
            </ul>
        </div>
    @endif

    {{-- Logic: Punya Umum? --}}
    @php
        $punyaUmum = $kontraktor->spesialisasis->contains(function($s) {
            return strtolower($s->nama) === 'umum';
        });

        $spesialisasiDimiliki = $kontraktor->spesialisasis->pluck('id')->toArray();
        $spesialisasiDiajukan = $kontraktor->pengajuanSpesialisasi()
            ->where('status', 'pending')
            ->pluck('spesialisasi_id')
            ->toArray();
    @endphp

    @if ($punyaUmum)
        <div class="alert alert-info">Anda sudah memiliki spesialisasi <strong>Umum</strong>, tidak dapat mengajukan spesialisasi tambahan.</div>
    @else
        

    
        <form action="{{ route('kontraktor.ajukan-spesialisasi') }}" method="POST" enctype="multipart/form-data">
            @csrf

            {{-- Dropdown Spesialisasi --}}
            <div class="mb-3">
                <label for="spesialisasi_id" class="form-label">Pilih Spesialisasi</label>
                <select name="spesialisasi_id" id="spesialisasi_id" class="form-select" required>
                    <option value="">-- Pilih Spesialisasi --</option>
                    @foreach($spesialisasiList as $spesialisasi)
                        @php
                            $disabled = in_array($spesialisasi->id, $spesialisasiDimiliki) || in_array($spesialisasi->id, $spesialisasiDiajukan);
                        @endphp
                        <option value="{{ $spesialisasi->id }}"
                            {{ $disabled ? 'disabled style=background-color:#e0e0e0' : '' }}>
                            {{ $spesialisasi->nama }}
                            {{ in_array($spesialisasi->id, $spesialisasiDimiliki) ? '(sudah dimiliki)' : '' }}
                            {{ in_array($spesialisasi->id, $spesialisasiDiajukan) ? '(menunggu persetujuan)' : '' }}
                        </option>
                    @endforeach
                </select>
            </div>

            {{-- File Upload --}}
            <div class="mb-3">
                <label for="file_bukti" class="form-label">Upload Bukti Sertifikasi (PDF / JPG / PNG)</label>
                <input type="file" name="file_sertifikat" id="file_sertifikat" class="form-control" accept=".pdf,.jpg,.png" required>
            </div>

            <button type="submit" class="btn btn-primary">Kirim Pengajuan</button>
        </form>
    @endif
</div>
