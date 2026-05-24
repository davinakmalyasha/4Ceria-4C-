import { DocArticle } from './clientDocs';

export const merchantCourierDocs: DocArticle[] = [
    {
        id: 'merchant-inventory-setup',
        title: 'Supplier Inventory & Marketplace Setup',
        role: 'merchant',
        summary: 'Learn how to list construction materials and process client orders.',
        sections: [
            {
                type: 'text',
                body: 'Supplier merchants can open digital storefronts to list materials like cement, steel rods, brick, and decor.'
            },
            {
                type: 'list',
                title: 'Marketplace Best Practices:',
                items: [
                    'Always keep stock quantities accurate to prevent cancelled orders.',
                    'Specify dimensions and weight values, as they are used to compute courier shipping costs.',
                    'Provide discount campaigns to clear bulk quantities of slow-moving stock.'
                ]
            }
        ]
    },
    {
        id: 'courier-job-radar',
        title: 'Claiming Deliveries via Courier Job Radar',
        role: 'courier',
        summary: 'How logistics partners claim and manage active material orders.',
        sections: [
            {
                type: 'text',
                body: 'The Courier Job Radar matches independent drivers with active material deliveries. You can test a simulated Job Radar card below:'
            },
            {
                type: 'widget',
                widgetName: 'radar'
            },
            {
                type: 'list',
                title: 'Fulfilling Delivery Jobs:',
                items: [
                    'Review pickup location (Supplier Store) and delivery location (Project Site).',
                    'Inspect the required vehicle type based on the material dimensions.',
                    'Update status in real-time (Picked Up, En Route, Delivered) to release shipping fees.'
                ]
            }
        ]
    },
    {
        id: 'general-disputes-safety',
        title: 'Platform Safety & Dispute Resolution',
        role: 'common',
        summary: 'General guidelines for conflict resolution and secure transactions.',
        sections: [
            {
                type: 'text',
                body: '4Ceria serves as a neutral intermediary. In the rare event of a dispute between a client and a professional, we offer dedicated legal mediation.'
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Never complete transactions outside the platform. Doing so voids all milestone protections and account guarantees.'
            }
        ]
    }
];
