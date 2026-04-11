import React from 'react';
import { useAuth } from '../context/AuthContext';
import UserProfileForm from './UserProfileForm';
import ArchitectProfileForm from './ArchitectProfileForm';
import ConstructorProfileForm from './ConstructorProfileForm';
import SupplierProfileForm from './SupplierProfileForm';

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

    if (user.role_type === 'supplier') {
        return <SupplierProfileForm onCancel={onCancel} onSuccess={handleSuccess} />;
    }

    // Default to standard user profile handling
    return <UserProfileForm onCancel={onCancel} />;
}
