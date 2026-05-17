export interface HireHistory {
    id: number;
    user_id: number;
    name: string;
    role: string;
    project_title: string;
    phone: string | null;
    avatar: string | null;
    hired_at: string;
}
