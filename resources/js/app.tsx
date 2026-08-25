import '../css/app.css';
import '../css/index.css';
import './bootstrap';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/Common/ErrorBoundary';

const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const ProfessionalRegister = React.lazy(() => import('./pages/ProfessionalRegister'));
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard'));
const AdminVerification = React.lazy(() => import('./pages/admin/AdminVerification'));
const AdminHouses = React.lazy(() => import('./pages/admin/AdminHouses'));
const AdminProjects = React.lazy(() => import('./pages/admin/AdminProjects'));
const PublicBrief = React.lazy(() => import('./pages/PublicBrief'));
const Docs = React.lazy(() => import('./pages/Docs'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));

const PageLoader = () => (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-red-500/20 border-t-red-600 rounded-full animate-spin" />
        <p className="mt-4 text-[10px] font-black uppercase text-gray-400 tracking-widest animate-pulse">Loading Page...</p>
    </div>
);

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isLoading } = useAuth();
    if (isLoading) return <PageLoader />;
    if (!user || (user.role_type !== 'admin')) return <Navigate to="/" replace />;
    return <>{children}</>;
};

function App() {
    return (
        <ErrorBoundary name="AppRoot">
            <AuthProvider>
                <ToastProvider>
                    <React.Suspense fallback={<PageLoader />}>
                        <Routes>
                            <Route path="/" element={<LandingPage />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/register" element={<Register />} />
                            <Route path="/pro/login" element={<Navigate to="/login" replace />} />
                            <Route path="/pro/register" element={<ProfessionalRegister />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/help" element={<Docs />} />

                            {/* Admin Routes */}
                            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                            <Route path="/admin/verification" element={<AdminRoute><AdminVerification /></AdminRoute>} />
                            <Route path="/admin/verification/logs" element={<AdminRoute><AdminVerification /></AdminRoute>} />
                            <Route path="/admin/houses" element={<AdminRoute><AdminHouses /></AdminRoute>} />
                            <Route path="/admin/projects" element={<AdminRoute><AdminProjects /></AdminRoute>} />

                            {/* Public Brief (no auth) */}
                            <Route path="/brief/:token" element={<PublicBrief />} />

                            {/* Password Reset */}
                            <Route path="/forgot-password" element={<ForgotPassword />} />
                            <Route path="/reset-password/:token" element={<ResetPassword />} />

                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </React.Suspense>
                </ToastProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </React.StrictMode>
    );
}
