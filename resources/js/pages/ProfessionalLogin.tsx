import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Briefcase, Building2, ChevronRight, HardHat } from 'lucide-react';

export default function ProfessionalLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
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
                        You are currently logged in as a standard user (<span className="font-medium text-gray-900">{user.email}</span>). To access the partner portal, please sign out of your personal account first.
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

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await axios.post('/login', { email, password });
            const userData = res.data.user;
            
            // Optional: You could optionally check if res.data.user.role_type === 'user' and warn them here.
            login(res.data.access_token, userData);
            navigate('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Invalid login credentials');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex relative overflow-hidden font-sans">
            {/* Left Side - Brand & Trust */}
            <div className="hidden lg:flex lg:w-1/2 bg-neutral-50 relative flex-col justify-between p-12 border-r border-neutral-200">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FF2D20] to-red-400" />
                
                <div className="relative z-10">
                    <Link to="/" className="text-2xl font-black tracking-tighter text-neutral-900 inline-flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#FF2D20] rounded-lg shadow-sm shadow-red-500/20 flex items-center justify-center">
                            <Briefcase className="w-4 h-4 text-white" />
                        </div>
                        4C<span className="text-[#FF2D20]">Pro</span>
                    </Link>
                    
                    <div className="mt-24 max-w-md">
                        <motion.h1 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-4xl font-extrabold text-neutral-900 leading-tight"
                        >
                            Grow your construction & architecture business.
                        </motion.h1>
                        <motion.p 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="mt-4 text-lg text-neutral-600 leading-relaxed"
                        >
                            Connect with high-intent property owners, bid on premium projects, and manage your pipeline—all in one place.
                        </motion.p>
                    </div>

                    <div className="mt-12 space-y-6">
                        <div className="flex items-center gap-4 text-neutral-700">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <HardHat className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Verified Contractors</h3>
                                <p className="text-sm text-neutral-500">Access exclusive building projects</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-neutral-700">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <Building2 className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Elite Architects</h3>
                                <p className="text-sm text-neutral-500">Showcase your portfolio to buyers</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10">
                    <p className="text-sm text-neutral-400">© {new Date().getFullYear()} 4Ceria Platform Solutions</p>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-24 bg-white relative">
                {/* Mobile Header */}
                <div className="lg:hidden mb-12 flex justify-center">
                    <Link to="/" className="text-2xl font-black tracking-tighter text-neutral-900 inline-flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#FF2D20] rounded-lg shadow-sm shadow-red-500/20 flex items-center justify-center">
                            <Briefcase className="w-4 h-4 text-white" />
                        </div>
                        4C<span className="text-[#FF2D20]">Pro</span>
                    </Link>
                </div>

                <div className="w-full max-w-md mx-auto">
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Partner Login</h2>
                        <p className="mt-2 text-neutral-500">
                            Don't have a professional account?{' '}
                            <Link to="/pro/register" className="font-medium text-[#FF2D20] hover:text-red-700 transition-colors">
                                Apply now
                            </Link>
                        </p>
                    </motion.div>

                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="mt-8"
                    >
                        <form className="space-y-6" onSubmit={handleLogin}>
                            {error && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100 flex items-start gap-3">
                                    <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-red-600 flex-shrink-0" />
                                    {error}
                                </motion.div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-2">Work Email</label>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="you@company.com"
                                    className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all focus:bg-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-2">Password</label>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all focus:bg-white"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 transition-all disabled:opacity-50 active:scale-[0.98]"
                            >
                                {isLoading ? 'Authenticating...' : 'Access Dashboard'}
                                {!isLoading && <ChevronRight className="w-4 h-4 opacity-70" />}
                            </button>
                        </form>
                    </motion.div>

                    <div className="mt-8 text-center text-sm">
                        <Link to="/login" className="text-neutral-500 hover:text-neutral-900 transition-colors">
                            ← Return to standard user login
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
