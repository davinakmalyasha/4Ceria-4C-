import './bootstrap';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ProfessionalLogin from './pages/ProfessionalLogin';
import ProfessionalRegister from './pages/ProfessionalRegister';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminVerification from './pages/admin/AdminVerification';
import AdminHouses from './pages/admin/AdminHouses';
import AdminProjects from './pages/admin/AdminProjects';

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user || (user.role_type !== 'admin')) return <Navigate to="/" replace />;
    return <>{children}</>;
};

function App() {
    return (
        <AuthProvider>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/pro/login" element={<ProfessionalLogin />} />
                <Route path="/pro/register" element={<ProfessionalRegister />} />
                <Route path="/dashboard" element={<Dashboard />} />
                
                {/* Admin Routes */}
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/verification" element={<AdminRoute><AdminVerification /></AdminRoute>} />
                <Route path="/admin/houses" element={<AdminRoute><AdminHouses /></AdminRoute>} />
                <Route path="/admin/projects" element={<AdminRoute><AdminProjects /></AdminRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
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
