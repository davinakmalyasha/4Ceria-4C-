import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function Register() {
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        email: '',
        role_type: 'user',
        password: '',
        password_confirmation: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login, user, isLoading: isAuthLoading } = useAuth();
    const navigate = useNavigate();

    if (!isAuthLoading && user) {
        return <Navigate to="/dashboard" replace />;
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validation parity with backend (min:8) — avoids a raw Laravel error
        // after a needless roundtrip.
        if (formData.password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        if (formData.password !== formData.password_confirmation) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);

        try {
            const res = await axios.post('/register', formData);
            login(res.data.access_token, res.data.user);
            navigate('/dashboard');
        } catch (err: any) {
            const msgs = err.response?.data?.errors;
            if (msgs) {
                const firstError = Object.values(msgs)[0] as string[];
                setError(firstError[0]);
            } else {
                setError(err.response?.data?.message || 'Registration failed');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-3xl rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#FF2D20]/10 blur-3xl rounded-full" />

            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <motion.h2 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 text-center text-3xl font-extrabold text-gray-900 font-sans"
                >
                    Create an account
                </motion.h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Already have an account?{' '}
                    <Link to="/login" className="font-medium text-[#FF2D20] hover:text-red-500 transition-colors">
                        Sign in instead
                    </Link>
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white/80 backdrop-blur-md py-8 px-4 shadow-xl shadow-black/5 ring-1 ring-black/5 sm:rounded-2xl sm:px-10"
                >
                    <form className="space-y-5" onSubmit={handleRegister}>
                        {error && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
                                {error}
                            </motion.div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                                <input type="text" name="name" required value={formData.name} onChange={handleChange} className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Username</label>
                                <input type="text" name="username" required value={formData.username} onChange={handleChange} className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email address</label>
                            <input type="email" name="email" required value={formData.email} onChange={handleChange} className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Account Type</label>
                            <select name="role_type" value={formData.role_type} onChange={handleChange} className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50">
                                <option value="user">User (Looking for Services)</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Password</label>
                                <input type="password" name="password" required value={formData.password} onChange={handleChange} className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                                <input type="password" name="password_confirmation" required value={formData.password_confirmation} onChange={handleChange} className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-[#FF2D20]/50 focus:border-[#FF2D20] sm:text-sm bg-white/50" />
                            </div>
                        </div>

                        <div>
                            <button type="submit" disabled={isLoading} className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-[#FF2D20] hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50">
                                {isLoading ? 'Creating account...' : 'Register'}
                            </button>
                        </div>
                    </form>
                </motion.div>
                
                <div className="mt-8 text-center text-sm flex flex-col gap-3">
                    <Link to="/login" className="text-sm text-[#FF2D20] hover:text-red-700 font-semibold transition">
                        ← Back to Login
                    </Link>
                    <Link to="/pro/register" className="text-neutral-500 hover:text-neutral-900 transition-colors">
                        Looking to provide services? Apply as a Partner →
                    </Link>
                </div>
            </div>
        </div>
    );
}
