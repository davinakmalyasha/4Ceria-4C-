import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Briefcase, Building2, HardHat, CheckCircle2, Shield, Armchair, Zap, Wrench, Store, Truck } from 'lucide-react';

export default function ProfessionalRegister() {
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        email: '',
        role_type: 'arsitek', // Default to arsitek, skip 'user'
        password: '',
        password_confirmation: ''
    });
    const [subcontractorRole, setSubcontractorRole] = useState<'civil' | 'mechanical' | 'electrical' | 'plumbing' | 'roofing' | 'finishing'>('civil');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login, logout, user, isLoading: isAuthLoading } = useAuth();
    const navigate = useNavigate();

    const isSubcontractorRole = ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'].includes(formData.role_type);

    if (!isAuthLoading && user) {
        if (['arsitek','kontraktor','notaris','interior','structural','mep','project_manager','supplier','logistics','civil','mechanical','electrical','plumbing','roofing','finishing'].includes(user.role_type)) {
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

    const handleRoleSelect = (role: string) => {
        if (role === 'subcontractor') {
            setFormData({ ...formData, role_type: subcontractorRole });
        } else {
            setFormData({ ...formData, role_type: role });
        }
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
                        <div className="mt-3 flex flex-col gap-2 text-sm">
                            <Link to="/login" className="font-semibold text-[#FF2D20] hover:text-red-700 transition flex items-center gap-1.5">
                                <span>← Back to Login</span>
                            </Link>
                            <Link to="/register" className="text-neutral-500 hover:text-neutral-800 transition">
                                Looking to buy or hire instead? <span className="font-bold text-[#FF2D20] hover:underline">Create a user account →</span>
                            </Link>
                        </div>
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
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {[
                                    { id: 'arsitek', label: 'Architect', desc: 'Design homes & submit plans', icon: Building2 },
                                    { id: 'kontraktor', label: 'Constructor', desc: 'Quote & execute physical builds', icon: HardHat },
                                    { id: 'notaris', label: 'Notaris', desc: 'Land certificates & permits', icon: Shield },
                                    { id: 'interior', label: 'Interior Designer', desc: 'Furniture & space layouts', icon: Armchair },
                                    { id: 'structural', label: 'Structural Engineer', desc: 'Foundation & steel calcs', icon: Wrench },
                                    { id: 'mep', label: 'MEP Engineer', desc: 'Mechanical, electrical & plumbing', icon: Zap },
                                    { id: 'project_manager', label: 'Project Manager', desc: 'Coordinate and manage execution', icon: Briefcase },
                                    { id: 'supplier', label: 'Material Supplier', desc: 'Supply materials to marketplace', icon: Store },
                                    { id: 'logistics', label: 'Logistics / Courier', desc: 'Fulfill deliveries & cargo shipping', icon: Truck },
                                    { id: 'subcontractor', label: 'Specialty Subcontractor', desc: 'Concrete, wiring, piping & trades', icon: HardHat },
                                ].map(role => {
                                    const Icon = role.icon;
                                    const isSelected = role.id === 'subcontractor'
                                        ? isSubcontractorRole
                                        : formData.role_type === role.id;
                                    return (
                                        <label
                                            key={role.id}
                                            className={`relative cursor-pointer rounded-xl border-2 p-2 flex items-center gap-2.5 transition-all ${
                                                isSelected ? 'border-[#FF2D20] bg-red-50/50 shadow-sm font-medium' : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                                            }`}
                                        >
                                            <div className={`p-1.5 rounded-full shrink-0 ${isSelected ? 'bg-[#FF2D20] text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="text-left min-w-0 flex-1">
                                                <div className={`font-bold text-xs truncate ${isSelected ? 'text-[#FF2D20]' : 'text-neutral-700'}`}>{role.label}</div>
                                                <div className="text-[9px] text-neutral-400 truncate leading-none mt-0.5" title={role.desc}>{role.desc}</div>
                                            </div>
                                            <input type="radio" name="role_type" value={role.id} checked={isSelected} onChange={() => handleRoleSelect(role.id)} className="sr-only" />
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Special Subcontractor Selector dropdown */}
                        {isSubcontractorRole && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-xl border-2 border-[#FF2D20]/30 bg-red-50/30"
                            >
                                <label className="block text-xs font-black text-neutral-500 uppercase tracking-wider mb-2">
                                    Select Your Specialized Trade Option
                                </label>
                                <select
                                    value={formData.role_type}
                                    onChange={(e) => {
                                        const val = e.target.value as any;
                                        setSubcontractorRole(val);
                                        setFormData({ ...formData, role_type: val });
                                    }}
                                    className="block w-full px-4 py-3 bg-white border border-neutral-200 rounded-xl focus:ring-[#FF2D20]/20 focus:border-[#FF2D20] sm:text-sm transition-all shadow-sm font-semibold text-neutral-700 cursor-pointer"
                                >
                                    <option value="civil">Civil & Concrete Specialist</option>
                                    <option value="mechanical">Mechanical Specialist (HVAC, Elevators, Fire)</option>
                                    <option value="electrical">Electrical Specialist (Wiring, Panels)</option>
                                    <option value="plumbing">Plumbing Specialist (Water supply, Drainage)</option>
                                    <option value="roofing">Roofing & Waterproofing Specialist</option>
                                    <option value="finishing">Finishing Specialist (Tiling, Painting, Facade)</option>
                                </select>
                            </motion.div>
                        )}

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


                </div>
            </div>
        </div>
    );
}
