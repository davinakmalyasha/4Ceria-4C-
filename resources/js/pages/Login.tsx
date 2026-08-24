import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Briefcase, Building2, ChevronRight, HardHat, Home, ShieldCheck } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login, user, isLoading: isAuthLoading } = useAuth();
    const navigate = useNavigate();

    // Prevent active logins from viewing this page
    if (!isAuthLoading && user) {
        return <Navigate to="/dashboard" replace />;
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await axios.post('/login', { email, password });
            login(res.data.access_token, res.data.user);
            navigate('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Invalid login credentials');
        } finally {
            setIsLoading(false);
        }
    };

    // Dev-only quick login panel lives in an untracked ./dev/ folder.
    // SECURITY: the glob is resolved from the FILESYSTEM at build time, so it must be
    // gated behind import.meta.env.DEV — otherwise the seeded credentials dictionary
    // would be inlined into production bundles on any machine that has the file.
    const quickLoginModule = import.meta.env.DEV
        ? (import.meta.glob<{ default: React.ComponentType }>('./dev/QuickLoginPanel.tsx', { eager: true }) as Record<string, { default: React.ComponentType }>)['./dev/QuickLoginPanel.tsx']
        : undefined;
    const QuickLoginPanel = quickLoginModule?.default;

    return (
        <div className="min-h-screen bg-white flex relative overflow-hidden font-sans">
            {/* Left Side - Brand & Trust (Legacy from Pro Login but unified) */}
            <div className="hidden lg:flex lg:w-1/2 bg-neutral-50 relative flex-col justify-between p-12 border-r border-neutral-200">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FF2D20] to-red-400" />
                
                <div className="relative z-10 text-neutral-900">
                    <Link to="/" className="text-2xl font-black tracking-tighter inline-flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#FF2D20] rounded-lg shadow-sm shadow-red-500/20 flex items-center justify-center">
                            <span className="text-white font-bold text-xs">4C</span>
                        </div>
                        4Ceria<span className="text-[#FF2D20]">.</span>
                    </Link>
                    
                    <div className="mt-24 max-w-md">
                        <motion.h1 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-4xl font-extrabold leading-tight text-neutral-900"
                        >
                            Real Estate & <br />
                            <span className="text-[#FF2D20]">Professional Marketplace.</span>
                        </motion.h1>
                        <motion.p 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="mt-4 text-lg text-neutral-600 leading-relaxed"
                        >
                            The most complete platform to buy houses, hire elite architects, and manage building projects seamlessly.
                        </motion.p>
                    </div>

                    <div className="mt-12 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <Home className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Explore Properties</h3>
                                <p className="text-sm text-neutral-500">Buy or sell your home with ease</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <ShieldCheck className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Hire verified talent</h3>
                                <p className="text-sm text-neutral-500">Connect with elite architects & constructors</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10">
                    <p className="text-sm text-neutral-400">© {new Date().getFullYear()} 4Ceria Creative Construction</p>
                </div>
            </div>

            {/* Right Side - Universal Login Form */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-24 bg-white relative">
                {/* Mobile Header / Home Link */}
                <div className="absolute top-8 left-8 lg:left-24">
                    <Link to="/" className="text-sm font-semibold text-neutral-500 hover:text-[#FF2D20] transition-colors flex items-center gap-2">
                        ← Back to Home
                    </Link>
                </div>

                <div className="w-full max-w-md mx-auto">
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Welcome Back</h2>
                        <p className="mt-2 text-neutral-500">
                            Don't have an account?{' '}
                            <Link to="/register" className="font-medium text-[#FF2D20] hover:text-red-700 transition-colors">
                                Create account
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
                                <label className="block text-sm font-semibold text-neutral-700 mb-2">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all focus:bg-white"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-semibold text-neutral-700">Password</label>
                                    <Link to="/forgot-password" className="text-xs font-semibold text-[#FF2D20] hover:text-red-700">Forgot password?</Link>
                                </div>
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
                                id="login-submit-btn"
                                disabled={isLoading}
                                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 transition-all disabled:opacity-50 active:scale-[0.98]"
                            >
                                {isLoading ? 'Authenticating...' : 'Sign in to Dashboard'}
                                {!isLoading && <ChevronRight className="w-4 h-4 opacity-70" />}
                            </button>
                        </form>

                        {QuickLoginPanel && <QuickLoginPanel />}
                    </motion.div>

                    {/* Secondary Branded Redirect for Professionals */}
                    <div className="mt-12 pt-8 border-t border-neutral-100">
                        <div className="p-4 bg-neutral-50 rounded-2xl flex items-center justify-between gap-4">
                            <div>
                                <h4 className="text-sm font-bold text-neutral-800">Become a Partner</h4>
                                <p className="text-xs text-neutral-500">For Architects & Constructors</p>
                            </div>
                            <Link 
                                to="/pro/register" 
                                className="inline-flex items-center gap-1.5 py-2 px-4 bg-white border border-neutral-200 text-[#FF2D20] text-xs font-bold rounded-lg hover:shadow-md transition-all active:scale-95"
                            >
                                Get Started <ChevronRight className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
