<section>
 
 <style>
/* Styling untuk container delete */
.delete-container {
    display: inline-block;
    margin: 10px;
    position: relative;
}

.fotoinicog {
    width: 300px;
    height: 300px;
    object-fit: cover;
    cursor: pointer;
    border: 2px solid #ccc;
    border-radius: 8px;
    transition: all 0.3s ease;
}

.fotoinicog:hover {
    border-color: #fd1d1d;
}

/* Styling untuk tombol delete */
.delete-button {
    background-color: #e74c3c;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.3s ease;
    margin-top: 10px;
}

.delete-button:hover {
    background-color: #c0392b;
}

/* Modal Styling */
.modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    justify-content: center;
    align-items: center;
}

.modal-content {
    background-color: white;
    padding: 20px;
    border-radius: 10px;
    text-align: center;
    width: 300px;
    position: relative;
}

.cancel-button, .confirm-delete-button {
    padding: 10px 20px;
    margin-top: 10px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
}

.cancel-button {
    background-color: #ccc;
    color: white;
}

.cancel-button:hover {
    background-color: #999;
}

.confirm-delete-button {
    background-color: #e74c3c;
    color: white;
}

.confirm-delete-button:hover {
    background-color: #c0392b;
}

/* Styling untuk form upload */
.upload-form {
    margin-top: 20px;
    background: #f9f9f9;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    max-width: 500px;
    margin: auto;
}

.form-group {
    margin-bottom: 15px;
}

label {
    font-weight: bold;
    display: block;
    margin-bottom: 5px;
}

.file-input {
    width: 100%;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
}

.upload-button {
    background-color: white;
    color: black;
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    width: 100%;
}

.upload-button:hover {
    background-color: #fd1d1d;
}

/* Flash Message Styling */
.alert {
    padding: 10px;
    margin: 10px 0;
    border-radius: 5px;
    font-size: 14px;
}

.alert-success {
    background-color: #fd1d1d;
    color: white;
}

.alert-error {
    background-color: #dc3545;
    color: white;
}


.mainDetailRumah {
    padding: 20px;
    background-color: #fd1d1d;
}




