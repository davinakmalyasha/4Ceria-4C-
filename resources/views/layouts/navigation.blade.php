<div class="navbar">
    <script>
        let lastScrollTop = 0;
        const navbar = document.querySelector(".navbar");

        window.addEventListener("scroll", function() {
            let scrollTop = window.pageYOffset || document.documentElement.scrollTop;

            if (scrollTop > lastScrollTop) {

                navbar.style.transform = "translateY(-100%)";
                navbar.style.transition = "transform 0.3s ease-in-out";
            } else {

                navbar.style.transform = "translateY(0)";
            }

            lastScrollTop = scrollTop;
        });
    </script>


    <div class="kiriNavbar">
        <img class="logoss" src="{{asset('storage/Assets/Logo4C.png')}}" width="84px" height="82px" alt="">
        <ul>
            <li><a href="{{route('index')}}">Home</a></li>
            <li><a href="{{route('cariRumah')}}">Cari Rumah</a></li>
            <li><a href="{{route('house.index')}}">Jual Rumah</a></li>
            <li><a href="{{ route('arsitek') }}">Arsitek</a></li>
            <li><a href="{{ route('kontraktor.list') }}">Kontraktor</a></li>
            <li><a href="{{ route('forum.project') }}">Forum Project</a></li>


        </ul>
    </div>
    <style>
        @keyframes kananKiri {
            from {
                opacity: 0;
                transform: translateX(100px);
            }

            to {
                opacity: 1;
                transform: translateX(0px);
            }
        }

        @keyframes kiriKanan {
            from {
                opacity: 0;
                transform: translateX(-100px);
            }

            to {
                opacity: 1;
                transform: translateX(0px);
            }
        }

        @keyframes atasBawah {
            from {
                opacity: 0;
                transform: translateY(100px);
            }

            to {
                opacity: 1;
                transform: translateY(0px);
            }
        }

        @keyframes bawahAtas {
            from {
                opacity: 0;
                transform: translateY(-100px);
            }

            to {
                opacity: 1;
                transform: translateY(0px);
            }
        }


        * {
            font-family: "Plus Jakarta Sans";
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            scroll-behavior: smooth;
        }

        .navbar {
            background-color: white;
            display: flex;
            align-items: center;
            position: sticky;
            top: 0;
            justify-content: space-between;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.25);
            z-index: 1000;
        }

        .navbar .logoss {
            margin-left: 12px;
            margin-right: 42px;
        }

        .navbar img {
            width: auto;
            width: 50px;
            height: 50px;
        }

        .fotoAtas img {
            border-radius: 20px;
        }

        .kiriNavbar {
            display: flex;
        }

        .mapsrumah {
            width: 100%;
            height: 75vh;
        }

        .mapsrumah img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .kiriNavbar ul {
            display: flex;
            align-items: center;
            gap: 30px;
        }

        .kiriNavbar ul li {
            list-style: none
        }

        .kiriNavbar ul li a {
            text-decoration: none;
            color: #0f172a;
            font-size: 14px;
            transition: 0.3s ease;
            border-radius: 10px;
        }

        .kiriNavbar ul li:nth-child(2) {
            list-style: none;
        }

        .kiriNavbar ul li:hover a {
            color: white;
            background-color: #fd1d1d;
            padding: 4px 6px;
            border-radius: 10px;
        }

        .kiriNavbar ul li:last-child a {
            margin: 0;
        }

        .loginOrRegis {
            background-color: rgb(242, 242, 242);
            color: #fd1d1d;
            padding: 12px 14px;
            max-width: 100%;
            border: none;
            font-size: 17px;
            cursor: pointer;
            border-radius: 9px;
            transition: 0.4s ease;
            margin-right: 20px;
        }

        .loginOrRegis:hover {
            background-color: #fd1d1d;
            color: white
        }

        .getStarted {
            background-color: #e7e5e5;
            color: #9F2A2A;
            padding: 8px 12px;
            margin-top: 3%;
            max-width: 100%;
            border: none;
            font-size: 12px;
            cursor: pointer;
            border-radius: 9px;
            transition: 0.4s ease;
        }

        .getStarted:hover {
            background-color: #9F2A2A;
            color: white
        }

        .profile {
            display: flex;
            gap: 9px;
            padding: 2px 6px;
            border-radius: 10px;
            color: white;
            background-color: #fd1d1d;
            border: 1px solid white;
            align-items: center;
        }

        .profile img {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
        }

        .dropdown {
            position: relative;
            overflow: hidden;
        }

        .dropbtn {
            color: green;
        }

        .dropdown button {
            outline: none;
            border: none;
            background: none;
            color: white;
            cursor: pointer;
        }

        .dropdown-content {
            display: block;
            position: fixed;
            z-index: 2;
            padding: 20px 0;
            background-color: white;
            color: black;
            width: 19%;
            height: 76vh;
            border-radius: 10px 0 0 10px;
            right: 0;
            top: 0;
            box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
            transform: translateX(100%);
            opacity: 0;
            transition: transform 0.5s ease, opacity 0.5s ease;
        }


        .dropdown:hover .dropdown-content,
        .dropdown:focus-within .dropdown-content {
            transform: translateX(0);
            opacity: 1;
        }


        .profile-section {
            text-align: center;
            margin-bottom: 20px;
        }

        .profile-section img.profileguys {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            object-fit: cover;
            margin-bottom: 10px;
        }

        .profile-section .username {
            font-size: 18px;
            color: #333;
            margin: 0;
            font-weight: bold;
        }

        .dropdown-content .profile h3 {
            color: black;
            margin: 0;
        }

        .dropdown-content ul {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 0;
            margin-top: 18%;
            list-style: none;
            gap: 20px;
        }

        .dropdown-content ul:nth-child(2) li a button {
            margin-top: 5%;
            color: #fd1d1d;
        }

        .dropdown-content ul li a {
            color: black;
            text-decoration: none;
            width: 80%;
            padding: 2px 4px;
            text-align: center;
            border-radius: 5px;
            font-size: 14px;
            transition: ease 0.3s;
        }

        .dropdown-content ul li a:hover {
            color: white;
            background-color: #fd1d1d;
            padding: 4px 6px;
            border-radius: 10px
        }

        .ini ul:nth-child(2) li a button p {
            margin-top: 5%;
            color: #fd1d1d;
            background-color: #fd1d1d;
        }

        .dropdown:not(:hover) .dropdown-content {
            transform: translateX(100%);
            opacity: 0;
        }

        .tombollogoutieu {
            color: red !important;
            background-color: #fd1d1d;
            border-radius: 10px;
        }
    </style>
    @if (Auth::id()==null)
    <a href="{{route('login')}}"><button class="loginOrRegis">Sign In/Up</button></a>
    @else

    <div class="dropdown">
        <div class="profile">
            @if (Auth::check() && Auth::user()->pic)
            <img id="profileImage" src="{{ asset('storage/' . Auth::user()->pic) }}" alt="Profile Image" class="profile-image">
            @else
            <img src="{{ asset('storage/Assets/Logo4C.png') }}" alt="Default Profile Image" class="profile-image">
            @endif
            <style>
                .profile-image {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    object-fit: cover;
                    background-color: white;
                }
            </style>

            <button class="dropbtn">{{AUTH::user()->username}}</button>
        </div>
        <div class="dropdown-content" id="myDropdown">
            <div class="profile-section">
                @if (Auth::check() && Auth::user()->pic)
                <img id="profileImage" src="{{ asset('storage/' . Auth::user()->pic) }}" alt="Profile Image" class="profile-image">
                @else
                <img src="{{ asset('storage/Assets/Logo4C.png') }}" alt="Default Profile Image" class="profile-image">
                @endif
                <h3 class="username">{{AUTH::user()->name}}</h3>
            </div>
            <hr>
            <ul class="ini">
                <ul>
                    <li><a href="{{ route('profile.edit', 1) }}">Profile</a></li>
                    <li><a href="{{ route('user.project.riwayat') }}">Lihat Riwayat Proyek</a>
</li>
                </ul>

                <li>
                    <form action="{{route('logout')}}" method="POST">
                        @csrf
                        <a class="tombollogoutieu"><button type="submit">
                                <p>LogOut</p>
                            </button></a>
                    </form>
                </li>
            </ul>
        </div>
    </div>
    @endif

</div>