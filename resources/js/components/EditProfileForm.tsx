import React from 'react';
import { useAuth } from '../context/AuthContext';
import UserProfileForm from './UserProfileForm';
import ArchitectProfileForm from './ArchitectProfileForm';
import ConstructorProfileForm from './ConstructorProfileForm';
import SupplierProfileForm from './SupplierProfileForm';
import InteriorProfileForm from './InteriorProfileForm';
import NotarisProfileForm from './Notaris/NotarisProfileForm';
import EnterpriseProfileForm from './Profile/EnterpriseProfileForm';

interface EditProfileFormProps {
    onCancel: () => void;
}

export default function EditProfileForm({ onCancel }: EditProfileFormProps) {
    const { user, refreshUser } = useAuth();
    
    const handleSuccess = async () => {
        if (refreshUser) await refreshUser();
        onCancel(); // Return to view mode
    };

    if (!user) return null;

    if (user.role_type === 'arsitek') {
        return <ArchitectProfileForm onCancel={onCancel} />;
    }

    if (user.role_type === 'kontraktor') {
        return <ConstructorProfileForm onCancel={onCancel} />;
    }

    if (user.role_type === 'interior') {
        return <InteriorProfileForm onCancel={onCancel} />;
    }

    if (user.role_type === 'notaris') {
        return <NotarisProfileForm onCancel={onCancel} />;
    }

    if (['project_manager', 'structural', 'mep', 'civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'].includes(user.role_type)) {
        return <EnterpriseProfileForm onCancel={onCancel} />;
    }

    if (user.role_type === 'supplier') {
        return <SupplierProfileForm onCancel={onCancel} onSuccess={handleSuccess} />;
    }

    // Default to standard user profile handling
    return <UserProfileForm onCancel={onCancel} />;
}
