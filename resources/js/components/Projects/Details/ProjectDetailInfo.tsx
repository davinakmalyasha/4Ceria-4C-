import React from 'react';
import { MapPin } from 'lucide-react';
import ProjectLocationMap from '../ProjectLocationMap';

interface Props {
    detail: any;
    formatCurrency: (amount: number) => string;
    setLightboxImg: (url: string) => void;
}

export const ProjectDetailInfo: React.FC<Props> = ({ detail, formatCurrency, setLightboxImg }) => {
    return (
        <div className="space-y-8">
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span> Description
                </h4>
                <p className="text-gray-600 text-[14px] leading-relaxed whitespace-pre-wrap">{detail.description}</p>
            </div>

            {/* Location */}
            {(detail.latitude && detail.longitude) && (
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span> Project Site
                    </h4>
                    <ProjectLocationMap 
                        latitude={detail.latitude} 
                        longitude={detail.longitude} 
                        title={detail.title} 
                    />
                </div>
            )}

            {/* Photos */}
            {detail.images && detail.images.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span> Gallery
                        <span className="text-gray-400 font-bold ml-1">({detail.images.length})</span>
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                        {detail.images.map((img: any) => (
                            <div 
                                key={img.id} 
                                className="aspect-square rounded-2xl overflow-hidden border border-gray-100 cursor-pointer hover:border-red-600 transition-all group relative shadow-sm"
                                onClick={() => setLightboxImg(img.url)}
                            >
                                <img src={img.url} alt="Project" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Financial Overview */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 bg-red-50 px-6 py-5 rounded-2xl border border-red-100/50 shadow-sm shadow-red-50/50">
                    <p className="text-[10px] text-red-600/60 font-black uppercase tracking-[0.2em] mb-1">Financial Budget</p>
                    <p className="text-2xl font-black text-red-600 tracking-tight">{formatCurrency(detail.budget)}</p>
                </div>
                <div className="flex-1 bg-zinc-900 px-6 py-5 rounded-2xl border border-zinc-800 shadow-xl shadow-zinc-100">
                    <p className="text-[10px] text-zinc-400 font-black uppercase tracking-[0.2em] mb-1">Target Timeline</p>
                    <p className="text-xl font-black text-white tracking-tight">
                        {detail.deadline ? new Date(detail.deadline).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }) : 'ASAP'}
                    </p>
                </div>
            </div>
        </div>
    );
};
