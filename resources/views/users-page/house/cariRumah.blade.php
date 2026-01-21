<x-app-layout>
<link rel="stylesheet" href="{{URL::asset('css/cariRumah.css')}}">
<div class="dalem">
<div class="header">
<!-- @foreach($provinces as $province) -->
<!-- @endforeach -->
        <div class="mapsrumah" id="map"></div>
        </div>
        <div class="content">
        <div class="filter">
        <form method="GET" action="{{ route('cariRumah') }}">
        @method('GET')
        <div class="form-fields">
            <div class="cart">
                <h5>Provinsi</h5>
                <input type="text" placeholder="Provinsi" name="provinceIn" id="province" value="{{$selected[0]}}">
            </div>
            <div class="cart">
                <h5>Kota</h5>
                <input type="text" placeholder="Kabupaten"name="cityIn" id="city" value="{{$selected[1]}}">
            </div>
            <div class="cart">
                <h5>Kamar Tidur</h5>
                <input type="number" placeholder="Jumlah Unit" name="kamarTidur" id="peopleMain" value="{{$selected[2]}}">
                <button type="button" id="peopleLessMain">Kurang</button>
                <button type="button" id="peopleMoreMain">Tambah</button>
            </div>
            <div class="cart">
                <h5>Kamar Mandi</h5>
                <input type="number" placeholder="Jumlah Unit" name="kamarMandi" id="peopleMain1" value="{{$selected[3]}}">
                <button type="button" id="peopleLessMain1">Kurang</button>
                <button type="button" id="peopleMoreMain1">Tambah</button>
            </div>
            <div class="cartharga">
                <h5>Filter Harga</h5>
                <div class="form">
                    <div class="minmax">
                        <div class="input-wrapper">
                            <label for="minPrice">Rp.</label>
                            <input type="text" id="minPriceMain" name="minPrice" placeholder="Min"  value="{{$selected[4]}}">
                        </div>
                        <span class="garis">-</span>
                        <div class="input-wrapper">
                            <label for="maxPrice">Rp.</label>
                            <input type="text" id="maxPriceMain" name="maxPrice" placeholder="Max" value="{{$selected[5]}}">
                        </div>
                    </div>
                    <div class="options">
                        <button type="button" onclick="setRangeMain(100000000, 350000000)">Rp.100 jt - 350 jt</button>
                        <button type="button" onclick="setRangeMain(350000000, 600000000)">Rp.350 jt - 600 jt</button>
                        <button type="button" onclick="setRangeMain(600000000, 800000000)">Rp.600 jt - 800 jt</button>
                        <button type="button" onclick="setRangeMain(800000000, 1000000000)">Rp.800 jt - 1 M</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="submit-container">
            <button type="button" onclick="resetFilter()">Batalkan</button>
            <input id="filter" type="submit" value="Cari">
        </div>
 </form>
    <div id="response"></div>
</div>           
</div>
</div>
        
 @include('dashboard.map')
            <script>
document.addEventListener("DOMContentLoaded", function() {
    const provinceInput = document.getElementById("province");
    const provinceDropdown = document.createElement("div");
    provinceDropdown.id = "provinceDropdown";
    provinceDropdown.classList.add("dropdowns");
    provinceInput.parentNode.insertBefore(provinceDropdown, provinceInput.nextSibling);

    provinceInput.addEventListener("input", function() {
        const searchQuery = provinceInput.value;

        if (searchQuery.length > 0) { // Mulai cari setelah 3 karakter
            fetch(`/search-province?query=${encodeURIComponent(searchQuery)}`)
                .then(response => response.json())
                .then(provinces => {
                    renderDropdown(provinces);
                })
                .catch(error => console.error('Error fetching provinces:', error));
        } else {
            provinceDropdown.innerHTML = ""; 
        }
    });

    function renderDropdown(provinces) {
        provinceDropdown.innerHTML = "";
        provinces.forEach(province => {
            const option = document.createElement("div");
            option.classList.add("dropdowns-item");
            option.textContent = province;
            option.addEventListener("click", function() {
                provinceInput.value = province;
                provinceDropdown.innerHTML = ""; 
            });
            provinceDropdown.appendChild(option);
        });
    }

    document.addEventListener("click", function(event) {
        if (!provinceDropdown.contains(event.target) && event.target !== provinceInput) {
            provinceDropdown.innerHTML = ""; 
        }
    });
});



    // Kamar Mandi
    let peopleMain1 = document.getElementById("peopleMain1");
    let peopleLessMain1 = document.getElementById("peopleLessMain1");
    let peopleMoreMain1 = document.getElementById("peopleMoreMain1");
    let peopleIndexMain1 = parseInt(peopleMain1.value, 10) || 0;

    peopleLessMain1.addEventListener("click", () => {
        if (peopleIndexMain1 > 0) {
            peopleIndexMain1 -= 1;
            peopleMain1.value = peopleIndexMain1;
        }
    });

    peopleMoreMain1.addEventListener("click", () => {
        if (peopleIndexMain1 < 4) {
            peopleIndexMain1 += 1;
            peopleMain1.value = peopleIndexMain1;
        }
    });

