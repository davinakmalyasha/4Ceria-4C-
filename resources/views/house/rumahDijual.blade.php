<x-app-layout>
<link rel="stylesheet" href="{{ asset('css/rumahDijual.css') }}">
<style>
    a[href="{{route('house.create.form')}}"] {
    display: inline-block;
    margin: 40px auto 60px;
    padding: 14px 40px;
    background-color: #fd1d1d;
    color: white;
    text-decoration: none;
    font-weight: 700;
    border-radius: 10px;
    box-shadow: 0 6px 18px rgba(253, 29, 29, 0.4);
    transition: background-color 0.3s ease, box-shadow 0.3s ease;
    text-align: center;
}

a[href="{{route('house.create.form')}}"]:hover {
    background-color: #d91717;
    box-shadow: 0 10px 25px rgba(217, 23, 23, 0.6);
}
</style>
  <div class="jr">
  <a href="{{route('house.create.form')}}">Jual Rumah</a>   
    <div class="jejeran">
        @if($houses->count() > 0)
            @foreach($houses as $house)
           <a href="{{route('house.detail',$house->id)}}">
                <div class="pilihan">
                @if($house->housePic->isNotEmpty())
                        <img class="h-full object-cover" src="{{ asset('storage/'.$house->housePic->first()->dir) }}" alt="">
                    @else
                        <img class="h-full object-cover" src="{{ asset('storage/default/house/unavailable.png') }}" alt="No Image">
                    @endif
                    <div class="isipilihan">
                        <h2>{{ $house->name }}</h2>
                        <ul>
                            <li><span>{{ 'Rp. ' . number_format($house->price, 0, ',', '.') }}</span></li>
                            <li>{{ $house->alamat }}</li>
                            <li>
                                
                                <ul class="logox">
                                    <li class="ruang"><img src="{{ asset('storage/Assets/iconKamarTidur.png') }}" alt="Kamar Tidur"><p>{{ $house->br }} Kamar Tidur</p></li>
                                    <li class="ruang"><img src="{{ asset('storage/Assets/iconKamarMandi.png') }}"><p>{{ $house->ba }} Kamar Mandi</p></li>
                                    <li class="ruang"><img src="{{ asset('storage/Assets/iconLuasTanah.png') }}"><p>{{ $house->width * $house->length }} m²</p></li>
                                </ul>
                            </li>
                        </ul>

                    </div>
                </div>
                </a>
            @endforeach
    
        @else
            <p>Data Masih Kosong</p>
        @endif

    </div>
    </div>
   
 </x-app-layout>