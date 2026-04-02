import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Briefcase, Building2, HardHat, CheckCircle2 } from 'lucide-react';

export default function ProfessionalRegister() {
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        email: '',
        role_type: 'arsitek', // Default to arsitek, skip 'user'
        password: '',
        password_confirmation: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login, logout, user, isLoading: isAuthLoading } = useAuth();
    const navigate = useNavigate();

    if (!isAuthLoading && user) {
        if (user.role_type === 'arsitek' || user.role_type === 'kontraktor') {
            return <Navigate to="/dashboard" replace />;
        }
        return (
            <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6 font-sans">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 text-[#FF2D20] rounded-full flex items-center justify-center mx-auto mb-6">
                        <Briefcase size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Partner Portal</h2>
                    <p className="text-gray-600 mb-8 leading-relaxed">
                        You are currently logged in as a standard user (<span className="font-medium text-gray-900">{user.email}</span>). To register a partner account, please sign out of your personal account first.
                    </p>
                    <div className="space-y-3">
                        <Link to="/dashboard" className="block w-full py-3 px-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-900 font-semibold rounded-xl transition-all shadow-sm">
                            Return to My Dashboard
                        </Link>
                        <button onClick={logout} className="block w-full py-3 px-4 bg-[#FF2D20] hover:bg-red-700 text-white font-semibold rounded-xl transition-all shadow-sm active:scale-[0.98]">
                            Sign Out Current Account
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRoleSelect = (role: 'arsitek' | 'kontraktor') => {
        setFormData({ ...formData, role_type: role });
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

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
        <div className="min-h-screen flex bg-white font-sans relative">
            {/* Left Side - Brand & Trust */}
            <div className="hidden lg:flex lg:w-1/3 bg-neutral-900 border-r border-neutral-800 flex-col p-10 justify-between text-white relative overflow-hidden">
                {/* Accent glow */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#FF2D20]/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
                
                <div className="relative z-10 w-full max-w-sm">
                    <Link to="/" className="text-2xl font-black tracking-tighter text-white inline-flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#FF2D20] rounded-lg flex items-center justify-center">
                            <Briefcase className="w-4 h-4 text-white" />
                        </div>
                        4C<span className="text-[#FF2D20]">Pro</span>
                    </Link>

                    <div className="mt-20">
                        <h2 className="text-3xl font-bold leading-snug">Become a verified professional.</h2>
                        <ul className="mt-8 space-y-6">
                            {[
                                "Access high-budget premium projects.",
                                "Verified client intent & direct chatting.",
                                "Manage your portfolio, bids, and invoices in one dashboard.",
                                "Exclusive tools for real estate development."
                            ].map((text, i) => (
                                <li key={i} className="flex items-start gap-4">
                                    <CheckCircle2 className="w-6 h-6 text-[#FF2D20] shrink-0" />
                                    <span className="text-neutral-300 text-sm leading-relaxed">{text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="relative z-10 text-neutral-500 text-xs mt-auto pt-8">
                    © {new Date().getFullYear()} 4Ceria Platform Solutions
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-2/3 flex flex-col justify-center items-center p-6 sm:p-12 relative">
                <div className="w-full max-w-xl">
                    <div className="mb-10 lg:hidden">
                        <Link to="/" className="text-2xl font-black tracking-tighter text-neutral-900 inline-flex items-center gap-2">
                            <div className="w-8 h-8 bg-[#FF2D20] rounded-lg">
                                <Briefcase className="w-full h-full text-white p-1.5" />
                            </div>
                            4C<span className="text-[#FF2D20]">Pro</span>
                        </Link>
                    </div>

                    <div className="mb-8">
                        <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">Create your business profile</h1>
                        <p className="mt-2 text-neutral-500">
                            Already a partner?{' '}
                            <Link to="/login" className="font-semibold text-[#FF2D20] hover:text-red-700 transition">Log in</Link>
                        </p>
                    </div>

                    <form onSubmit={handleRegister} className="space-y-6">
                        {error && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100 flex items-start gap-3">
                                <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-red-600 shrink-0" />
                                {error}
                            </motion.div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-2">Company / Full Name</label>
                                <input type="text" name="name" required value={formData.name} onChange={handleChange} className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-2">Username</label>
                                <input type="text" name="username" required value={formData.username} onChange={handleChange} className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-neutral-700 mb-2">Work Email Address</label>
                            <input type="email" name="email" required value={formData.email} onChange={handleChange} className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
                        </div>

                        {/* Role Selection */}
                        <div>
                            <label className="block text-sm font-semibold text-neutral-700 mb-2">I am signing up as</label>
                            <div className="grid grid-cols-2 gap-4">
                                <label 
                                    className={`relative cursor-pointer rounded-xl border-2 p-4 flex flex-col items-center gap-3 transition-all ${
                                        formData.role_type === 'arsitek' 
                                            ? 'border-[#FF2D20] bg-red-50/50 shadow-sm' 
                                            : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                                    }`}
                                >
                                    <div className={`p-3 rounded-full ${formData.role_type === 'arsitek' ? 'bg-[#FF2D20] text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                                        <Building2 className="w-6 h-6" />
                                    </div>
                                    <div className="text-center">
                                        <div className={`font-bold ${formData.role_type === 'arsitek' ? 'text-[#FF2D20]' : 'text-neutral-700'}`}>Architect</div>
                                        <div className="text-xs text-neutral-500 mt-1 leading-snug">Design homes & submit visual plans</div>
                                    </div>
                                    <input type="radio" name="role_type" value="arsitek" checked={formData.role_type === 'arsitek'} onChange={() => handleRoleSelect('arsitek')} className="sr-only" />
                                </label>

                                <label 
                                    className={`relative cursor-pointer rounded-xl border-2 p-4 flex flex-col items-center gap-3 transition-all ${
                                        formData.role_type === 'kontraktor' 
                                            ? 'border-[#FF2D20] bg-red-50/50 shadow-sm' 
                                            : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                                    }`}
                                >
                                    <div className={`p-3 rounded-full ${formData.role_type === 'kontraktor' ? 'bg-[#FF2D20] text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                                        <HardHat className="w-6 h-6" />
                                    </div>
                                    <div className="text-center">
                                        <div className={`font-bold ${formData.role_type === 'kontraktor' ? 'text-[#FF2D20]' : 'text-neutral-700'}`}>Constructor</div>
                                        <div className="text-xs text-neutral-500 mt-1 leading-snug">Quote & execute physical builds</div>
                                    </div>
                                    <input type="radio" name="role_type" value="kontraktor" checked={formData.role_type === 'kontraktor'} onChange={() => handleRoleSelect('kontraktor')} className="sr-only" />
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-2">Password</label>
                                <input type="password" name="password" required value={formData.password} onChange={handleChange} className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-2">Confirm Password</label>
                                <input type="password" name="password_confirmation" required value={formData.password_confirmation} onChange={handleChange} className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm focus:bg-white transition-all shadow-sm" />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button disabled={isLoading} type="submit" className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 transition-all disabled:opacity-50 active:scale-[0.98]">
                                {isLoading ? 'Creating business profile...' : 'Apply for Professional Access'}
                            </button>
                        </div>
                    </form>

                    <div className="mt-8 pt-6 border-t border-neutral-100 text-center flex flex-col gap-3">
                        <Link to="/login" className="text-sm text-[#FF2D20] hover:text-red-700 font-semibold transition">
                            ← Back to Login
                        </Link>
                        <Link to="/register" className="text-sm text-neutral-500 hover:text-neutral-800 transition">
                            Looking to buy or hire instead? Create a user account →
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
