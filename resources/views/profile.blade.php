<x-app-layout>
    <link rel="stylesheet" href="{{ asset('css/profile.css') }}">
    <link rel="stylesheet" href="{{ asset('css/rumahDijual.css') }}">
    <link rel="stylesheet" href="{{ asset('css/aboutus.css') }}">
    <style>
       
        .btn {
            border: none;
            align-self: flex-start;
            transition: ease-in-out 0.4s;
            color: #fd1d1d;

        }
        .btn:hover {
        font-size: 14px;
        letter-spacing: 0.4px;
        }
        .btn:active .btn{
            background-color: #fd1d1d;
        }
        .tab-menu {
            display: flex;
            border-bottom: 2px solid #ddd;
            margin-bottom: 20px;
        }
        .tab-link {
            flex: 1;
            padding: 10px;
            text-align: center;
            cursor: pointer;
            background-color: #f1f1f1;
            border: none;
            outline: none;
            transition: background-color 0.3s ease;
        }
        .tab-link:hover {
            background-color: #ddd;
        }
        .tab-link.active {
            background-color: white;
            border-bottom: 2px solid #fd1d1d;
        }
        .tab-content {
            display: none;
            padding: 20px;
            border-radius: 5px;
            background-color: #fff;
        }
        .navbar {
            border-bottom: 1px solid #ddd;
            margin-bottom: 40px;
            top: 0;
            position: sticky;
            background-color: white;
            z-index: 1000;
        }
        .tab-content.active {
            display: block;
        }
        .profile-image {
    width: 150px; /* Sesuaikan dengan kebutuhan */
    height: 150px; /* Sesuaikan dengan kebutuhan */
    object-fit: cover; /* Mengatur agar gambar tidak terdistorsi */
    border-radius: 50%; /* Membuat gambar berbentuk lingkaran */
    border: 2px solid #ddd; /* Tambahkan border jika diinginkan */
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); /* Tambahkan efek bayangan */
}

        

h5 {
    font-size: 1.2em;
    margin-bottom: 10px;
}

ul {
    list-style-type: none;
    padding: 0;
}



.phone-input {
    padding: 5px;
    font-size: 1em;
    border: 1px solid #ccc;
    border-radius: 4px;
    width: 200px;
}

