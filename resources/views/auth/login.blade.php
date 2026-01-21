<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="{{ asset('css/LoginPage0.css') }}">
    <style>
        .error-text {
            color: red;
            font-size: 12px;
            margin-top: 5px;
        }
    </style>
    <title>Login or Register</title>
</head>

<body>
    <div class="container" id="container">
      
        <div class="form-container sign-up">
            <form id="registerForm" action="{{route('proses_register')}}" method="POST" onsubmit="return validateRegisterForm(event)">
                @csrf
                @method('POST')
                <h1>Daftarkan Diri Anda</h1>

                <div class="input-container">
                    <input class="form-control" type="text" id="name" name="name" placeholder="Nama" onkeyup="validateName()" autocomplete="name">
                    <span id="name-error" class="error-text"></span>
                    @error('name')
                    <span class="error-text">{{$message}}</span>
                    @enderror
                </div>

                <div class="input-container">
                    <input class="form-control" type="text" id="username" name="username" placeholder="User Name" onkeyup="validateUsername()" autocomplete="username">
                    <span id="username-error" class="error-text"></span>
                    @error('username')
                    <span class="error-text">{{$message}}</span>
                    @enderror
                </div>

                <div class="input-container">
                    <input class="form-control" type="text" id="email" name="email" placeholder="Email" onkeyup="validateEmail()" autocomplete="email">
                    <span id="email-error" class="error-text"></span>
                    @error('email')
                    <span class="error-text">{{$message}}</span>
                    @enderror
                </div>

                <div class="input-container">
                    <input class="form-control" type="password" id="password1" name="password" placeholder="Kata Sandi" onkeyup="validatePassword()">
                    <img id="togglePassword1" src="{{ asset('images/icons/hidden.png') }}" alt="eye icon">
                    <span id="password-error" class="error-text"></span>
                    @error('password')
                    <span class="error-text">{{$message}}</span>
                    @enderror
                </div>

                <div class="input-container">
                    <input class="form-control" type="password" id="password2" name="password_confirmation" placeholder="Konfirmasi Kata Sandi" onkeyup="validatePasswordConfirm()">
                    <img id="togglePassword2" src="{{ asset('images/icons/hidden.png') }}" alt="eye icon">

                    <span id="passwordconfirm-error" class="error-text"></span>
                </div>
                <div class="input-container">
                    <label for="role_type">Daftar Sebagai:</label>
                    <select id="role_type" name="role_type" class="form-control" required>
                        <option value="user">User</option>
                        <option value="arsitek">Arsitek</option>
                        <option value="kontraktor">Kontraktor</option>
                        <option value="admin">admin</option>
                    </select>
                </div>

                <button type="submit" name="register" class="signup-button">Daftar</button>
            </form>
        </div>



        
        <div class="form-container sign-in">
            <form action="{{route('login')}}" method="POST">
                @csrf
                @method('POST')
                <h1>Masuk</h1>
                <div class="input-container">
                    <input class="form-control" type="text" name="login" id="login" placeholder="Email atau Username">
                    <span id="username-error" class="error-text"></span>
                </div>

                <div class="input-container">
                    <input class="form-control" type="password" name="password" placeholder="Password">
                    <a href="{{ route('password.request') }}">Forget Your Password?</a>

                </div>
                <label for="role_type1">Login sebagai:</label>
    <select id="role_type1" name="role_type1" required>
        <option value="user">User</option>
        <option value="arsitek">Arsitek</option>
        <option value="kontraktor">kontraktor</option>
        <option value="admin">admin</option>
    </select>
                @error('login')
                <span class="error-text">{{$message}}</span>
                @enderror
                <button type="submit" name="" class="daftar-button">Masuk</button>
            </form>
        </div>

        <div class="toggle-container">
            <div class="toggle">
                <div class="toggle-panel toggle-left">
                    <h1>Daftar Akun</h1>
                    <p>Sudah Punya Akun?, Klik Tombol Dibawah Ini!</p>
                    <button onclick="showToast()" class="hidden" id="loginBtn">Log-In</button>
                </div>
                <div class="toggle-panel toggle-right">
                    <h1>Selamat datang!</h1>
                    <p>Belum Punya Akun?, Klik Tombol Dibawah Ini!</p>
                    <button class="hidden" id="register">Daftar</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const container = document.getElementById('container');
        const registerBtn = document.getElementById('register');
        const loginBtn = document.getElementById('loginBtn');

        registerBtn.addEventListener('click', () => {
            container.classList.add("active");
        });

        loginBtn.addEventListener('click', () => {
            container.classList.remove("active");
        });

        const togglePassword1 = document.getElementById('togglePassword1');
        const password1 = document.getElementById('password1');
        togglePassword1.addEventListener('click', () => {
            const type = password1.type === "password" ? "text" : "password";
            password1.type = type;
            togglePassword1.src = type === "password" ? "images/icons/hidden.png" : "images/icons/eye.png";
        });

        const togglePassword2 = document.getElementById('togglePassword2');
        const password2 = document.getElementById('password2');
        togglePassword2.addEventListener('click', () => {
            const type = password2.type === "password" ? "text" : "password";
            password2.type = type;
            togglePassword2.src = type === "password" ? "images/icons/hidden.png" : "images/icons/eye.png";
        });

        var nameError = document.getElementById('name-error');
        var usernameError = document.getElementById('username-error');
        var emailError = document.getElementById('email-error');
        var passwordError = document.getElementById('password-error');
        var passwordconfirmError = document.getElementById('passwordconfirm-error');

        function validateName() {
            var name = document.getElementById('name').value;
            if (name.length == 0) {
                nameError.innerHTML = 'Nama tidak boleh kosong!';
            } else {
                nameError.innerHTML = '';
            }
        }

        function validateUsername() {
            var username = document.getElementById('username').value;
            if (username.length == 0) {
                usernameError.innerHTML = 'Username tidak boleh kosong!';
            } else {
                usernameError.innerHTML = '';
            }
        }

        function validateEmail() {
            var email = document.getElementById('email').value;
            var emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

            if (email.length == 0) {
                emailError.innerHTML = 'Email tidak boleh kosong!';
            } else if (!emailPattern.test(email)) {
                emailError.innerHTML = 'Email tidak valid!';
            } else {
                emailError.innerHTML = '';
            }
        }

        function validatePassword() {
            var password = document.getElementById('password1').value;

            if (password.length == 0) {
                passwordError.innerHTML = 'Password tidak boleh kosong!';
            } else if (password.length < 8) {
                passwordError.innerHTML = 'Password minimal 8 karakter!';
            } else {
                passwordError.innerHTML = '';
            }
        }

        function validatePasswordConfirm() {
            var password1 = document.getElementById('password1').value;
            var password2 = document.getElementById('password2').value;

            if (password2.length == 0) {
                passwordconfirmError.innerHTML = 'Konfirmasi password tidak boleh kosong!';
            } else if (password1 !== password2) {
                passwordconfirmError.innerHTML = 'Password dan konfirmasi tidak cocok!';
            } else {
                passwordconfirmError.innerHTML = ''; 
            }
        }
  
        function validateRegisterForm(event) {
            var valid = true;

            validateName();
            validateUsername();
            validateEmail();
            validatePassword();
            validatePasswordConfirm();

            if (nameError.innerHTML || usernameError.innerHTML || emailError.innerHTML || passwordError.innerHTML || passwordconfirmError.innerHTML) {
                valid = false;
            }

            return valid;
        }

        // Validasi Login Form
        // function validateLoginForm(event) {
        //     var valid = true;

        //     var username = document.getElementsByName('username')[0].value;
        //     var password = document.getElementsByName('password')[0].value;

        //     if (username.length == 0) {
        //         alert('Username atau email tidak boleh kosong');
        //         valid = false;
        //     }

        //     if (password.length == 0) {
        //         alert('Password tidak boleh kosong');
        //         valid = false;
        //     }

        //     return valid;
        // } 
    </script>
</body>

</html>