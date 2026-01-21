  <x-app-layout>
   
   <link rel="stylesheet" href="{{URL::asset('css/arsitek.css')}}">

    <div class="bungkusArsitek">
        <div class="headerArsitek">
            <div class="kalimatHeaderArsitek">
                <h2>Hire Arsitek untuk design rumah anda</h2>
            </div>
            <div class="filterArsitek">
                <form method="GET" action="{{ route('arsitek') }}" class="formArsitek">

                    <input class="satuArsitekUser" type="text" name="lokasi" placeholder="Lokasi" value="{{ request('lokasi') }}">

                    <select class="satuArsitekUser" name="spesialisasi">
                        <option value="">Spesialisasi</option>
                        <option value="Residensial" {{ request('spesialisasi') == 'Residensial' ? 'selected' : '' }}>Residensial</option>
                        <option value="Komersial" {{ request('spesialisasi') == 'Komersial' ? 'selected' : '' }}>Komersial</option>
                        <option value="Interior" {{ request('spesialisasi') == 'Interior' ? 'selected' : '' }}>Interior</option>
                        <option value="Hijau" {{ request('spesialisasi') == 'Hijau' ? 'selected' : '' }}>Hijau/Ramah Lingkungan</option>
                        <option value="Modern" {{ request('spesialisasi') == 'Modern' ? 'selected' : '' }}>Modern</option>
                        <option value="Tradisional" {{ request('spesialisasi') == 'Tradisional' ? 'selected' : '' }}>Tradisional</option>
                        <option value="Minimalis" {{ request('spesialisasi') == 'Minimalis' ? 'selected' : '' }}>Minimalis</option>
                        <option value="Urban" {{ request('spesialisasi') == 'Urban' ? 'selected' : '' }}>Urban Planning</option>
                    </select>

                    <input class="satuArsitekUser" type="number" name="min_rate" placeholder="Harga Min (per jam)" value="{{ request('min_rate') }}">

                    <input class="satuArsitekUser" type="number" name="max_rate" placeholder="Harga Max (per jam)" value="{{ request('max_rate') }}">


                    <select class="satuArsitekUser" name="sort">
                        <option value="">Urutkan</option>
                        <option value="rate_asc" {{ request('sort') == 'rate_asc' ? 'selected' : '' }}>Harga Termurah</option>
                        <option value="rate_desc" {{ request('sort') == 'rate_desc' ? 'selected' : '' }}>Harga Termahal</option>
                        <option value="pengalaman_desc" {{ request('sort') == 'pengalaman_desc' ? 'selected' : '' }}>Pengalaman Terbanyak</option>
                    </select>
                   
                    <button type="submit" class="btn">Cari</button>
                </form>
            </div>
        </div>

        <div class="listArsitek">
            @foreach($arsiteks as $arsitek)
            <div class="arsitekCard">
                @if ($arsitek->user->pic)
                <img src="{{ asset('storage/' . $arsitek->user->pic) }}" alt="Foto Arsitek">
                @else
                <img  src="{{ asset('storage/Assets/Logo4C.png') }}" alt="Foto Default Arsitek">
                @endif

                <div class="dataDiriArsitek">
                <div class="dataDiriUmumAr1">
                <h3>{{ $arsitek->nama }}</h3>
                <p>Spesialisasi: {{ implode(', ', explode(',', $arsitek->spesialisasi)) }}</p>
                </div>
                <hr>
                <div class="dataDiriUmumAr">
                <p>Lokasi: {{ $arsitek->lokasi }}</p>
                <p>Pengalaman: {{ $arsitek->pengalaman_tahun }} tahun</p>
                <p>Rate: Rp{{ number_format($arsitek->rate_harga, 0, ',', '.') }}/Jam</p>
                </div>
                <a href="{{ route('arsitek.detail', $arsitek->id) }}" class="btnditel">🔍 Detail</a>
               
                </div>
            </div>
            @endforeach
        </div>

        <br><br><br>
    </div>

</x-app-layout>