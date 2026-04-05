import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Box } from 'lucide-react';

interface TrackingTimelineProps {
    order: any;
}

const TrackingTimeline: React.FC<TrackingTimelineProps> = ({ order }) => {
    let stages: any[] = [];
    let currentStepNum = 1;

    if (order.delivery_method === 'Customer Pickup') {
        stages = [
            { key: 'pending', label: 'Ordered', time: order.created_at },
            { key: 'ready_for_pickup', label: 'Ready', time: order.ready_for_pickup_at },
            { key: 'delivered', label: 'Picked Up', time: order.delivered_at }
        ];
        if (order.ready_for_pickup_at || order.status === 'ready_for_pickup') currentStepNum = 2;
        if (order.delivered_at || order.status === 'delivered' || order.status === 'completed') currentStepNum = 3;
    } else {
        const job = order.delivery_job;
        stages = [
            { key: 'pending', label: 'Ordered', time: order.created_at },
            { key: 'packed', label: 'Packed', time: order.ready_for_pickup_at },
            { key: 'shipping', label: 'Shipping', time: order.shipped_at || (job && job.status !== 'pending' ? job.updated_at : null) },
            { key: 'delivered', label: 'Arrived', time: order.delivered_at || (job && job.status === 'delivered' ? job.updated_at : null) }
        ];
        
        if (order.ready_for_pickup_at || order.status === 'ready_for_pickup' || (job && job.status === 'accepted')) currentStepNum = 2;
        if (order.shipped_at || order.status === 'shipping' || (job && job.status === 'picked_up')) currentStepNum = 3;
        if (order.delivered_at || order.status === 'delivered' || order.status === 'completed' || (job && job.status === 'delivered')) currentStepNum = 4;
    }

    return (
        <div className="relative pt-12 pb-8 px-4">
            <div className="absolute top-[6.3rem] left-8 right-8 h-1 bg-gray-50 -translate-y-1/2 rounded-full overflow-hidden">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentStepNum - 1) / (stages.length - 1)) * 100}%` }}
                    className="h-full bg-[#FF2D20] transition-all duration-1000"
                />
            </div>
            
            <div className="relative flex justify-between">
                {stages.map((stage, idx) => {
                    const isCompleted = idx + 1 <= currentStepNum;
                    const isCurrent = idx + 1 === currentStepNum;
                    
                    return (
                        <div key={stage.key} className="flex flex-col items-center flex-1 relative">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-4 bg-white z-10 transition-all duration-1000 ${
                                isCompleted ? 'border-[#FF2D20] text-[#FF2D20] scale-110 shadow-lg shadow-red-500/10' : 'border-gray-100 text-gray-300'
                            }`}>
                                {isCompleted && !isCurrent ? <CheckCircle2 size={18} /> : <Box size={18} />}
                            </div>
                            <div className="mt-4 text-center">
                                <span className={`block text-[10px] font-black uppercase tracking-widest ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                                    {stage.label}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TrackingTimeline;
