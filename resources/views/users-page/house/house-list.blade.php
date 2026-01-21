<style>
    .jr{
  width: 100%;
  margin: 3% 0 3% 0;
}
.isidatabase {
    display: flex;
    max-width: 100%;
    gap: 10px;
    margin-bottom: 30px;
    justify-content: center;
}
.jejeran {
    display: flex;
    flex-wrap: wrap;
    max-width: 90%;
    gap: 3%;
    margin: auto;

}
a {
    text-decoration: none;
    border-radius: 10px;
    max-width: 30%;
}
.pilihan {
    max-width: 100%;
    min-height: 90%;
    max-height: 90%;
    padding: 6px;
    display: flex;
    background-color: #f1f1f1;
    box-shadow: 10px 10px 15px rgba(0, 0, 0, 0.25) ;
    transition: 0.5s ease-in-out;
    cursor: pointer;
    border-radius: 20px;
    gap: 10px;
   
}
.pilihan:hover {
    background-color: #fd1d1d;
    box-shadow: 30px 30px 122px rgba(255, 0, 0, 0.4) ;
   
}
.pilihan:hover .isipilihan ul li p, .pilihan:hover h2, .pilihan:hover span {
    color: white;
}

.pilihan img {
    width: 50%;
    height: 0;
   height: auto;
    object-fit: cover;
    border-radius: 20px;
}
.isipilihan {
   transition: 0.5s ease-in-out;
   margin: auto;
   text-align: center;
}
.isipilihan .logox .ruang {
   display: flex;
   align-items: center;
   gap: 5px;
}
.logox .ruang img{
    width: 20px;
    height: 20px;
    transition: 0.5s ease-in-out;
}
.pilihan:hover .logox img {
    background-color: white;
   
}
.isipilihan ul li {
   list-style: none;
   font-size: 10px;
   color: #0f172a;
}
.isipilihan ul li ul li{
   margin-bottom: 5px;
   
}
.isipilihan ul li P{
   color: #fd1d1d;
   transition: 0.5s ease-in-out;
}

.isipilihan ul li span {
    font-size: 15px;
    color: #0f172a;
    transition: 0.5s ease-in-out;
   }
.isipilihan h2 {
    font-size: 15px;
    color: #0f172a;
    letter-spacing: 0.8px;
    transition: 0.5s ease-in-out;
    margin-bottom: 5px;
    margin-top: 15px;

}

.isipilihan button {
    background-color: #fa3636;
    color: #fff;
    border: 1px solid white;
    border-radius: 5px;
    padding: 5px;
}

    
</style>
      
    <div class="jr">
        <div class="jejeran">
            @if($houseList->isNotEmpty())
                @foreach($houseList as $items)
                <a href="{{ route('admin.house.detail', $items->id) }}">

                        <div class="pilihan" style="margin-bottom: 20px;">
                            <td>
                                @if($items->housePic->isNotEmpty())
                                    <img class="h-full object-cover" src="{{ asset('storage/'.$items->housePic->first()->dir) }}" alt="">
                                @else
                                    <img class="h-full object-cover" src="{{ asset('storage/default/house/unavailable.png') }}" alt="No Image">
                                @endif
                            </td>
                            <div class="isipilihan">
                                <h2>{{ $items->name }}</h2>
                                <ul>
                                    <li><span>{{ "Rp. " . number_format($items->price, 0, ',', '.') }}</span></li>
                                    <li>{{ $items->full_address }}</li>
                                    <li>
                                        <hr>
                                        <ul class="logox">
                                            <li class="ruang">
                                                <img src="{{ asset('storage/Assets/iconKamarTidur.png') }}" alt="Kamar Tidur">
                                                <p>{{ $items->br . " Kamar Tidur" }}</p>
                                            </li>
                                            <li class="ruang">
                                                <img src="{{ asset('storage/Assets/iconKamarMandi.png') }}" alt="Kamar Mandi">
                                                <p>{{ $items->ba . " Kamar Mandi" }}</p>
                                            </li>
                                            <li class="ruang">
                                                <img src="{{ asset('storage/Assets/iconLuasTanah.png') }}" alt="Luas Tanah">
                                                <p>{{ $items->width . " m²" }}</p>
                                            </li>
                                            <li class="ruang">
                                                <img src="{{ asset('storage/Assets/iconLuasTanah.png') }}" alt="Luas Bangunan">
                                                <p>{{ $items->length . " m²" }}</p>
                                            </li>
                                        </ul>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </a>
                @endforeach
            @else
                <p>Data Masih Kosong hehe</p>
            @endif
        </div>
    </div>

