export interface ChatUser {
    id: number;
    name: string;
    username: string;
    role_type: string;
    pic?: string | null;
}

export interface ChatMessage {
    id: number;
    conversation_id: number;
    sender_id: number;
    content: string;
    image?: string | null;
    image_url?: string | null;
    is_read: boolean;
    created_at: string;
    sender?: ChatUser;
}

export interface Conversation {
    id: number;
    other_user: ChatUser;
    last_message: ChatMessage | null;
    unread_count: number;
    last_message_at: string | null;
}
