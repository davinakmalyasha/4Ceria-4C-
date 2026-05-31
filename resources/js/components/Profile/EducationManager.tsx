import React, { useState, useMemo } from 'react';
import { Plus, Trash2, GraduationCap, X, Check, Pencil } from 'lucide-react';

interface EducationItem {
    school: string;
    degree: string;
    year: string;
}

interface Props {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

export const EducationManager: React.FC<Props> = ({ value, onChange }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [school, setSchool] = useState('');
    const [degree, setDegree] = useState('');
    const [year, setYear] = useState('');

    // Editing states
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editSchool, setEditSchool] = useState('');
    const [editDegree, setEditDegree] = useState('');
    const [editYear, setEditYear] = useState('');

    const items = useMemo<EducationItem[]>(() => {
        if (!value) return [];
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            if (value.trim()) {
                return [{ school: value, degree: '', year: '' }];
            }
        }
        return [];
    }, [value]);

    const updateParent = (newItems: EducationItem[]) => {
        const jsonStr = JSON.stringify(newItems);
        onChange({
            target: { name: 'pendidikan', value: jsonStr }
        } as React.ChangeEvent<HTMLTextAreaElement>);
    };

    const handleAdd = () => {
        if (!school.trim()) return;
        const newItem: EducationItem = { school: school.trim(), degree: degree.trim(), year: year.trim() };
        updateParent([...items, newItem]);
        setSchool(''); setDegree(''); setYear('');
        setIsAdding(false);
    };

    const handleRemove = (idx: number) => {
        const filtered = items.filter((_, i) => i !== idx);
        updateParent(filtered);
    };

    const handleStartEdit = (idx: number, item: EducationItem) => {
        setEditingIndex(idx);
        setEditSchool(item.school);
        setEditDegree(item.degree);
        setEditYear(item.year);
        setIsAdding(false);
    };

    const handleSaveEdit = (idx: number) => {
        if (!editSchool.trim()) return;
        const updatedItems = [...items];
        updatedItems[idx] = {
            school: editSchool.trim(),
            degree: editDegree.trim(),
            year: editYear.trim()
        };
        updateParent(updatedItems);
        setEditingIndex(null);
        setEditSchool(''); setEditDegree(''); setEditYear('');
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-gray-500 uppercase">Education & Certifications</label>
                {!isAdding && editingIndex === null && (
                    <button type="button" onClick={() => setIsAdding(true)} className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-800 transition-colors">
                        <Plus size={14} /> Add Education
                    </button>
                )}
            </div>

            {isAdding && (
                <div className="bg-white border border-gray-200 p-4 rounded-xl space-y-3 shadow-xs">
                    <input type="text" placeholder="University / Institution" value={school} onChange={e => setSchool(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:border-red-500 outline-none" required />
                    <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Degree / Certification" value={degree} onChange={e => setDegree(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:border-red-500 outline-none" />
                        <input type="text" placeholder="Graduation Year" value={year} onChange={e => setYear(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:border-red-500 outline-none" />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 flex items-center gap-1"><X size={12} /> Cancel</button>
                        <button type="button" onClick={handleAdd} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 flex items-center gap-1"><Check size={12} /> Save</button>
                    </div>
                </div>
            )}

            {items.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs bg-white border border-dashed border-gray-200 rounded-xl">
                    No education credentials added yet.
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((item, idx) => (
                        <div key={idx} className="p-3.5 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-gray-300 transition-all">
                            {editingIndex === idx ? (
                                <div className="space-y-3">
                                    <input 
                                        type="text" 
                                        placeholder="University / Institution" 
                                        value={editSchool} 
                                        onChange={e => setEditSchool(e.target.value)} 
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:border-red-500 outline-none" 
                                        required 
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="Degree / Certification" 
                                            value={editDegree} 
                                            onChange={e => setEditDegree(e.target.value)} 
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:border-red-500 outline-none" 
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="Graduation Year" 
                                            value={editYear} 
                                            onChange={e => setEditYear(e.target.value)} 
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:border-red-500 outline-none" 
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2 pt-1">
                                        <button 
                                            type="button" 
                                            onClick={() => setEditingIndex(null)} 
                                            className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 flex items-center gap-1"
                                        >
                                            <X size={12} /> Cancel
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => handleSaveEdit(idx)} 
                                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 flex items-center gap-1"
                                        >
                                            <Check size={12} /> Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between group">
                                    <div className="flex items-start gap-2.5 min-w-0">
                                        <div className="p-1.5 bg-red-50 text-red-600 rounded-lg mt-0.5"><GraduationCap size={14} /></div>
                                        <div className="min-w-0">
                                            <h6 className="text-xs font-black text-gray-900 leading-tight truncate">{item.school}</h6>
                                            <p className="text-[10px] text-gray-500 font-bold mt-0.5 leading-none">{item.degree || 'Degree'}{item.year ? ` • ${item.year}` : ''}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            type="button" 
                                            onClick={() => handleStartEdit(idx, item)} 
                                            className="text-gray-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-gray-50 transition-all"
                                            title="Edit education entry"
                                        >
                                            <Pencil size={13} />
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => handleRemove(idx)} 
                                            className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                                            title="Delete entry"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
