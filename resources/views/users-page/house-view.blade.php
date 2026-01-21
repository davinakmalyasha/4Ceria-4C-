<x-app-layout>

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
                width: 70%;
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

            .deskripsiiRumah {
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

            .dataRuanganini,
            .dataRuanganini2 {
                display: flex;
                gap: 8%;
                margin-bottom: 5%;
            }

            .dataRuanganini2 {
                margin-bottom: 7%;
            }

        .room-card-container {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    margin-top: 30px;
    justify-content: center;
}

.room-card {
    width: 300px;
    border-radius: 12px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    background-color: white;
    display: flex;
    flex-direction: column;
    transition: transform 0.3s ease;
}

.room-card:hover {
    transform: translateY(-5px);
}

.room-card-image img {
    width: 100%;
    height: 200px;
    object-fit: cover;
    display: block;
}

.room-card-content {
    padding: 16px;
}

.room-card-content h3 {
    margin: 0 0 10px;
    font-size: 18px;
    color: #222;
}

.room-card-content ul {
    list-style: disc;
    padding-left: 20px;
    margin-bottom: 10px;
    color: #444;
}

.room-card-content p {
    margin: 0;
    color: #666;
    font-size: 14px;
    line-height: 1.4;
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
                flex-direction: column;
                align-items: center;
                max-width: 70%;
                margin: 0 auto;
                padding: 20px 0;
                background-color: #f9f9f9;
                border-radius: 10px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            }

            .mapContainer {
                width: 100%;
                height: 300px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background-color: #e9e9e9;
                margin-bottom: 20px;
            }

            .alamatContainer {
                display: flex;
                justify-content: space-between;
                gap: 20px;
                width: 100%;
            }

            .alamatLeft,
            .alamatRight {
                flex: 1;
                /* Lebar sama untuk kiri dan kanan */
                display: flex;
                flex-direction: column;
                /* Susunan vertikal */
                gap: 10px;
                /* Jarak antar item */
            }

            .alamatItem {
                display: flex;
                justify-content: space-between;
                align-items: center;
                /* Vertikal rata tengah */
                background-color: #fff;
                /* Latar putih untuk item */
                padding: 10px;
                /* Jarak dalam */

                border-radius: 8px;
                /* Sudut melengkung */
                box-shadow: 0 2px 3px rgba(0, 0, 0, 0.1);
                /* Bayangan lembut */
            }

            .label {
                font-weight: bold;
                /* Penekanan pada label */
                color: #333;
                /* Warna teks label */
            }

            .value {
                color: #555;
                /* Warna teks value */
            }
        </style>

        <div class="isiDalemDetailRumah">

            <div class="containerfotoatas" style="width: 65%;">
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

                    <h3 class="harganya" style="margin-bottom: 5%;">{{"Rp. ".number_format($house->price, 2,",",".")}}</h3>

                    <div class="detailinformatif">
                        <p>{{$house->uploadDate}}</p>
                        <p> ({{$house->views}} Views)</p>
                    </div>


                    <div class="deskripsiiRumah" style="margin-bottom: 7%;">
                        <h3>Deskripsi:</h3>
                        <p>{{$house->house_desc}}</p>
                    </div>



                    <div class="dataRuanganini">

                        <div class="bentukandataruanganini">
                            <img src="{{ asset('storage/Assets/iconLantai.png') }}" width="45px" height="45px">
                            <div class="kanannyainii">
                                <p>{{$house->floors}}</p>
                                <p>Lantai</p>
                            </div>
                        </div>
                        <div class="bentukandataruanganini">
                            <img src="{{ asset('storage/Assets/iconKamarTidur.png') }}" width="45px" height="45px">
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
                            <img src="{{ asset('storage/Assets/iconPanjang.png') }}" width="45px" height="45px">
                            <div class="kanannyainii">
                                <p>{{$house->width}}M</p>
                                <p>Panjang</p>
                            </div>
                        </div>
                        <div class="bentukandataruanganini">
                            <img src="{{ asset('storage/Assets/iconLebar.png') }}" width="45px" height="45px">
                            <div class="kanannyainii">
                                <p>{{$house->length}}M</p>
                                <p>Lebar</p>
                            </div>
                        </div>
                        <div class="bentukandataruanganini">
                            <img src="{{ asset('storage/Assets/iconLuas.png') }}" width="45px" height="45px">
                            <div class="kanannyainii">
                                <p>{{$house->length * $house ->width}}M²</p>
                                <p>Luas</p>
                            </div>
                        </div>
                    </div>
                </div>

                <style>
                    .tombolHubungi {
                        background-color: white;
                        color: #fd1d1d;
                        padding: 4px 8px;
                        border-radius: 4px;
                        text-decoration: none;
                        font-size: 14px;
                    }
                </style>

<div class="userdandetailkecil">
    <p>Owner: {{ $house->user->name }}</p>
    @foreach ($house->user->phoneNumber as $item)
        <div class="nomortelpon" style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <div style="display: flex; gap: 10px;" class="notlp">
            <img src="{{ asset('storage/Assets/whatsapp.png') }}" width="25px" height="25px">
            <p style="margin: 0;">{{ $item->contact }}</p>
            </div>
            <a 
                href="{{ 'https://wa.me/' . preg_replace('/^0/', '62', $item->contact) }}" 
                target="_blank" 
                class="tombolHubungi"
                style="text-decoration: none; padding: 4px 8px; font-size: 14px; border-radius: 4px;">
                Hubungi
            </a>
        </div>
    @endforeach
</div>

            </div>

        </div>
        <hr width="100%">

        <div class="room-card-container">
    @foreach($house->room as $items)
        <div class="room-card">
            <div class="room-card-image">
                @if(count($items->roomPic))
                    <img src="{{ asset('storage/' . $items->roomPic[0]->dir) }}" alt="Foto Ruangan {{ $items->name }}">
                @else
                    <div class="no-image">Tidak ada gambar</div>
                @endif
            </div>
            <div class="room-card-content">
                <h3>{{ $loop->index + 1 . ". " }}{{ $items->name }}</h3>
                <ul>
                    <li>Lebar: {{ $items->width }} M²</li>
                    <li>Panjang: {{ $items->length }} M²</li>
                    <li>Luas Total: {{ $items->width * $items->length }} M²</li>
                </ul>
                <p>{{ $items->desc }}</p>
            </div>
        </div>
    @endforeach
</div>


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





       







        <script>
            mapboxgl.accessToken = 'pk.eyJ1Ijoicml6YXJhYmIiLCJhIjoiY20zYjVja2J2MW44MDJtczJuYmg1aXV1bCJ9.eBrkXkRMbiBWXkjX6Rtvbw';

            if (@json($house == null)) {} else {
                const coordinateString = @json(optional($house) -> coordinate ?? '');
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
                    map.flyTo({
                        center: [lng, lat],
                        zoom: 14
                    });
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
                img.addEventListener('click', function() {
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

</x-app-layout>