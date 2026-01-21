<section>

    <style>
        * {
            font-family: "Plus Jakarta Sans";
        }
        .isiDalemDetailRumah {
            display: flex;
            max-width: 100%;
           padding: 20px;
            gap: 5%;
        }
        .containerfotoatas {
            width: 50%;
        }
        .fotoBesarDetail {
            margin-bottom: 20px;
            text-align: center;
        }

        .fotoBesarDetail img {
            min-width: 100%;
            max-width: 100%;
            
            height: 400px;
            max-height: 400px;
            border-radius: 10px;
        }


        .fotoKecilContainer {
            display: flex;
            width: 100%;
            overflow: auto;
            gap: 10px;
        }
        .fotoKecilContainer::-webkit-scrollbar {
            display: none;
        }


        .fotoKecilContainer img {
            width: 100px;
            height: 100px;
            object-fit: cover;
            transition: 0.4s ease;
            border-radius: 8px;
            opacity: 0.4;
        }
        .fotoKecilContainer img.active {
            opacity: 1;
        }

        .fotoKecilContainer img:hover {

            width: 120px;
            height: 120px;
        }
        .DeskripsiDetailrumah {
            display: flex;
            flex-direction: column;
        }
       .harganya {
        margin-bottom: 4%;
       }
       .deskripsiiRumah    {
        margin-bottom: 3%;
        max-height: 180px;
        overflow: auto;
       }    
       .deskripsiiRumah::-webkit-scrollbar {
        display: none;
       }
        .kananDetaill {
            display: flex;
            flex-direction: column;
        }
        .detailinformatif {
            display: flex;
            gap: 3%;
        }

        h1 {
            font-size: 32px;
            letter-spacing: 0.6px;
            font-weight: 700;
            margin-bottom: 1%;
            font-family: "Plus Jakarta Sans";
        }
        h3 {
            font-size: 18px;
            font-weight: 700;
            
        }
        p {
            font-size: 15px;
            margin-bottom: 2%;
        }
        .dataRuanganini,  .dataRuanganini2 {
            display: flex;
            gap: 8%;
            margin-bottom: 5%;
        }
        .dataRuanganini2 {
            margin-bottom: 7%;
        }
        .listroomdetail {
            width: 310px;
            height: 150px;
            background-color: #fd1d1d;
            color: white;
            padding: 12px;
            border-radius: 8px;
            display: flex;
            overflow: auto;
            border-radius: 8px;
        }
        .isilistroomdetail {
            color: black;
            display: flex;
            gap: 4%;
            width: 90%;
            background-color: white;
            border-radius: 2px;
        }
        .isilistroomdetail img {
            width: 40%;
            height: auto;
            border-radius: 2px 0 0 2px;
        }
        .bentukandataruanganini {
            display: flex;
            gap: 3%;
        }
        .kanannyainii {
            display: flex;
            flex-direction: column;
        }
        .deskripsiisilistroomdetail {
            justify-content: center;
            display: flex;
            flex-direction: column;
        }
        .iniulvinn li {
            font-size: 12px;
            margin-left: 20px;
            list-style: none;
            display: flex;
        }
        .tombolKembaliii {
            background-color: #fd1d1d;
            padding: 10px;
            border-radius: 8px;
            color: white;
            text-align: center;
            text-decoration: none;
            margin: 30px 0 0 30px;
        }
        .bawahhdetaill {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .mapboxgl-map {
          
            width: 70%;
            height: 250px;
            border-radius: 10px;
            margin-top: 3%;
        }
        .userdandetailkecil {
            background-color: #fd1d1d;
            color: white;
            padding: 20px 10px;
            border-radius: 8px;
            width: max-content;

        }

        .bawahhdetaill {
    display: flex;
    flex-direction: column; /* Susunan vertikal */
    align-items: center; /* Pusatkan secara horizontal */
    max-width: 70%; /* Lebar maksimum 70% */
    margin: 0 auto; /* Pusatkan di tengah */
    padding: 20px 0; /* Jarak vertikal */
    background-color: #f9f9f9; /* Latar belakang */
    border-radius: 10px; /* Sudut melengkung */
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); /* Bayangan lembut */
}

.mapContainer {
    width: 100%; /* Lebar penuh dari bawahhdetaill */
    height: 300px; /* Tinggi map */
    border: 1px solid #ddd; /* Batas map */
    border-radius: 8px; /* Sudut melengkung */
    background-color: #e9e9e9; /* Placeholder map */
    margin-bottom: 20px; /* Jarak bawah map */
}

.alamatContainer {
    display: flex;
    justify-content: space-between; /* Pemisahan kiri dan kanan */
    gap: 20px; /* Jarak antara kolom kiri dan kanan */
    width: 100%; /* Lebar penuh dari bawahhdetaill */
}