/* Styling utama untuk form */
.mainDetailRumah {
    background-color: #f9f9f9;
    padding: 20px;
    margin: 20px auto;
    width: 100%;
    max-width: 600px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* Styling untuk judul */
.form-title {
    font-size: 24px;
    font-weight: bold;
    color: #333;
    margin-bottom: 20px;
}

/* Styling untuk setiap grup form */
.form-group {
    margin-bottom: 15px;
}

.form-group label {
    font-weight: bold;
    display: block;
    margin-bottom: 8px;
    color: #333;
}

.input-field,
.textarea-field {
    width: 100%;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 16px;
    color: #333;
}

.input-field:focus,
.textarea-field:focus {
    border-color: #fd1d1d;
    outline: none;
}

/* Styling untuk textarea */
.textarea-field {
    height: 150px;
    resize: vertical;
}

/* Styling untuk tombol */
.form-actions {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
}

.submit-button,
.delete-button {
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.submit-button {
    background-color: #fd1d1d;
    color: white;
}

.submit-button:hover {
    background-color: #fd1d1d;
}

.delete-button {
    background-color: #e74c3c;
    color: white;
}

.delete-button:hover {
    background-color: #c0392b;
}





/* Styling utama untuk form konfirmasi */
.sampinganDetail {
    background-color: #fff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 600px;
    margin: 20px auto;
}

/* Styling untuk judul */
.sampinganDetail h2 {
    font-size: 24px;
    color: #333;
    margin-bottom: 20px;
}

/* Styling untuk deskripsi */
.sampinganDetail p {
    font-size: 16px;
    color: #555;
    margin-bottom: 15px;
}

/* Input konfirmasi nama rumah */
.confirm-input {
    width: 100%;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 16px;
    color: #333;
    margin-bottom: 15px;
}

.confirm-input:focus {
    border-color: #fd1d1d;
    outline: none;
}

/* Styling pesan kesalahan */
.error-message {
    color: #e74c3c;
    font-size: 14px;
    margin-bottom: 20px;
}

/* Styling untuk tombol */
.form-actions {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
}

.cancel-button,
.delete-button {
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.cancel-button {
    background-color: #ccc;
    color: white;
}

.cancel-button:hover {
    background-color: #aaa;
}

.delete-button {
    background-color: #e74c3c;
    color: white;
}

.delete-button:hover {
    background-color: #c0392b;
}





/* Styling untuk kontainer dimensi rumah */
.dimensionDetail {
    background-color: #fff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 700px;
    margin: 20px auto;
}

/* Heading section */
.dimensionDetail h3 {
    font-size: 24px;
    color: #333;
    margin-bottom: 15px;
}

/* Styling untuk form input */
.dimension-form label {
    font-size: 16px;
    color: #555;
    margin-bottom: 5px;
    display: block;
}

.dimension-form input {
    width: 100%;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 16px;
    color: #333;
    margin-bottom: 15px;
}

.dimension-form input:focus {
    border-color: #007bff;
    outline: none;
}

/* Styling untuk tombol edit dan delete */
.edit-button,
.delete-button {
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.edit-button {
    background-color: #fd1d1d;
    color: white;
}

.edit-button:hover {
    background-color: #fd1d1d;
}

.delete-button {
    background-color: #e74c3c;
    color: white;
}

.delete-button:hover {
    background-color: #c0392b;
}

/* Link untuk menambahkan dimensi */
.add-link {
    font-size: 18px;
    color: #007bff;
    text-decoration: none;
    margin-top: 20px;
}

.add-link:hover {
    text-decoration: underline;
}

/* Pesan error */
.error-message {
    color: #e74c3c;
    font-size: 14px;
    margin-bottom: 10px;
}

/* Modal Konfirmasi Hapus */
.delete-modal {
    display: none;
    background-color: rgba(0, 0, 0, 0.5);
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    justify-content: center;
    align-items: center;
    padding: 20px;
}

.delete-modal .delete-modal-content {
    background-color: #fff;
    padding: 30px;
    border-radius: 8px;
    width: 100%;
    max-width: 400px;
    text-align: center;
}

.delete-confirm-button {
    padding: 10px 20px;
    background-color: #e74c3c;
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
}

.delete-confirm-button:hover {
    background-color: #c0392b;
}

.cancel-button {
    padding: 10px 20px;
    background-color: #ccc;
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
}

.cancel-button:hover {
    background-color: #aaa;
}






/* Styling untuk kontainer alamat rumah */
.alamakDetail {
    background-color: #fff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 700px;
    margin: 20px auto;
}

/* Heading section */
.alamakDetail h3 {
    font-size: 18px;
    color: #333;
    margin-bottom: 8px;
}

/* Link untuk menambahkan alamat */
.add-link {
    font-size: 18px;
    color: #007bff;
    text-decoration: none;
    margin-top: 20px;
}

.add-link:hover {
    text-decoration: underline;
}

/* Tombol hapus */
.delete-button {
    padding: 10px 20px;
    background-color: #e74c3c;
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
    margin-top: 20px;
}

.delete-button:hover {
    background-color: #c0392b;
}

/* Map container */
.map-container {
    width: 100%;
    height: 300px;
    background-color: #e0e0e0;
    border-radius: 8px;
    margin-top: 20px;
}

/* Modal Konfirmasi Hapus */
.delete-modal {
    display: none;
    background-color: rgba(0, 0, 0, 0.5);
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    justify-content: center;
    align-items: center;
    padding: 20px;
}

.delete-modal .delete-modal-content {
    background-color: #fff;
    padding: 30px;
    border-radius: 8px;
    width: 100%;
    max-width: 400px;
    text-align: center;
}

.delete-confirm-button {
    padding: 10px 20px;
    background-color: #e74c3c;
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
}

.delete-confirm-button:hover {
    background-color: #c0392b;
}

.cancel-button {
    padding: 10px 20px;
    background-color: #ccc;
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
}

.cancel-button:hover {
    background-color: #aaa;
}




/* Styling untuk form room */
.ruumDetail {
    background-color: #fff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 700px;
    margin: 20px auto;
}

/* Label dan input form */
.ruumDetail label {
    font-size: 16px;
    color: #333;
    margin-top: 10px;
    display: block;
}

.ruumDetail input {
    width: 100%;
    padding: 10px;
    margin-top: 5px;
    margin-bottom: 15px;
    border-radius: 5px;
    border: 1px solid #ddd;
}

/* Tombol submit */
.ruumDetail button {
    padding: 12px 20px;
    background-color: #fd1d1d;
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 16px;
    cursor: pointer;
    width: 100%;
}

.ruumDetail button:hover {
    background-color: #fd1d1d;
}

/* Pesan kesalahan */
.ruumDetail .alert-error {
    color: red;
    background-color: #f8d7da;
    padding: 10px;
    margin-top: 10px;
    border-radius: 5px;
}

.ruumDetail .success-message {
    color: green;
    background-color: #d4edda;
    padding: 10px;
    margin-top: 10px;
    border-radius: 5px;
}

/* Styling untuk daftar ruangan */
.room-item {
    padding: 10px;
    margin-bottom: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #f9f9f9;
}

.room-item p {
    margin: 5px 0;
    font-size: 16px;
    color: #333;
}

.room-detail-link {
    display: inline-block;
    margin-top: 10px;
    color: #007bff;
    font-size: 16px;
    text-decoration: none;
}

.room-detail-link:hover {
    text-decoration: underline;
}

</style>


<div class="isisemuanya">
@if($house->housePic->isEmpty())
                                   
                                @else      
                                @foreach($house->housePic as $items)
    <div class="delete-container">
        <img class="fotoinicog" src="{{ asset('storage/'.$items->dir) }}" alt="Picture" 
             onclick="selectPicForDelete({{ $items->id }}, this)">
    </div>
@endforeach

<button id="deletePicButton" onclick="deleteSelectedPic()" style="display: none;" class="delete-button">Delete</button>

<div id="deletePicModal" style="display: none;" class="modal">
    <div class="modal-content">
        <p>
            Are you sure you want to delete this item (ID: <span id="deleteItemId"></span>)? This action cannot be undone.
        </p>
        <button id="cancelPicButton" onclick="closeDeletePicModal()" class="cancel-button">Cancel</button>
        <form id="deletePicForm" method="POST" action="" style="display:block;">
            @csrf
            @method('DELETE')
            <button type="submit" id="confirmDeleteButton" class="confirm-delete-button">Delete</button>
        </form>
    </div>
</div>
                          

                            @endif
                            <form method="POST" action="{{ route('house.pic.create', $house->id) }}" enctype="multipart/form-data" class="upload-form">
    @csrf
    @method('POST')
    <div class="form-group">
        <label for="file_input">Upload file</label>
        <input aria-describedby="file_input_help" id="file_input" type="file" name="house_pic" class="file-input">
    </div>
    <button type="submit" class="upload-button">Add</button>

    @if(session('success'))      
        <div class="alert alert-success">
            {{ session('success') }}
        </div>
    @endif
    @if(session('error'))
        <div class="alert alert-error">
            {{ session('error') }}
        </div>
    @endif
    @error('house_pic')
        <div class="alert alert-error">{{ $message }}</div>
    @enderror
</form>
                    
<br><br>
                    
                                
                    <div class="mainDetailRumah">
    <form method="POST" action="{{route('house.edit', $house->id)}}" class="house-form">
        @csrf
        @method('PUT')
       
        <h3 class="form-title">House Main Data</h3>
       
        <div class="form-group">
            <label for="name">Name</label>
            <input type="text" name="name" value="{{$house->name}}" id="name" class="input-field" required>
        </div>

        <div class="form-group">
            <label for="price">Price</label>
            <input type="text" name="price" value="{{$house->price}}" id="price" class="input-field" required>
        </div>

        <div class="form-group">
            <label for="house_desc">Description</label>
            <textarea name="house_desc" id="house_desc" class="textarea-field" required>{{$house->house_desc}}</textarea>
        </div>

        @if(Auth::user()->can('house-delete') || $isOwner)
            <div class="form-actions">
                <button type="submit" class="submit-button">Edit</button>
                <button type="button" onclick="openDeleteHouseModal()" class="delete-button">Delete House</button>
            </div>
        @endif
    </form>
</div>

  

<div class="sampinganDetail">
    <h2>Confirm Delete</h2>
    <p>
        Are you sure you want to delete this house? This action cannot be undone.
    </p>
    <p>
        Type the house name first below to delete this house!
    </p>
    <input type="text" id="confirmDeleteHouse" class="confirm-input" placeholder="Enter house name">
    <p id="falseHouseName" class="error-message"></p>

    <div class="form-actions">
        <button id="cancelHouseButton" class="cancel-button" onclick="closeDeleteHouseModal()">Cancel</button>
        <form id="deleteHouseForm" method="POST" action="{{route('user-house-delete', $house->id)}}" style="display:inline;">
            @csrf
            @method('delete')
            <button type="button" id="confirmDeleteButton" class="delete-button" onclick="submitDeleteHouse()">Delete</button>
        </form>
    </div>
</div>



<div class="dimensionDetail">
    <h3>House Dimension</h3>

    @if($house->width == null && $house->length == null && $house->br == null && $house->ba == null && $house->floors == null)
        <a href="{{route('house.detail.dimension.create.form', $house->id)}}" class="add-link">Add</a>
    @else
        <form method="POST" action="{{ route('house.detail.dimension.edit', $house->id) }}" class="dimension-form">
            @csrf
            @method('PUT')

            <label for="width">Width</label>
            <input type="text" name="width" id="width" value="{{$house->width}}">

            <label for="length">Length</label>
            <input type="text" name="length" id="length" value="{{$house->length}}">

            <h3>Area Total: {{$house->width * $house->length}} <sup>2</sup> M</h3>

            <label for="br">Bed Room</label>
            <input type="text" name="br" id="br" value="{{$house->br}}">

            <label for="ba">Bath Room</label>
            <input type="text" name="ba" id="ba" value="{{$house->ba}}">

            <label for="floors">Floors</label>
            <input type="text" name="floors" id="floors" value="{{$house->floors}}">

            <input type="hidden" name="id_house" value="{{$house->id}}">

            <button type="submit" class="edit-button">Edit</button>

            @if(Auth::user()->can('house-delete') || $isOwner)
                <button type="button" class="delete-button" onclick="openDeleteDimensionModal()">Delete</button>
            @endif

            @error('width')<div class="error-message">{{ $message }}</div>@enderror
            @error('length')<div class="error-message">{{ $message }}</div>@enderror
            @error('br')<div class="error-message">{{ $message }}</div>@enderror
            @error('ba')<div class="error-message">{{ $message }}</div>@enderror
            @error('floors')<div class="error-message">{{ $message }}</div>@enderror
        </form>
    @endif

    <!-- Confirm Delete Modal -->
    <div id="deleteDimensionModal" class="delete-modal">
        <h2>Confirm Delete</h2>
        <p>
            Are you sure you want to delete this item (ID: <span id="deleteItemId"></span>)? This action cannot be undone.
        </p>
        
        <button id="cancelDimensionButton" class="cancel-button" onclick="closeDeleteDimensionModal()">Cancel</button>
        
        <form id="deleteDimensionForm" method="POST" action="{{route('house.detail.dimension.delete', $house->id)}}">
            @csrf
            @method('DELETE')
            <button type="submit" class="delete-confirm-button">Delete</button>
        </form>
    </div>
</div>

<div class="alamakDetail">
    @if($house->coordinate == null && $house->street_name == null && $house->kelurahan == null && $house->kecamatan == null && $house->kab_kota == null && $house->postal_code == null)
        <a href="{{route('house.address.create.form', $house->id)}}" class="add-link">Add</a>
    @else
        <h3>Street Name: </h3>
        <h3>{{$house->street_name}}</h3>

        @if($house->kelurahan != null)
            <h3>Kelurahan: </h3>
            <h3>{{$house->kelurahan}}</h3>
        @endif

        @if($house->kecamatan != null)
            <h3>Kecamatan: </h3>
            <h3>{{$house->kecamatan}}</h3>
        @endif

        <h3>Kab/Kota: </h3>
        <h3>{{$house->kab_kota}}</h3>

        @if($house->province != null)
            <h3>Province: </h3>
            <h3>{{$house->province}}</h3>
        @endif

        <h3>Postal Code: </h3>
        <h3>{{$house->postal_code}}</h3>
        <form id="deleteAddressForm" method="POST" action="{{route('house.address.delete', $house->id)}}">
            @csrf
            @method('DELETE')
            <button type="submit" class="delete-confirm-button">Delete</button>
        </form>
        
            
        </button>

        <div id="map" class="map-container"></div>
    @endif

    <!-- Delete Confirmation Modal -->
    <div id="deleteAddressModal" class="delete-modal">
        <h2>Confirm Delete</h2>
        <p>
            Are you sure you want to delete this item (ID: <span id="deleteItemId"></span>)? This action cannot be undone.
        </p>

        <button id="cancelAddressButton" class="cancel-button" onclick="closeDeleteAddressModal()">Cancel</button>
        
       
    </div>
</div>


<div class="ruumDetail">
    <form method="POST" action="{{ route('house.room.create') }}">
        @csrf
        @method('POST')

        <label for="file_input">Room Name</label>
        <input type="text" name="name">
        @error('name')
            <div>{{ $message }}</div>
        @enderror

        <label for="file_input">Width</label>
        <input type="text" name="width">
        @error('width')
            <div>{{ $message }}</div>
        @enderror

        <label for="file_input">Length</label>
        <input type="text" name="length">
        @error('length')
            <div>{{ $message }}</div>
        @enderror

        <label for="file_input">Description</label>
        <input type="text" name="desc">
        @error('desc')
            <div>{{ $message }}</div>
        @enderror

        <input type="hidden" name="id_house" value="{{$house->id}}">
        <button type="submit">Add</button>

        @if(session('success1'))
            <div class="success-message">{{ session('success1') }}</div>
        @endif

        @if(session('error'))
            <div class="alert alert-error">
                {{ session('error') }}
            </div>
        @endif
    </form>

    @if($house->room->isEmpty())
        <h3>No Data Rooms Available</h3>
    @else
        <p>Room List</p>
        @foreach($house->room as $items)
            <div class="room-item">
                <p>{{ $increment++ . ". " }}</p>
                <p>{{ $items->name }}</p>
                <p>{{ $items->width . " M² X " . $items->length . " M² : " . $items->width * $items->length . " M²" }}</p>
                <p>{{ $items->desc }}</p>
                <a href="{{ route('house.room.detail', $items->id) }}" class="room-detail-link">Detail</a>
            </div>
        @endforeach
    @endif
</div>

                   </div>
                   </div>

<script>
    function submitDeleteHouse() {
    var houseName = document.getElementById('confirmDeleteHouse').value;
    var correctHouseName = "{{ $house->name }}"; // Nama rumah yang ingin dihapus

    if (houseName === correctHouseName) {
        document.getElementById('deleteHouseForm').submit();
    } else {
        document.getElementById('falseHouseName').textContent = "The house name does not match. Please try again.";
    }
}

function closeDeleteHouseModal() {
    // Fungsi untuk menutup modal konfirmasi
    document.querySelector('.sampinganDetail').style.display = 'none';
}

// Fungsi untuk membuka modal konfirmasi penghapusan
function openDeleteDimensionModal() {
    document.getElementById('deleteDimensionModal').style.display = 'flex';
    document.getElementById('deleteItemId').textContent = "ID: " + "{{ $house->id }}";  // Tampilkan ID rumah
}

// Fungsi untuk menutup modal konfirmasi penghapusan
function closeDeleteDimensionModal() {
    document.getElementById('deleteDimensionModal').style.display = 'none';
}

</script>
                   <script>
    let selectedPicId = null; // To store the selected picture ID
    let selectedPicElement = null; // To store the selected picture element

    // Function to select picture for deletion
    function selectPicForDelete(itemId, picElement) {
        // If the same picture is clicked, deselect it
        if (selectedPicElement === picElement) {
            picElement.classList.remove('selected');
            selectedPicId = null;
            document.getElementById('deletePicButton').style.display = 'none'; // Hide delete button
            return;
        }

        // Deselect any previously selected picture
        if (selectedPicElement) {
            selectedPicElement.classList.remove('selected');
        }

        // Select the new picture
        picElement.classList.add('selected');
        selectedPicElement = picElement;
        selectedPicId = itemId;

        // Show the delete button
        document.getElementById('deletePicButton').style.display = 'inline-block'; // Show delete button
    }

    // Function to delete the selected picture
    function deleteSelectedPic() {
        if (selectedPicId !== null) {
            // Set the ID in the modal and the form action
            document.getElementById('deleteItemId').innerText = selectedPicId;
            document.getElementById('deletePicForm').action = '/house/pic/delete/' + selectedPicId; // Adjust the URL for the delete route
            document.getElementById('deletePicModal').style.display = 'flex'; // Show the modal
        }
    }

    // Function to close the delete modal
    function closeDeletePicModal() {
        document.getElementById('deletePicModal').style.display = 'none'; // Hide the modal
    }
</script>
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
        function submitDeleteDetail() {
            document.getElementById('deleteDetailForm').submit();
        }
        function openDeleteDimensionModal(actionUrl) {
            const modal = document.getElementById('deleteDimensionModal');
            const deleteForm = document.getElementById('deleteDimensionForm');
            const deleteItemId = document.getElementById('deleteItemId');

            modal.classList.remove('hidden'); // Show the modal
        }

        // Close the modal when the cancel button is clicked
        document.getElementById('cancelDimensionButton').addEventListener('click', () => {
        document.getElementById('deleteDimensionModal').classList.add('hidden');
        });

    </script>
                <script>
        function submitDeleteHouse() {
            if (document.getElementById('confirmDeleteHouse').value == @json($house->name)) {
                console.log('House name matches!');
                document.getElementById('deleteHouseForm').submit();
            }
            else{
                const falseHouse = "House name doesn't match!";
                document.getElementById('falseHouseName').textContent=falseHouse;
            }
            
        }
        function openDeleteHouseModal(actionUrl) {
            const modal = document.getElementById('deleteHouseModal');
            const deleteForm = document.getElementById('deleteHouseForm');
            const deleteItemId = document.getElementById('deleteItemId');

            modal.classList.remove('hidden'); // Show the modal
        }

        // Close the modal when the cancel button is clicked
        document.getElementById('cancelHouseButton').addEventListener('click', () => {
        document.getElementById('deleteHouseModal').classList.add('hidden');
        });

    </script>
    <script>
        function openDeletePicModal() {
            const modal = document.getElementById('deletePicModal');
            const deleteForm = document.getElementById('deletePicForm');
            const deleteItemId = document.getElementById('deleteItemId');

            modal.classList.remove('hidden'); // Show the modal
    }

    // Close the modal when the cancel button is clicked
    document.getElementById('cancelPicButton').addEventListener('click', () => {
        document.getElementById('deletePicModal').classList.add('hidden'); // Hide the modal
    });
    </script>
</section>
