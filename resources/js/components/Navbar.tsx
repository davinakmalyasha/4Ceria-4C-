import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
    const { user } = useAuth();
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
        <div className={`custom-navbar-container ${hidden ? 'hidden-nav' : ''}`}>
            <div className="kiriNavbar">
                <Link to="/" className="flex items-center">
                    <img className="logoss" src="/storage/Assets/Logo4C.png" alt="4C Logo" />
                </Link>

            </div>

            <div className="kananNavbar">
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
        </div>
    );
}