.alamatLeft, .alamatRight {
    flex: 1; /* Lebar sama untuk kiri dan kanan */
    display: flex;
    flex-direction: column; /* Susunan vertikal */
    gap: 10px; /* Jarak antar item */
}

.alamatItem {
    display: flex;
    justify-content: space-between; /* Label dan value berjauhan */
    align-items: center; /* Vertikal rata tengah */
    background-color: #fff; /* Latar putih untuk item */
    padding: 10px; /* Jarak dalam */
   
    border-radius: 8px; /* Sudut melengkung */
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.1); /* Bayangan lembut */
}

.label {
    font-weight: bold;
    color: #333; /* Warna teks label */
}

.value {
    color: #555; 
}


    </style>
   
   
    <a class="tombolKembaliii" href="{{ route('admin.rumah-user') }}">
        < Kembali</a>
        <div class="isiDalemDetailRumah">
            
        <a href="{{ route('admin.edit-rumah', $house->id) }}" class="tombolKembaliii" style="background-color:#1d9bfd;">
    ✏️ Edit Data Rumah
</a>
<form action="{{ route('admin.delete-rumah', $house->id) }}" method="POST" onsubmit="return confirm('Apakah kamu yakin ingin menghapus rumah ini?');" style="margin-left: 30px; margin-top: 20px;">
    @csrf
    @method('DELETE')
    <button type="submit" class="tombolKembaliii" style="background-color: #dc3545;">
        🗑️ Hapus Rumah
    </button>
</form>

        <div class="containerfotoatas">
            <div class="fotoBesarDetail">
                <img id="fotoBesar" src="{{ asset('storage/' . $house->housePic->first()->dir) }}" alt="House Image Large">
            </div>

            <div class="fotoKecilContainer">
                @if($house->housePic->isNotEmpty())
                @foreach($house->housePic as $key => $items)
                <img class="fotorumahDetailUser {{ $loop->first ? 'active' : '' }}" 
                src="{{ asset('storage/' . $items->dir) }}"
                alt="House Image {{ $key + 1 }}"
                    onclick="changeFotoBesar('{{ asset('storage/' . $items->dir) }}')">
                @endforeach
            </div>
            @else
            <img src="{{asset('storage/default/house/unavailable.png')}}">
            @endif
            </div>
            <div class="kananDetaill">
        <div class="DeskripsiDetailrumah">
            <h1>{{$house->name}}</h1>

            <div class="detailinformatif">
                <p>{{$house->uploadDate}}</p>
                 <p>  ({{$house->views}} Views)</p>
            </div>
            
            <h3 class="harganya" >{{"Rp. ".number_format($house->price, 2,",",".")}}</h3>
            <div class="deskripsiiRumah">
                <h3>Deskripsi:</h3>
            <p>{{$house->house_desc}}</p>
            </div>
           


            <div class="dataRuanganini">

                <div class="bentukandataruanganini">
                <img src="{{ asset('storage/Assets/iconLantaii.png') }}"width="45px" height="45px">
                    <div class="kanannyainii">
                    <p>{{$house->floors}}</p>
                    <p>Lantai</p>
                    </div>
                </div>
                <div class="bentukandataruanganini">
                <img src="{{ asset('storage/Assets/iconKamarTidur.png') }}" width="45px" height="45px" >
                    <div class="kanannyainii">
                    <p>{{$house->br}}</p>
                    <p>Unit</p>
                    </div>
                </div>
                <div class="bentukandataruanganini">
                <img src="{{ asset('storage/Assets/iconKamarMandi.png') }}" width="45px" height="45px">
                    <div class="kanannyainii">
                    <p>{{$house->ba}}</p>
                    <p>Unit</p>
                    </div>
                </div>
            </div>

            <div class="dataRuanganini2">
            <div class="bentukandataruanganini">
                <img src="{{ asset('storage/Assets/iconKamarMandi.png') }}" width="45px" height="45px">
                    <div class="kanannyainii">
                    <p>{{$house->width}}M²</p>
                    <p>Luas</p>
                    </div>
                </div>
            <div class="bentukandataruanganini">
                <img src="{{ asset('storage/Assets/iconKamarMandi.png') }}" width="45px" height="45px">
                    <div class="kanannyainii">
                    <p>{{$house->width}}M²</p>
                    <p>Lebar</p>
                    </div>
                </div>
            <div class="bentukandataruanganini">
                <img src="{{ asset('storage/Assets/iconKamarMandi.png') }}" width="45px" height="45px">
                    <div class="kanannyainii">
                    <p>{{$house->length}}M²</p>
                    <p>Panjang</p>
                    </div>
                </div>
            </div>
        </div>
        
        

        <div class="userdandetailkecil">
            <p>Owner : {{$house->user->name}}</p>
            @foreach ($house->user->phoneNumber as $item)

            <a href="{{ 'https://wa.me/' . preg_replace('/^0/', '+62', $item->contact) }}">
    <p>Phone: {{$item->contact}}</p>
