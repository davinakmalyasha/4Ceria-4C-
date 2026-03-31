import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
    const { user, logout } = useAuth();
    const [hidden, setHidden] = useState(false);
    const lastScrollY = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY || document.documentElement.scrollTop;
            if (currentScrollY > lastScrollY.current) {
                setHidden(true);
            } else {
                setHidden(false);
            }
            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <>
            <style>{`
                .custom-navbar-container {
                    background-color: white;
                    display: flex;
                    align-items: center;
                    position: sticky;
                    top: 0;
                    justify-content: space-between;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.25);
                    z-index: 1000;
                    transition: transform 0.3s ease-in-out;
                    width: 100%;
                }
                .custom-navbar-container.hidden-nav {
                    transform: translateY(-100%);
                }
                .custom-navbar-container .logoss {
                    margin-left: 12px;
                    margin-right: 42px;
                    width: 84px;
                    height: 82px;
                }
                .kiriNavbar { display: flex; align-items: center; }
                .kiriNavbar ul { display: flex; align-items: center; gap: 30px; margin: 0; padding: 0; }
                .kiriNavbar ul li { list-style: none; }
                .kiriNavbar ul li a { text-decoration: none; color: #0f172a; font-size: 14px; transition: 0.3s ease; border-radius: 10px; font-weight: 600;}
                .kiriNavbar ul li:hover a { color: white; background-color: #fd1d1d; padding: 4px 6px; }
                
                .loginOrRegis {
                    background-color: rgb(242, 242, 242);
                    color: #fd1d1d;
                    padding: 12px 14px;
                    border: none;
                    font-size: 17px;
                    cursor: pointer;
                    border-radius: 9px;
                    transition: 0.4s ease;
                    margin-right: 20px;
                    font-weight: 700;
                }
                .loginOrRegis:hover { background-color: #fd1d1d; color: white; }

                /* Profile & Dropdown */
                .profile-wrapper {
                    position: relative;
                    margin-right: 20px;
                }
                .profile-btn {
                    display: flex;
                    gap: 9px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    color: white;
                    background-color: #fd1d1d;
                    border: 1px solid white;
                    align-items: center;
                    cursor: pointer;
                    height: 48px;
                }
                .profile-btn img {
                    width: 40px; height: 40px;
                    border-radius: 50%;
                    object-fit: cover;
                    background-color: white;
                }
                .profile-btn span { font-weight: 600; padding-right: 8px;}
                
                .dropdown-menu {
                    position: absolute;
                    top: 60px;
                    right: 0;
                    background-color: white;
                    width: 250px;
                    border-radius: 10px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(-10px);
                    transition: all 0.3s ease;
                    padding: 20px;
                    border: 1px solid #eee;
                }
                .profile-wrapper:hover .dropdown-menu {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }
                .profile-section { text-align: center; margin-bottom: 20px; }
                .profile-section img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom:10px; background-color: #f3f4f6;}
                .profile-section h3 { font-size: 18px; color: #333; margin: 0; font-weight: bold; }
                
                .dropdown-menu ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px;}
                .dropdown-menu ul li a, .dropdown-menu ul li button {
                    display: block; width: 100%; text-align: center; padding: 10px; color: #333; text-decoration: none;
                    border-radius: 8px; font-weight: 600; transition: 0.2s; background: transparent; border: none; cursor:pointer;
                }
                .dropdown-menu ul li a:hover { background-color: #f3f4f6; color: #fd1d1d; }
                .dropdown-menu ul li button { color: white; background-color: #fd1d1d; margin-top: 10px;}
                .dropdown-menu ul li button:hover { background-color: #d11a1a; }
            `}</style>

            <div className={`custom-navbar-container ${hidden ? 'hidden-nav' : ''}`}>
                <div className="kiriNavbar">
                    <img className="logoss" src="/storage/Assets/Logo4C.png" alt="4C Logo" />
                    <ul>
                        <li><Link to="/">Home</Link></li>
                    </ul>
                </div>

                {!user ? (
                    <Link to="/login">
                        <button className="loginOrRegis">Sign In/Up</button>
                    </Link>
                ) : (
                    <Link to="/dashboard">
                        <button className="loginOrRegis">Access Dashboard</button>
                    </Link>
                )}
            </div>
        </>
    );
}
