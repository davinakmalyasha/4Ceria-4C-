import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Home, ShieldCheck, ChevronRight } from 'lucide-react';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const { user, isLoading: isAuthLoading } = useAuth();

    // Prevent active logins from viewing this page
    if (!isAuthLoading && user) {
        return <Navigate to="/dashboard" replace />;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await axios.post('/forgot-password', { email });
            setSent(true);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex relative overflow-hidden font-sans">
            {/* Left Side - Brand */}
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
                            Forgot your <br />
                            <span className="text-[#FF2D20]">Password?</span>
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="mt-4 text-lg text-neutral-600 leading-relaxed"
                        >
                            No worries — enter your email and we'll send you a link to reset it.
                        </motion.p>
                    </div>

                    <div className="mt-12 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <ShieldCheck className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Secure & Fast</h3>
                                <p className="text-sm text-neutral-500">Your data is encrypted and protected</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-neutral-100 flex items-center justify-center">
                                <Home className="w-6 h-6 text-[#FF2D20]" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Back to your projects</h3>
                                <p className="text-sm text-neutral-500">Resume where you left off in minutes</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10">
                    <p className="text-sm text-neutral-400">© {new Date().getFullYear()} 4Ceria Creative Construction</p>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-24 bg-white relative">
                <div className="absolute top-8 left-8 lg:left-24">
                    <Link to="/login" className="text-sm font-semibold text-neutral-500 hover:text-[#FF2D20] transition-colors flex items-center gap-2">
                        ← Back to Login
                    </Link>
                </div>

                <div className="w-full max-w-md mx-auto">
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        <h2 className="text-3xl font-bold text-neutral-900 tracking-tight">Reset Password</h2>
                        <p className="mt-2 text-neutral-500">
                            Remember your password?{' '}
                            <Link to="/login" className="font-medium text-[#FF2D20] hover:text-red-700 transition-colors">
                                Sign in
                            </Link>
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="mt-8"
                    >
                        {sent ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="p-6 rounded-2xl bg-green-50 border border-green-100"
                            >
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                    <ShieldCheck className="w-6 h-6 text-green-600" />
                                </div>
                                <h3 className="text-lg font-bold text-green-800 mb-2">Check your email</h3>
                                <p className="text-sm text-green-700 leading-relaxed">
                                    If an account with that email exists, we've sent a password reset link to <strong>{email}</strong>.
                                </p>
                                <p className="mt-3 text-sm text-green-600">
                                    Didn't receive the email? Check your spam folder or{' '}
                                    <button
                                        onClick={() => { setSent(false); setIsLoading(false); }}
                                        className="font-semibold text-green-800 hover:text-green-900 underline"
                                    >
                                        try again
                                    </button>.
                                </p>
                                <div className="mt-6 pt-4 border-t border-green-200">
                                    <Link
                                        to="/login"
                                        className="inline-flex items-center gap-2 text-sm font-semibold text-green-800 hover:text-green-900"
                                    >
                                        ← Back to Login
                                    </Link>
                                </div>
                            </motion.div>
                        ) : (
                            <form className="space-y-6" onSubmit={handleSubmit}>
                                {error && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100 flex items-start gap-3">
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

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 transition-all disabled:opacity-50 active:scale-[0.98]"
                                >
                                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                                    {!isLoading && <ChevronRight className="w-4 h-4 opacity-70" />}
                                </button>
                            </form>
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
