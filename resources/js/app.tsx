import '../css/app.css';
import '../css/index.css';
import './bootstrap';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ProfessionalRegister from './pages/ProfessionalRegister';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminVerification from './pages/admin/AdminVerification';
import AdminHouses from './pages/admin/AdminHouses';
import AdminProjects from './pages/admin/AdminProjects';
import PublicBrief from './pages/PublicBrief';
import Docs from './pages/Docs';

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user || (user.role_type !== 'admin')) return <Navigate to="/" replace />;
    return <>{children}</>;
};

function App() {
    return (
        <AuthProvider>
            <ToastProvider>
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
                    <Route path="/admin/houses" element={<AdminRoute><AdminHouses /></AdminRoute>} />
                    <Route path="/admin/projects" element={<AdminRoute><AdminProjects /></AdminRoute>} />

                    {/* Public Brief (no auth) */}
                    <Route path="/brief/:token" element={<PublicBrief />} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </ToastProvider>
        </AuthProvider>
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
