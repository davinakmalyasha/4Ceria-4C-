import React from 'react';

interface CompanyFormFieldsProps {
    formData: Record<string, string>;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const CompanyFormFields: React.FC<CompanyFormFieldsProps> = ({ formData, onChange }) => {
    return (
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-4">
            <h3 className="font-bold text-gray-800 border-b pb-2 text-sm">Company Details</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Company Name</label>
                    <input 
                        type="text" 
                        name="company_name" 
                        value={formData.company_name} 
                        onChange={onChange} 
                        required 
                        placeholder="e.g. PT. Pembangunan Ceria" 
                        className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Company License / NIB</label>
                    <input 
                        type="text" 
                        name="company_license" 
                        value={formData.company_license} 
                        onChange={onChange} 
                        required 
                        placeholder="e.g. 9120002148202" 
                        className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">NPWP Number</label>
                    <input 
                        type="text" 
                        name="npwp_number" 
                        value={formData.npwp_number} 
                        onChange={onChange} 
                        required 
                        placeholder="e.g. 01.234.567.8-901.000" 
                        className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">SIUP Number</label>
                    <input 
                        type="text" 
                        name="siup_number" 
                        value={formData.siup_number} 
                        onChange={onChange} 
                        required 
                        placeholder="e.g. 503/123-SIUP/DPMPTSP/2026" 
                        className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium" 
                    />
                </div>
            </div>
        </div>
    );
};
