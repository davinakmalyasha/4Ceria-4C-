<x-app-layout>

    <link rel="stylesheet" href="{{URL::asset('css/tambah_data_rumah.css')}}">
  
    <a href="{{route('house.index')}}">Kembali</a>
    <div class="kelompok">
        <div class="mapsrumah" id="map"></div>
        <form action="{{route('house.create')}}" id="houseForm" method="post" enctype="multipart/form-data" autocomplete="off">
            @csrf
            @method('POST')
            <div class="atas">
                <div class="kiri">
                    <div class="dataPenting">
                        <ul>

                            <li>
                                <h5>Nama/Judul</h5>
                                <input type="text" name="name" placeholder="Berikan Judul!" required maxlength="20">
                                <x-input-error :messages="$errors->get('name')" class="mt-1 mx-4" />
                            </li>

                            <div class="kamar">
                                <li>
                                    <h5>Panjang (m)</h5>
                                    <input type="number" name="length" placeholder="Masukan Panjang" required maxlength="1">
                                    <x-input-error :messages="$errors->get('length')" class="mt-1 mx-4" />
                                </li>

                                <li>
                                    <h5>Lebar (m)</h5>
                                    <input type="number" name="width" placeholder="Masukan Lebar" required maxlength="1">
                                    <x-input-error :messages="$errors->get('width')" class="mt-1 mx-4" />
                                </li>
                            </div>

                            <div class="kamar">
                                <li>
                                    <h5>Jumlah Unit Kamar Mandi</h5>
                                    <input type="number" name="br" placeholder="Jumlah Unit" required maxlength="1">
                                    <x-input-error :messages="$errors->get('br')" class="mt-1 mx-4" />
                                </li>

                                <li>
                                    <h5>Jumlah Unit Kamar Tidur</h5>
                                    <input type="number" name="ba" placeholder="Jumlah Unit" required maxlength="1">
                                    <x-input-error :messages="$errors->get('ba')" class="mt-1 mx-4" />
                                </li>
                            </div>

                            <li>
                                <h5>Lantai</h5>
                                <div class="input-wrapper">
                                    <input type="number"  name="floors" placeholder="Input Lantai" required>
                                    <x-input-error :messages="$errors->get('floors')" class="mt-1 mx-4" />
                                </div>
                            </li>

                            <li>
                                <h5>Harga (Rupiah)</h5>
                                <div class="input-wrapper">
                                    <span class="currency-symbol">Rp. </span>
                                    <input type="text" id="harga" name="price" placeholder="Input Harga" required>
                                    <x-input-error :messages="$errors->get('floors')" class="mt-1 mx-4" />
                                </div>
                            </li>


                            <li>
    <h5>Foto Rumah</h5>
    <div id="dropZoneRumah" class="drop-zone">
        <p id="messageRumah">Klik Atau Drag File Image anda kesini.</p>
        <input type="file" name="house_pic[]" id="photoInputRumah" accept="image/*" multiple hidden>
        <div id="photoContainerRumah" class="default"></div>
    </div>
