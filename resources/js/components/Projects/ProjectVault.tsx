import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Project, ProjectDocument } from '../../types/project.types';
import { useAuth } from '../../context/AuthContext';
import { UploadCloud, File, Trash2, Download, ExternalLink } from 'lucide-react';
import { useToast } from '../../context/ToastContext';


interface Props {
    project: Project;
}

export default function ProjectVault({ project }: Props) {
    const { user } = useAuth();
    const [documents, setDocuments] = useState<ProjectDocument[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const { showToast } = useToast();


    useEffect(() => {
        const fetchDocs = async () => {
            try {
                const res = await axios.get(`/projects/${project.id}/documents`);
                setDocuments(res.data.data);
            } catch (err) {
                console.error("Failed to fetch documents");
            }
        };
        fetchDocs();
    }, [project.id]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await axios.post(`/projects/${project.id}/documents`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast('Document uploaded successfully', 'success');
            setDocuments([res.data.data, ...documents]);
        } catch (err) {
            console.error('Upload failed', err);
            showToast('Upload failed. Ensure file is pdf, doc, docx, jpg, or png under 10MB.', 'error');
        } finally {

            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (docId: number) => {
        if (!confirm('Delete this document?')) return;
        try {
            await axios.delete(`/projects/${project.id}/documents/${docId}`);
            setDocuments(prev => prev.filter(d => d.id !== docId));
            showToast('Document removed', 'success');
        } catch (err) {
            console.error('Delete failed', err);
            showToast('Failed to delete document', 'error');
        }
    };


    return (
        <div className="space-y-6">
            <div className="bg-red-50/50 border border-red-100 rounded-2xl p-6 text-center">
                <UploadCloud className="w-10 h-10 text-red-500 mx-auto mb-3" />
                <h4 className="text-lg font-bold text-gray-900 mb-1">Contract & Blueprint Vault</h4>
                <p className="text-sm text-gray-500 mb-5 max-w-sm mx-auto">Upload heavy files like PDFs or Doc files here. Maximum 10MB per file.</p>
                
                <label className={`inline-flex items-center justify-center gap-2 bg-white border-2 border-dashed border-red-200 text-red-600 font-bold py-3 px-6 rounded-xl cursor-pointer hover:border-red-400 hover:bg-red-50 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    {isUploading ? 'Uploading securely...' : 'Browse Computer'}
                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" onChange={handleUpload} disabled={isUploading} />
                </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {documents.length === 0 ? (
                    <div className="col-span-1 sm:col-span-2 text-center text-gray-400 py-6 text-sm">
                        Vault is empty.
                    </div>
                ) : (
                    documents.map(doc => {
                        const isOwner = user?.id === doc.uploader?.id || user?.id === project.owner_id;
                        
                        return (
                            <div key={doc.id} className="group relative bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4 hover:border-red-200 hover:shadow-sm transition-all">
                                <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100 text-[#FF2D20]">
                                    <File className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h5 className="text-sm font-bold text-gray-900 truncate pr-8">{doc.file_name}</h5>
                                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-0.5">
                                        {doc.file_type} &bull; uploaded by {doc.uploader?.name?.split(' ')[0]}
                                    </p>
                                    
                                    <div className="flex gap-3 mt-3">
                                        <a href={`/storage/${doc.file_path}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-gray-600 hover:text-[#FF2D20] flex items-center gap-1 transition-colors">
                                            <ExternalLink className="w-3.5 h-3.5" /> View
                                        </a>
                                        <a href={`/storage/${doc.file_path}`} download={doc.file_name} className="text-xs font-bold text-gray-600 hover:text-[#FF2D20] flex items-center gap-1 transition-colors">
                                            <Download className="w-3.5 h-3.5" /> Download
                                        </a>
                                    </div>
                                </div>

                                {isOwner && (
                                    <button 
                                        onClick={() => handleDelete(doc.id)} 
                                        className="absolute top-2 right-2 p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
