<section>

<style>
  
    .mapboxgl-popup-content {
  background: white;
  border-radius: 10px;
  display: flex;
  gap: 15px;
  padding: 8px 10px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  font-family: 'Segoe UI', sans-serif;
  min-width: 450px;
  min-height: 200px;
  max-height: 200px;
  opacity: 0;
  transform: scaleY(0);
  animation: growUp 0.7s ease forwards;
    transition: opacity 0.3s ease, transform 0.3s ease;
}
    .mapboxgl-popup-content:hover {
    opacity: 1;
}
.mapboxgl-popup-content.hide-popup {
  animation: shrinkDown 0.5s ease forwards;
}

@keyframes growUp {
  0% {
      border-radius: 50px 10px 10px 50px;
    opacity: 0;
    transform: scaleY(0) scaleX(0.5);
  }
  100% {
    border-radius: 10px 10px 10px 10px;
    opacity: 1;
    transform: scaleY(1) scaleX(1);
  }
}
@keyframes shrinkDown {
  0% {
    opacity: 1;
    transform: scaleY(1) scaleX(1);
    border-radius: 10px;
  }
  100% {
    opacity: 0;
    transform: scaleY(0) scaleX(0.5);
    border-radius: 50px 10px 10px 50px;
  }
}

.mapboxgl-popup-content h3 {
    margin: 0 0 4px;
    font-size: 20px;
    color: #1d1d1d;
    font-weight: 600;
}
.mapboxgl-popup-content .price {
    margin: 0 0 10px;
    font-size: 12px;
    color: #222;
    font-weight: 500;
}
.popup-image {
    max-width: 60%;
   
}
.popup-image img{
   width: 100%;
    object-fit: cover;
    border-radius: 10px;
    
}
.lokasi {
    margin-bottom: 5px;
    display: flex;
    gap: 8px;
    align-items: center;
}
.lokasi img {
    width: 20px;
    height: 20px;
}
.luas {
    margin-bottom: 5px;
    display: flex;
    gap: 8px;
    align-items: center;
}
.luas img {
    width: 20px;
    height: 20px;
}
.kamarTidur {
    margin-bottom: 5px;
    display: flex;
    gap: 8px;
    align-items: center;
}
.kamarTidur img {
    width: 20px;
    height: 20px;
}
.kamarMandi {
    margin-bottom: 5px;
    display: flex;
    gap: 8px;
    align-items: center;
}
.kamarMandi img {
    width: 20px;
    height: 20px;
}

</style>


    <script>
        mapboxgl.accessToken = 'pk.eyJ1Ijoicml6YXJhYmIiLCJhIjoiY20zYjVja2J2MW44MDJtczJuYmg1aXV1bCJ9.eBrkXkRMbiBWXkjX6Rtvbw';
        var map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/standard',
            center: [106.82767329965759, -6.185708854733704],
            zoom: 8
        });
        const houseCoordinates = @json($houseList->pluck('coordinate'));
        const house = @json($houseList);

        house.forEach(house=>{
            if(house.coordinate){
                let [latitude, longtitude] = house.coordinate.split(',').map(coord => parseFloat(coord.trim()));
                console.log([longtitude, latitude])

                const marker = new mapboxgl.Marker().setLngLat([longtitude, latitude]).addTo(map);

                

                const popup = new mapboxgl.Popup({
                    offset: 25,
                    closeButton: false 
                    }).setHTML(`
                    
                       <div class="popup-image">
                            ${house.house_pic && house.house_pic.length > 0
                                ? `<img class="fotoTitik" src="/storage/${house.house_pic[0].dir}" alt="${house.name}" />`
                                : `<div class="no-image">Gambar tidak tersedia</div>`}
                        </div>
                 <div class="popup-content">
                     <h3>${house.name}</h3>
                    <p class="price">Rp ${house.price.toLocaleString('id-ID')}</p>

                     <div class="lokasi">
                        <img class="locationIcon" src="storage/Assets/iconLokasi.png"/>
                    <p class="location">${house.province ?? 'Lokasi tidak diketahui'}</p>
                        </div>

                        <div class="luas">
                           <img class="lengthIcon" src="storage/Assets/iconLuas.png"/>
                           <p class="location">${house.width * house.length} m²</p>
                       </div>

                     <div class="kamarTidur">
                           <img class="lengthIcon" src="storage/Assets/iconKamarTidur.png"/>
                           <p class="location">${house.br} Unit</p>
                       </div>

                        <div class="kamarMandi">
                           <img class="lengthIcon" src="storage/Assets/iconKamarMandi.png"/>
                           <p class="location">${house.ba} Unit</p>
                       </div>

                       <p class="price">Klik Untuk Melihat Detail!</p>
                    </div>`);

                marker.getElement().addEventListener('mouseenter', () => {
                    popup.setLngLat([longtitude, latitude]).addTo(map);
                });

                
                marker.getElement().addEventListener('mouseleave', () => {
                    popup.remove();
                });

                marker.getElement().addEventListener('click', () => {
                window.location.href = `{{ route('house.view', ':id') }}`.replace(':id', house.id);
            });

            }
        })
        let geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            placeholder: 'Search for places', 
            marker: {
                color: 'red'
            },
        });
        map.addControl(geocoder);

        geocoder.on('result', (event) => {
            const coords = event.result.geometry.coordinates;
            console.log("Coordinates:", coords); 
        });
    </script>
</section>