</li>



                          

                            <li> <label>Deskripsi:</label>
                                <textarea name="house_desc" placeholder="Deskripsikan Rumah Yang Anda Ingin Jual" cols="50" rows="6"></textarea>
                                <x-input-error :messages="$errors->get('house_desc')" class="mt-1 mx-4" />
                            </li>

                        </ul>
                    </div>
                </div>

                <div class="kanan">
                    <div class="dataGPenting">
                        <ul>
                            <li>
                                <h5>Provinsi</h5>
                                <input type="text" name="province" placeholder="Masukan Provinsi" id="province-input" value="">
                                <input type="text" name="lat" placeholder="Latitude" id="lat-input" value="">
                                <input type="text" name="lng" placeholder="Longitude" id="lng-input" value="">
                            </li>
                            <li>
                                <h5>Kabupaten</h5>
                                <input type="text" name="kab_kota" placeholder="Masukan Kabupaten" id="city-input" required value="">
                            </li>
                            <li>
                                <h5>Kecamatan</h5>
                                <input type="text" name="kecamatan" placeholder="Masukan Kecamatan" id="locality-input" value="">
                            </li>
                            <li>
                                <h5>Kelurahan</h5>
                                <input type="text" name="kelurahan" placeholder="Masukan Kelurahan" id="neighborhood-input" value="">
                            </li>
                            <li>
                                <h5>Kode Pos</h5>
                                <input type="text" name="postal_code" placeholder="Masukan Kode Pos" id="postalCode-input" required value="">
                            </li>
                            <li>
                                <h5>Detail Alamat</h5>
                                <input type="text" name="street_name" placeholder="Masukan Alamat Lengkap" required>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="bawah">
                <input type="submit" name="submit" value="Submit">
            </div>
        </form>
        </div>




        <form method="POST" action="{{ route('house.create') }}" class="px-4 py-6 text-gray-800 dark:text-white">
            @csrf
            @method('POST')
        </form>

    <script>
         mapboxgl.accessToken = 'pk.eyJ1Ijoicml6YXJhYmIiLCJhIjoiY20zYjVja2J2MW44MDJtczJuYmg1aXV1bCJ9.eBrkXkRMbiBWXkjX6Rtvbw';
        var map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [106.82767329965759, -6.185708854733704],
            zoom: 8
        });

        var currentMarker = null;
        function getLocationDetails(lng, lat) {
            const geocodingUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=pk.eyJ1Ijoicml6YXJhYmIiLCJhIjoiY20zYjVja2J2MW44MDJtczJuYmg1aXV1bCJ9.eBrkXkRMbiBWXkjX6Rtvbw`;

            fetch(geocodingUrl)
                .then(response => response.json())
                .then(data => {
                    const place = data.features[0]; // Get the most relevant location result
                    const placeName = place ? place.place_name : 'Unknown location';
                    const context = place.context || []; 
                    let street = '';
                    let neighborhood = '';
                    let locality = '';
                    let city = '';
                    let province = '';
                    let postalCode = '';
                    let country = '';

                    // Loop through context array to find specific location data
                    context.forEach((item) => {
                        if (item.id.includes('address')) {
                            street = item.text;
                        }
                        if (item.id.includes('neighborhood')) {
                            neighborhood = item.text;
                        }
                        if (item.id.includes('locality')) {
                            locality = item.text;
                        }
                        if (item.id.includes('place')) {
                            city = item.text;
                        }
                        if (item.id.includes('region')) {
                            province = item.text;
                        }
                        if (item.id.includes('postcode')) {
                            postalCode = item.text;
                        }
                        if (item.id.includes('country')) {
                            country = item.text;
                        }
                    });
                    // document.getElementById('street-input').value = street;
                    document.getElementById('neighborhood-input').value = neighborhood;
                    document.getElementById('locality-input').value = locality;
                    document.getElementById('lng-input').value = lng;
                    document.getElementById('lat-input').value = lat;
                    document.getElementById('city-input').value = city;
                    document.getElementById('province-input').value = province;
                    document.getElementById('postalCode-input').value = postalCode;
                    // document.getElementById('country-input').value = country;

                    // Display the location info
                    document.getElementById('location-info').textContent = `Coordinates: ${lat}, ${lng} - Location: ${placeName}`;

                    // Optionally, send coordinates and place name to the server
                    sendCoordinatesToServer(lng, lat, placeName);
                })
                .catch(error => console.error('Geocoding API Error:', error));
        }

        let geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            placeholder: 'Search for places', // Placeholder text for search input
            marker: {
                color: 'blue'
            },
        });

        map.addControl(geocoder);

        geocoder.on('result', (event) => {
            const coords = event.result.geometry.coordinates;
            console.log("Coordinates:", coords); // Logs the coordinates of the searched location
        });
        // Map click event to add/replace marker and get location info
        map.on('click', function (e) {
            var lng = e.lngLat.lng;
            var lat = e.lngLat.lat;

            // Remove previous marker if it exists
            if (currentMarker) {
                currentMarker.remove();
            }

            // Add new marker at clicked location
            currentMarker = new mapboxgl.Marker()
                .setLngLat([lng, lat])
                .addTo(map);

            // Get location details
            getLocationDetails(lng, lat);
        });

        // Function to send coordinates and place name to the server
        function sendCoordinatesToServer(lng, lat, placeName) {
            fetch('/save-location', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
                },
                body: JSON.stringify({ lng: lng, lat: lat, place: placeName })
            })
            .then(response => response.json())
            .then(data => console.log('Location saved:', data))
            .catch(error => console.error('Error:', error));
        }


        var inputField = document.getElementById('harga');

        inputField.oninput = function() {
            var removeChar = this.value.replace(/[^0-9.]/g, '');
            var removeDot = removeChar.replace(/\./g, '').replace(/^(\d+)\.(\d+)\.$/, '$1.$2');
            var formattedNumber = removeDot.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            this.value = formattedNumber;
        }

        const dropZoneRumah = document.getElementById('dropZoneRumah');
const photoInputRumah = document.getElementById('photoInputRumah');
const photoContainerRumah = document.getElementById('photoContainerRumah');
const messageRumah = document.getElementById('messageRumah');
let uploadedFilesRumah = new Set();
let fileListRumah = new DataTransfer();

function addPhoto(file, photoContainer, uploadedFiles, fileList, message, dropZone) {
    const reader = new FileReader();

    reader.onload = function(e) {
        const photoBox = document.createElement('div');
        photoBox.classList.add('photo-box');

        const fileName = file.name;
        const photoCount = photoContainer.children.length + 1;
        const img = document.createElement('img');
        img.src = e.target.result;
        const fileInfo = document.createElement('p');
        fileInfo.classList.add('file-info');
        fileInfo.innerHTML = `<span class="file-number">${photoCount}. </span> <span class="file-name">${fileName}</span>`;

        const removeBtn = document.createElement('button');
        removeBtn.classList.add('remove-btn');
        removeBtn.innerText = 'X';
        removeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            photoContainer.removeChild(photoBox);
            uploadedFiles.delete(fileName);
            removeFileFromInput(fileName, fileList);
            updateIndexes(photoContainer);
            checkPhotoCount(photoContainer, message, dropZone);
        });

        photoBox.appendChild(img);
        photoBox.appendChild(fileInfo);
        photoBox.appendChild(removeBtn);
        photoContainer.appendChild(photoBox);
        updateIndexes(photoContainer);
        checkPhotoCount(photoContainer, message, dropZone);
    };
    reader.readAsDataURL(file);
}

function updateIndexes(photoContainer) {
    const photos = photoContainer.querySelectorAll('.photo-box .file-number');
    photos.forEach((fileNumber, index) => {
        fileNumber.innerText = `${index + 1}.`;
    });
}

// function checkPhotoCount(photoContainer, message, dropZone) {
//     const photoCount = photoContainer.children.length;
//     if (photoCount === 0) {
//         message.innerText = 'Klik Atau Drag File Image anda kesini.';
//         dropZone.style.border = "2px dashed #fd1d1d"; 
//     } else if (photoCount >= 8) {
//         message.innerText = `Anda telah mencapai batas maksimal 8 foto.`;
//         dropZone.style.border = "2px dashed #fd1d1d";
//     } else if (photoCount >= 3) {
//         message.innerText = ''; 
//         dropZone.style.border = "2px solid #13ef46"; 
//     } else {
//         message.innerText = `Anda perlu mengunggah minimal 3 foto.`;
//         dropZone.style.border = "2px dashed #fd1d1d"; 
//     }
// }

function handleFiles(files, photoContainer, uploadedFiles, fileList, message, dropZone) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (photoContainer.children.length >= 8) {
            break;
        }
        if (uploadedFiles.has(file.name)) {
            alert(`File "${file.name}" sudah diunggah.`);
            continue;
        }
        uploadedFiles.add(file.name);
        addFileToInput(file, fileList);
        addPhoto(file, photoContainer, uploadedFiles, fileList, message, dropZone);
    }
}

function addFileToInput(file, fileList) {
    fileList.items.add(file);
    if (fileList.files) {
        photoInputRumah.files = fileList.files;
    }
}

function removeFileFromInput(fileName, fileList) {
    const newFileList = new DataTransfer();
    Array.from(fileList.files).forEach((file) => {
        if (file.name !== fileName) {
            newFileList.items.add(file);
        }
    });
    fileList = newFileList;
    if (fileList.files) {
        photoInputRumah.files = fileList.files;
    }
}

dropZoneRumah.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZoneRumah.classList.add('drag-over');
    messageRumah.innerText = 'Lepaskan file di sini'; 
});

dropZoneRumah.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null || !dropZoneRumah.contains(event.relatedTarget)) {
        dropZoneRumah.classList.remove('drag-over');
        checkPhotoCount(photoContainerRumah, messageRumah, dropZoneRumah);
    }
});

dropZoneRumah.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZoneRumah.classList.remove('drag-over');
    handleFiles(event.dataTransfer.files, photoContainerRumah, uploadedFilesRumah, fileListRumah, messageRumah, dropZoneRumah);
});

dropZoneRumah.addEventListener('click', () => {
    photoInputRumah.click(); 
});

photoInputRumah.addEventListener('change', (event) => {
    handleFiles(event.target.files, photoContainerRumah, uploadedFilesRumah, fileListRumah, messageRumah, dropZoneRumah);
});

document.getElementById('houseForm').addEventListener('submit', (event) => {
    const photoCountRumah = photoContainerRumah.children.length;
    const minPhotos = 0; // Minimal jumlah foto yang harus diunggah
    if (photoCountRumah < minPhotos) {
        alert(`Minimal unggah ${minPhotos} foto sebelum submit.`);
        event.preventDefault();
    }
});

checkPhotoCount(photoContainerRumah, messageRumah, dropZoneRumah);

    </script>
    </x-app-layout>