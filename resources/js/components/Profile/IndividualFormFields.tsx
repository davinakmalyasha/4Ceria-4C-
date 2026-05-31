import React from 'react';

interface IndividualFormFieldsProps {
    formData: Record<string, string>;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const IndividualFormFields: React.FC<IndividualFormFieldsProps> = ({ formData, onChange }) => {
    return (
        <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-4">
            <h3 className="font-bold text-gray-800 border-b pb-2 text-sm">Individual Identity</h3>
            <div className="grid grid-cols-1 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">National ID (KTP) / Professional License Number</label>
                    <input 
                        type="text" 
                        name="identity_number" 
                        value={formData.identity_number} 
                        onChange={onChange} 
                        required 
                        placeholder="e.g. 3271021405900004 or SKA No: 1.2.302.2..." 
                        className="w-full px-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none font-medium max-w-md" 
                    />
                </div>
            </div>
        </div>
    );
};
