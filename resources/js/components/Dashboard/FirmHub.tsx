import React from 'react';
import { useAuth } from '../../context/AuthContext';
import FirmSquadProfile from './FirmSquadProfile';

interface FirmHubProps {
    onOpenChat: (user: { id: number }) => void;
}

export default function FirmHub({ onOpenChat }: FirmHubProps) {
    const { user } = useAuth();

    if (!user) return null;

    return (
        <FirmSquadProfile 
            ownerId={user.id} 
            isGuestMode={false} 
            onOpenChat={onOpenChat} 
        />
    );
}
