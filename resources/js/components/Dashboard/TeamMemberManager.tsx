import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, X, Upload, Trash2, Users, Briefcase, Edit3, Check } from 'lucide-react';
import { TeamMember } from '../../types/sub_professional.types';
import { useToast } from '../../context/ToastContext';

interface TeamMemberManagerProps {
    isEmbedded?: boolean;
}

export const TeamMemberManager: React.FC<TeamMemberManagerProps> = ({ isEmbedded = false }) => {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { addToast } = useToast();
    const [formData, setFormData] = useState({
        name: '', role_title: '', bio: '', phone: '', email: '', skills: '' as string, photo: null as File | null,
    });

    const fetchMembers = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await axios.get<{ data: TeamMember[] }>('/team-members');
            // Ensure we always have an array
            const data = res.data?.data;
            if (Array.isArray(data)) {
                setMembers(data);
            } else {
                console.warn('Expected array from team-members API, got:', data);
                setMembers([]);
            }
        } catch (err) {
            console.error('Failed to fetch team members', err);
            setMembers([]); // Fallback to empty array on error
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchMembers(); }, [fetchMembers]);

    const resetForm = () => {
        setFormData({ name: '', role_title: '', bio: '', phone: '', email: '', skills: '', photo: null });
        setIsAdding(false);
        setEditingId(null);
    };

    const handleSubmit = async () => {
        if (!formData.name.trim() || !formData.role_title.trim()) return;
        setIsLoading(true);
        try {
            const data = new FormData();
            data.append('name', formData.name);
            data.append('role_title', formData.role_title);
            if (formData.bio) data.append('bio', formData.bio);
            if (formData.phone) data.append('phone', formData.phone);
            if (formData.email) data.append('email', formData.email);
            const skillsArr = formData.skills.split(',').map(s => s.trim()).filter(Boolean);
            skillsArr.forEach((s, i) => data.append(`skills[${i}]`, s));
            if (formData.photo) data.append('photo', formData.photo);

            if (editingId) {
                await axios.post(`/team-members/${editingId}`, data, {
                    headers: { 'Content-Type': 'multipart/form-data', 'X-HTTP-Method-Override': 'PUT' }
                });
                addToast('success', 'Team member updated successfully');
            } else {
                await axios.post('/team-members', data, { headers: { 'Content-Type': 'multipart/form-data' } });
                addToast('success', 'Team member added successfully');
            }
            resetForm();
            fetchMembers();
        } catch (err: any) {
            console.error('Failed to save team member', err);
            addToast('error', err.response?.data?.message || 'Failed to save team member');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdit = (member: TeamMember) => {
        setFormData({
            name: member.name,
            role_title: member.role_title,
            bio: member.bio || '',
            phone: member.phone || '',
            email: member.email || '',
            skills: (member.skills || []).join(', '),
            photo: null,
        });
        setEditingId(member.id);
        setIsAdding(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Remove this team member?')) return;
        try {
            await axios.delete(`/team-members/${id}`);
            addToast('success', 'Team member removed');
            fetchMembers();
        } catch (err: any) {
            console.error(err);
            addToast('error', 'Failed to remove team member');
        }
    };

    return (
        <div className={isEmbedded ? "mt-8 pt-8 border-t border-gray-100" : "bg-white p-8 rounded-2xl shadow-sm border border-gray-200 mt-6 max-w-3xl"}>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Users size={20} className="text-blue-600" />
                    <h4 className={`font-bold text-gray-900 ${isEmbedded ? 'text-lg' : 'text-xl'}`}>Team Members</h4>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{members.length}</span>
                </div>
                {!isAdding && (
                    <button 
                        onClick={() => {
                            console.log('Add Member clicked');
                            setIsAdding(true);
                        }} 
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition flex items-center gap-2"
                    >
                        <Plus size={16} /> Add Member
                    </button>
                )}
            </div>

            {isAdding && <TeamMemberForm formData={formData} setFormData={setFormData} onSubmit={handleSubmit} onCancel={resetForm} isLoading={isLoading} isEditing={!!editingId} />}

            {isLoading && !isAdding ? (
                <div className="text-center py-8 text-gray-400">Loading...</div>
            ) : members.length === 0 && !isAdding ? (
                <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <Users size={32} className="mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No team members yet.</p>
                    <p className="text-xs mt-1">Add your structural engineers, MEP specialists, and team members here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {members.map(m => (
                        <TeamMemberCard key={m.id} member={m} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
                </div>
            )}
        </div>
    );
};

/* ─── Sub-components ─── */

interface TeamMemberFormProps {
    formData: { name: string; role_title: string; bio: string; phone: string; email: string; skills: string; photo: File | null };
    setFormData: React.Dispatch<React.SetStateAction<typeof formData & { photo: File | null }>>;
    onSubmit: () => void;
    onCancel: () => void;
    isLoading: boolean;
    isEditing: boolean;
}

const TeamMemberForm: React.FC<TeamMemberFormProps> = ({ formData, setFormData, onSubmit, onCancel, isLoading, isEditing }) => (
    <div className="bg-gray-50 p-6 rounded-2xl mb-6 border border-gray-100 space-y-4">
        <div className="flex justify-between items-center">
            <h5 className="font-bold text-gray-900">{isEditing ? 'Edit Member' : 'New Team Member'}</h5>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" placeholder="e.g. Budi Santoso" />
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role / Title *</label>
                <input type="text" value={formData.role_title} onChange={e => setFormData(p => ({ ...p, role_title: e.target.value }))} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" placeholder="e.g. Structural Lead" />
            </div>
        </div>
        <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bio / Description</label>
            <textarea value={formData.bio} onChange={e => setFormData(p => ({ ...p, bio: e.target.value }))} rows={2} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 resize-none outline-none" placeholder="Brief description of their expertise..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Skills (comma-separated)</label>
                <input type="text" value={formData.skills} onChange={e => setFormData(p => ({ ...p, skills: e.target.value }))} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="AutoCAD, SAP2000, Revit" />
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Profile Photo</label>
                <div className="relative">
                    <input type="file" accept="image/*" onChange={e => setFormData(p => ({ ...p, photo: e.target.files?.[0] || null }))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
                        <span className="text-gray-500 truncate">{formData.photo ? formData.photo.name : 'Choose photo...'}</span>
                        <Upload size={16} className="text-gray-400" />
                    </div>
                </div>
            </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                <input type="tel" value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="08123456789" />
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                <input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" placeholder="budi@firm.com" />
            </div>
        </div>
        <div className="flex justify-end pt-2">
            <button disabled={isLoading || !formData.name.trim() || !formData.role_title.trim()} type="button" onClick={onSubmit} className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-black transition-all disabled:opacity-50 flex items-center gap-2">
                {isLoading ? 'Saving...' : isEditing ? 'Update Member' : 'Add Member'}
            </button>
        </div>
    </div>
);

const TeamMemberCard: React.FC<{ member: TeamMember; onEdit: (m: TeamMember) => void; onDelete: (id: number) => void }> = ({ member, onEdit, onDelete }) => {
    const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="border border-gray-100 rounded-2xl p-4 shadow-sm group hover:border-blue-200 transition-all">
            <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-blue-50 flex items-center justify-center">
                    {member.photo_url ? (
                        <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-sm font-black text-blue-600">{initials}</span>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-gray-900 text-sm truncate">{member.name}</h5>
                    <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">{member.role_title}</p>
                    {member.bio && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{member.bio}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onEdit(member)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit3 size={14} />
                    </button>
                    <button onClick={() => onDelete(member.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            {member.skills && member.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {member.skills.slice(0, 4).map((skill, i) => (
                        <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-md uppercase tracking-wider">{skill}</span>
                    ))}
                    {member.skills.length > 4 && (
                        <span className="px-2 py-0.5 bg-gray-50 text-gray-400 text-[10px] font-bold rounded-md">+{member.skills.length - 4}</span>
                    )}
                </div>
            )}
        </div>
    );
};
