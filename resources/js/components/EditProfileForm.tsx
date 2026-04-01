import React from 'react';
import { useAuth } from '../context/AuthContext';
import UserProfileForm from './UserProfileForm';
import ArchitectProfileForm from './ArchitectProfileForm';
import ConstructorProfileForm from './ConstructorProfileForm';

interface EditProfileFormProps {
    onCancel: () => void;
}

export default function EditProfileForm({ onCancel }: EditProfileFormProps) {
    const { user } = useAuth();

    if (!user) return null;

    if (user.role_type === 'arsitek') {
        return <ArchitectProfileForm onCancel={onCancel} />;
    }

    if (user.role_type === 'kontraktor') {
        return <ConstructorProfileForm onCancel={onCancel} />;
    }

    // Default to standard user profile handling
    return <UserProfileForm onCancel={onCancel} />;
}