.btn-update, .btn-delete, .btn-add, .btn-submit {
    padding: 5px 10px;
    font-size: 0.9em;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.btn-update {
    background-color: #fd1d1d;
    color: white;
}

.btn-delete {
    background-color: white;
    color:rgb(38, 38, 38);
}

.btn-add {
    background-color: #fd1d1d;
    color: white;
    margin-top: 10px;
}

.btn-submit {
    background-color: #fd1d1d;
    color: white;
}

.ahhahaha {
    margin-left: 15px;
    margin-top: -90px;
}


.profile-container {
                position: relative;
                display: inline-block;
            }

            .profile-image {
                width: 150px;
                height: 150px;
                border-radius: 50%;
                object-fit: cover;
            }

            .edit-photo-button {
                background-color: #fd1d1d;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                display: block;
                margin-top: 10px;
            }

            .btn {
                padding: 10px;
                background-color: #fd1d1d;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
            }
            .btn-delete-photo {
                background-color: #fd1d1d;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                display: block;
                margin-top: 10px;
            }
            .kelompokButton {
                display: flex;
            }
            </style>
   

    @if($tab != 1)    
    <div id="profile" class="tab-content">
    @else
    <div id="profile" class="tab-content active">
    @endif
        <h3 class="sambutan">Welcome, {{ $user->username }}</h3>

        <div class="atasboss">

        <div class="profile-container">
        @if ($user->pic)
    <img id="profileImage" src="{{ asset('storage/' . $user->pic) }}" alt="Profile Image" class="profile-image">
@else
<img src="{{asset('storage/Assets/Logo4C.png')}}" alt="" class="profile-image">
@endif

<div class="kelompokButton">
        <button type="button" class="edit-photo-button" onclick="triggerFileInput()" style="display: none;">
    <i class="fas fa-pencil-alt"></i> Edit Photo
</button>
<form action="{{ route('profile.pic.delete') }}" method="POST" onsubmit="return confirm('Yakin ingin menghapus foto profil?')">
    @csrf
    @method('DELETE')
    <button type="submit" class="btn-delete-photo" style="display: none;">
        Delete Photo
    </button>
</form>
</div>
</div>
            </div>

            <div class="nameemail">
                <h3 class="namanyadisini">{{ $user->username }}</h3>
                <h3 class="emailinimah">{{ $user->email }}</h3>
                <button type="button" id="editButton" class="btn" onclick="enableEdit()">Edit Profile</button>
            </div>
            <div class="tomboltombol">
    
            </div>
        </div>

        <form action="{{ route('profile.update', Auth::id()) }}" method="POST" enctype="multipart/form-data">
            @method("PATCH")
            @csrf
            <div class="container">
                <div class="kelompok">
                    <div class="atas">
                        <div class="kiri">
                            <div class="dataPenting">
                                <ul>
                                    
                                    <li>
                                        <h5>Username</h5>
                                        
                                        <input type="text" id="username" name="username" value="{{ $user->username }}" disabled>
                                    </li>
                                    <li>
                                        <h5>Password</h5>
                                        <input type="password" id="password" name="update_password" placeholder="New password" disabled>
                                    </li>
                                </ul>
                            </div>
                        </div>
    
                        <div class="kanan">
                            <div class="dataGPenting">
                                <ul>
                                    <li>
                                        <h5>Name</h5>
                                        <input type="text" name="name" value="{{ $user->name }}" disabled>
                                    </li>
                                    <li>
                                        <h5>Email</h5>
                                        <input type="email" id="email" name="email" value="{{ $user->email }}" disabled>
                                    </li>
                                    <li>
                                        <h5>Deskripsi</h5>
                                        <input type="text" id="deskripsi" name="update_deskripsi" value="{{ $user->Deskripsi }}" size="100" disabled>
                                    </li>
                                    <input type="file" id="picInput" name="pic" style="display: none" onchange="previewImage()">
                                </ul>
                            </div>
                        </div>
                    </div>
                   
                    <div class="bawah">
                        
                    @foreach ($errors->all() as $error)
                                        <h4>{{$error}}</h4>
                                    @endforeach
                        <input type="submit" value="Update Profile" class="btn" id="updateButton" style="display: none">
                    </div>
                </div>
            </div>
        </form>
        <style>
            .blacok {
                list-style: none;
            }
              .isiannotelpon {
                padding: 7px;
                border: none;
                border-radius: 8px;
                margin-bottom: 2%;
              }
                .btn1111 {
                    padding: 8px !important;
                    margin-bottom: 5%;
                }
                .btn11:nth-child(1) {
                    margin-bottom: 2px;
                }
                .phone-input {
                    margin-bottom: 3%;
                }
        </style>
        <div class="ahhahaha">
        <h5>Phone Number</h5>
<ul>
    @foreach ($user->phoneNumber as $item)
        <li>
            <form action="{{route('update.phoneNumber', $item->id)}}" method="POST" style="display: inline-block;">
                @csrf
                @method('PUT')
                <input class="phone-input" type="text" name="update_phoneNumber" value="{{ $item->contact }}" />
                <button type="submit" class="btn-update">Update</button>
            </form>
            <form action="{{route('phoneNumber.destroy', $item->id)}}" method="POST" style="display: inline-block;">
                @csrf
                @method('DELETE')
                <button type="submit" class="btn-delete">Delete</button>
            </form>
        </li>
    @endforeach
</ul>

<!-- Add New Phone Number Section -->
<button id="addPhoneButton" class="btn-add">Add Phone Number</button>
<form action="{{route('profile.addPhoneNumber')}}" method="POST" id="addPhoneForm" style="display: none;">
    @csrf
    <input type="text" name="create_phoneNumber" placeholder="Enter new phone number" class="phone-input" />
    <button type="submit" class="btn-submit">Create</button>
</form>
</div>
    </div>
    
   

        
    <script>
    document.getElementById('addPhoneButton').addEventListener('click', function() {
        document.getElementById('addPhoneForm').style.display = 'block';
        this.style.display = 'none'; // Sembunyikan tombol Add setelah diklik
    });
</script>

        <script>
            function triggerFileInput() {
                document.getElementById("picInput").click();
            }

            // Fungsi untuk melihat pratinjau gambar setelah memilih file
            function previewImage() {
                var file = document.getElementById("picInput").files[0];
                var reader = new FileReader();

                reader.onloadend = function () {
                    document.getElementById("profileImage").src = reader.result;
                }

                if (file) {
                    reader.readAsDataURL(file);
                }
            }
        
            function deleteProfilePicture() {
    if (confirm("Yakin ingin menghapus foto profil?")) {
        fetch("{{ route('profile.pic.delete') }}", {
            method: "DELETE",
            headers: {
                "X-CSRF-TOKEN": "{{ csrf_token() }}",
                "Accept": "application/json"
            }
        })
        .then(response => {
            if (response.ok) {
                window.location.reload(); // Refresh halaman setelah delete
            } else {
                alert("Gagal menghapus foto");
            }
        })
        .catch(error => {
            console.error("Error:", error);
        });
    }
}


    document.addEventListener('scroll', () => {
            const fireLine = document.getElementById('fireLine');
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrollPercentage = scrollTop / docHeight;
            fireLine.style.height = `${scrollPercentage * 100}%`;

            if (scrollPercentage > 0) {
                fireLine.classList.add('active');
            } else {
                fireLine.classList.remove('active');
            }
        });

        function enableEdit() {
    const isDisabled = document.getElementById("username").disabled;
    document.querySelectorAll('input[type="text"], input[type="password"], input[type="email"]').forEach(input => {
        input.disabled = !isDisabled;
        input.style.border = isDisabled ? "1px solid #ddd" : "none";
    });
   
    document.getElementById("editButton").textContent = isDisabled ? "Batalkan" : "Edit Profile";
    document.querySelector(".edit-photo-button").style.display = isDisabled ? "inline-block" : "none";
    document.querySelector('.btn-delete-photo').style.display = isDisabled ? "inline-block" : "none";
    document.getElementById("updateButton").style.display = isDisabled ? "inline-block" : "none";
}

            function cancelEdit() {
                const editButton = document.getElementById('editButton');
                const btndeletephoto= document.getElementById('');
                const updateButton = document.getElementById('updateButton');
                document.querySelectorAll('input[type="text"], input[type="password"], input[type="email"]').forEach(input => {
                    input.disabled = true;
                });

                document.querySelectorAll('input').forEach(input => {
                    input.style.border = "none";
                });
                editButton.textContent = "Edit Profile";
                updateButton.style.display = "none";
                editButton.onclick = function() {
                    enableEdit();
                };
            }                                                                   
      
    </script>
</x-app-layout>