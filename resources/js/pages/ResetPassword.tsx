import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useParams, useSearchParams, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ChevronRight } from 'lucide-react';

export default function ResetPassword() {
    const { token } = useParams<{ token: string }>();
    const [searchParams] = useSearchParams();
    const email = searchParams.get('email') || '';

    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const { user, isLoading: isAuthLoading } = useAuth();

    // Prevent active logins from viewing this page
    if (!isAuthLoading && user) {
        return <Navigate to="/dashboard" replace />;
    }

    // Invalid link — missing token or email
    if (!token || !email) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center px-6">
                <div className="max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShieldCheck className="w-8 h-8 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-neutral-900 mb-3">Invalid Reset Link</h2>
                    <p className="text-neutral-600 mb-6">
                        This password reset link is invalid or expired. Please request a new one.
                    </p>
                    <Link
                        to="/forgot-password"
                        className="inline-flex items-center gap-2 py-3 px-6 bg-neutral-900 text-white text-sm font-bold rounded-xl hover:bg-neutral-800 transition-all"
                    >
                        Request New Link
                    </Link>
                </div>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (password !== passwordConfirmation) {
            setError('Passwords do not match.');
            return;
        }

        setIsLoading(true);

        try {
            await axios.post('/reset-password', {
                token,
                email,
                password,
                password_confirmation: passwordConfirmation,
            });
            setSuccess(true);
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
                            Set a New <br />
                            <span className="text-[#FF2D20]">Password.</span>
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="mt-4 text-lg text-neutral-600 leading-relaxed"
                        >
                            Almost done — enter your new password below and get back to your projects.
                        </motion.p>
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
                            Choose a strong password for your account.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="mt-8"
                    >
                        {success ? (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="p-6 rounded-2xl bg-green-50 border border-green-100"
                            >
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                    <ShieldCheck className="w-6 h-6 text-green-600" />
                                </div>
                                <h3 className="text-lg font-bold text-green-800 mb-2">Password Reset Successfully!</h3>
                                <p className="text-sm text-green-700 leading-relaxed">
                                    Your password has been updated. You can now sign in with your new password.
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
                                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        disabled
                                        className="block w-full px-4 py-3 bg-neutral-100 border border-neutral-200 rounded-xl shadow-sm text-neutral-500 sm:text-sm cursor-not-allowed"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-neutral-700 mb-2">New Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="Min. 8 characters"
                                        className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all focus:bg-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Confirm New Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={passwordConfirmation}
                                        onChange={e => setPasswordConfirmation(e.target.value)}
                                        placeholder="Repeat your password"
                                        className="block w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl shadow-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all focus:bg-white"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 transition-all disabled:opacity-50 active:scale-[0.98]"
                                >
                                    {isLoading ? 'Resetting...' : 'Reset Password'}
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