function setRangeMain(minValue, maxValue) {
    document.getElementById('minPriceMain').value = minValue;
    document.getElementById('maxPriceMain').value = maxValue;
}
// formatrupiah
document.addEventListener("DOMContentLoaded", function() {
    const minPriceInput = document.getElementById("minPriceMain");
    const maxPriceInput = document.getElementById("maxPriceMain");
    function formatRupiah(angka) {
        var reverse = angka.toString().split('').reverse().join(''),
            ribuan = reverse.match(/\d{1,3}/g);
        ribuan = ribuan.join('.').split('').reverse().join('');
        return ribuan;
    }
    function cleanInput(input) {
        return input.replace(/\D/g, '');
    }
    minPriceInput.addEventListener("input", function() {
        var angka = cleanInput(this.value);
        this.value = formatRupiah(angka);
    });

    maxPriceInput.addEventListener("input", function() {
        var angka = cleanInput(this.value);
        this.value = formatRupiah(angka);
    });

    // Fungsi untuk mengatur rentang harga
    window.setRangeMain = function(min, max) {
        minPriceInput.value = formatRupiah(min);
        maxPriceInput.value = formatRupiah(max);
    }
});
            </script>




            <script>
                // Function to populate cities based on the selected province and set the selected city
                function populateCities(provinceId, selectedCityName = null) {
                    if (provinceId) {
                        fetch('/dashboard/getRegion/' + provinceId)
                            .then(response => response.json())
                            .then(data => {
                                const citySelect = document.getElementById('city');
                                citySelect.innerHTML = ''; // Clear previous city options

                                // Add default "Select City" option
                                const defaultOption = document.createElement('option');
                                defaultOption.text = 'Select City';
                                defaultOption.value = '';
                                citySelect.appendChild(defaultOption);

                                // Add cities to the dropdown
                                data.regions.forEach(region => {
                                    const option = document.createElement('option');
                                    option.value = region.name; // Use city name as value
                                    option.text = region.name;

                                    // Pre-select city if it matches the saved value
                                    if (selectedCityName && selectedCityName === region.name) {
                                        option.selected = true;
                                    }
                                    citySelect.appendChild(option);
                                });

                                // Sync the hidden input with the selected city
                                citySelect.addEventListener('change', function() {
                                    document.getElementById('cityIn').value = this.options[this.selectedIndex].text;
                                });
                            })
                            .catch(error => console.error('Error fetching cities:', error));
                    }
                }

                document.getElementById('province').addEventListener('change', function() {
                    const provinceId = this.value;
                    const provinceName = this.options[this.selectedIndex].text;
                    document.getElementById('provinceIn').value = provinceName;
                    populateCities(provinceId);
                });

                // Set default selected options on page load
                document.addEventListener('DOMContentLoaded', function() {
                    const provinceSelect = document.getElementById('province');
                    const selectedProvinceName = document.getElementById('provinceIn').value; 
                    const citySelect = document.getElementById('city');
                    const selectedCityName = document.getElementById('cityIn').value; 

                    // Set the selected province in the dropdown
                    Array.from(provinceSelect.options).forEach(option => {
                        if (option.text === selectedProvinceName) {
                            option.selected = true;
                        }
                    });

                    // Fetch and set cities based on the selected province
                    const selectedProvinceId = provinceSelect.value;
                    const selectedCityId = citySelect.value;
                    if (selectedProvinceId) {
                        populateCities(selectedProvinceId, selectedCityName);
                    }
                });


            </script>
            @include('dashboard.listHouse')
      
    </div>

</x-app-layout>

