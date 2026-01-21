<x-app-layout>

    <link rel="stylesheet" href="{{URL::asset('css/beliMaterial.css')}}">

    <div class="bungkusArsitek">
        <div class="headerArsitek">
            <div class="kalimatHeaderArsitek">
                <h2>Hire Kontraktor Untuk membangun rumah anda</h2>
            </div>
            <div class="filterArsitek">
                <form method="GET" action="{{ route('kontraktor.list') }}" class="formArsitek">
                    <input  class="satuArsitekUser" type="text" name="lokasi" placeholder="Cari Lokasi..." value="{{ request('lokasi') }}">
                    <input class="satuArsitekUser" type="text" name="pengalaman" placeholder="Pengalaman (tahun)" value="{{ request('pengalaman') }}">

                    <select class="satuArsitekUser" name="spesialisasi">
                        <option value="">Semua Spesialisasi</option>
                        @foreach($spesialisasis as $spesialisasi)
                        <option value="{{ $spesialisasi->nama }}" {{ request('spesialisasi') == $spesialisasi->nama ? 'selected' : '' }}>
                            {{ $spesialisasi->nama }}
                        </option>
                        @endforeach
                    </select>

                    <!-- Filter harga per jam -->
                    <input class="satuArsitekUser" type="number" name="min_rate" placeholder="Harga Min (per jam)" value="{{ request('min_rate') }}">
                    <input class="satuArsitekUser" type="number" name="max_rate" placeholder="Harga Max (per jam)" value="{{ request('max_rate') }}">

                    <button  class="satuArsitekUser" type="submit" class="btn">🔍 Cari</button>
                </form>
                </div>
                </div>


                <div class="listArsitek">
                @foreach($kontraktors as $kontraktor)
                <div class="arsitekCard">
                    @if ($kontraktor->user->pic)
                    <img src="{{ asset('storage/' . $kontraktor->user->pic) }}" alt="Foto Kontraktor">
                    @else
                    <img src="{{ asset('storage/Assets/Logo4C.png') }}" alt="Foto Default Kontraktor">
                    @endif

                    <div class="dataDiriArsitek">
                    <div class="dataDiriUmumAr1">
                    <h3>{{ $kontraktor->nama }}</h3>
                    <p><strong>📌 Spesialisasi:</strong>
                        {{ $kontraktor->spesialisasis->pluck('nama')->implode(', ') }}
                    </p>
                    </div>
                    <hr>
                    <div class="dataDiriUmumAr">
                    <p><strong>📍 Lokasi:</strong> {{ $kontraktor->alamat }}</p>
                    <p><strong>📆 Pengalaman:</strong> {{ $kontraktor->pengalaman }} tahun</p>
                    <p><strong>💰 Rate:</strong> Rp{{ number_format($kontraktor->rate_harga, 0, ',', '.') }}/Jam</p>
                    </div>
                    <a href="{{ route('kontraktor.detail', $kontraktor->id) }}" class="btnditel">🔍 Detail</a>
                </div>
                </div>
                @endforeach
            </div>

            <br><br><br>
            </div>



</x-app-layout>