</a>

            @endforeach           
        </div>
        </div>
        
    </div>
    <hr width="100%">
    <div class="bawahhdetaill">
    <div id="map" class="mapContainer"></div>

    <div class="alamatContainer">
        <div class="alamatLeft">
            @if($house->province != null)
            <div class="alamatItem">
                <span class="label">Provinsi:</span>
                <span class="value">{{ $house->province }}</span>
            </div>
            @endif
            @if($house->kab_kota != null)
            <div class="alamatItem">
                <span class="label">Kota/Kabupaten:</span>
                <span class="value">{{ $house->kab_kota }}</span>
            </div>
            @endif
            @if($house->kecamatan != null)
            <div class="alamatItem">
                <span class="label">Kecamatan:</span>
                <span class="value">{{ $house->kecamatan }}</span>
            </div>
            @endif
        </div>

        <div class="alamatRight">
            @if($house->kelurahan != null)
            <div class="alamatItem">
                <span class="label">Kelurahan:</span>
                <span class="value">{{ $house->kelurahan }}</span>
            </div>
            @endif
            @if($house->postal_code != null)
            <div class="alamatItem">
                <span class="label">Kode Pos:</span>
                <span class="value">{{ $house->postal_code }}</span>
            </div>
            @endif
            @if($house->street_name != null)
            <div class="alamatItem">
                <span class="label">Alamat Detail</span>
                <span class="value">{{ $house->street_name }}</span>
            </div>
            @endif
        </div>
    </div>
</div>

  
   
        
            <div class="listroomdetail">


<div class="isilistroomdetail">
<img src="{{ asset('storage/Assets/davin.profile.jpg') }}">
<div class="deskripsiisilistroomdetail">
@foreach($house->room as $items)

<h3>{{$loop->index+1 .". "}}{{$items->name}}</h3>
<ul class="iniulvinn" >
<li>Lebar: {{$items->width}} M²</li>
<li>Panjang: {{$items->length}} M²</li>
<li>Luas Total: {{$items->width * $items->length}} M²</li>
</ul>
<p>{{$items->desc}}</p>    
@endforeach
</div>
</div>
</div>
            <!-- @foreach($house->User->PhoneNumber as $item)
            @php
            $contact = $contacts->firstWhere('id', $item->id_contact);
            @endphp
            @if ($contact)
            <a href="{{$contact->url.$item->contact}}">
                <img class="" src="{{ asset('storage/'.$contact->banner_dir) }}" alt="">
            </a>
            @endif
            @endforeach -->

          
       
          




<script>
    mapboxgl.accessToken = 'pk.eyJ1Ijoicml6YXJhYmIiLCJhIjoiY20zYjVja2J2MW44MDJtczJuYmg1aXV1bCJ9.eBrkXkRMbiBWXkjX6Rtvbw';
    
    if(@json($house==null)){
    }
    else{
        const coordinateString = @json(optional($house)->coordinate ?? '');
        const [lat, lng] = coordinateString.split(',').map(coord => parseFloat(coord.trim()));
        let map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [lng, lat],
            zoom: 13
        });
        var marker = new mapboxgl.Marker()
        .setLngLat([lng, lat])
        .addTo(map);

    // Center the map on the marker whenever the marker is clicked
    marker.getElement().addEventListener('click', () => {
        map.flyTo({ center: [lng, lat], zoom: 14 });
    });
    }

    // JavaScript to toggle the modal with item ID
function openDeleteAddressModal(actionUrl) {
    const modal = document.getElementById('deleteAddressModal');
    const deleteForm = document.getElementById('deleteAddressForm');
    const deleteItemId = document.getElementById('deleteItemId');

    modal.classList.remove('hidden'); // Show the modal
}

// Close the modal when the cancel button is clicked
document.getElementById('cancelAddressButton').addEventListener('click', () => {
    document.getElementById('deleteAddressModal').classList.add('hidden'); // Hide the modal
});


</script>
            <script>
                // ini buat fungsi foto bos, dari sini sampai
                function changeFotoBesar(imageSrc) {
                    const fotoBesar = document.getElementById('fotoBesar');
                    fotoBesar.src = imageSrc;
                }

                document.querySelectorAll('.fotoKecilContainer img').forEach(img => {
    img.addEventListener('click', function () {
        // Hapus kelas 'active' dari semua gambar
        document.querySelectorAll('.fotoKecilContainer img').forEach(item => {
            item.classList.remove('active');
        });

        // Tambahkan kelas 'active' ke gambar yang diklik
        this.classList.add('active');

        // Ubah gambar besar
        const fotoBesar = document.getElementById('fotoBesar');
        fotoBesar.src = this.src;
    });
});
document.addEventListener('DOMContentLoaded', () => {
    const firstImg = document.querySelector('.fotoKecilContainer img');
    if (firstImg) {
        firstImg.classList.add('active');
    }
});

// sini
            </script>
</section>