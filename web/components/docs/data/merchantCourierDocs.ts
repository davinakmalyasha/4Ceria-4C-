import { DocArticle } from './docTypes';

export const merchantCourierDocs: DocArticle[] = [
    {
        id: 'merchant-inventory-setup',
        title: 'Supplier Inventory & Marketplace Setup',
        role: 'merchant',
        summary: 'Learn how to list construction materials and process client orders.',
        sections: [
            {
                type: 'text',
                body: 'Supplier merchants can open digital storefronts to list materials like cement, steel rods, brick, decor items, and custom fittings on the 4Ceria marketplace.'
            },
            {
                type: 'list',
                title: 'Marketplace Best Practices:',
                items: [
                    'Always keep stock quantities accurate to prevent cancelled orders.',
                    'Specify dimensions and weight values — they are used to compute courier shipping costs.',
                    'Provide discount campaigns to clear bulk quantities of slow-moving stock.',
                    'Upload high-quality product photos from multiple angles for better buyer confidence.'
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Materials with complete specifications (weight, dimensions, unit pricing) get higher visibility in search results.'
            }
        ]
    },
    {
        id: 'merchant-store-setup',
        title: 'Setting Up Your Supplier Storefront',
        role: 'merchant',
        summary: 'How to create your store profile and start selling on the marketplace.',
        sections: [
            {
                type: 'text',
                body: 'Your store profile is the first thing buyers see when browsing the marketplace. A complete and professional storefront builds trust and attracts more orders.'
            },
            {
                type: 'step',
                title: 'Store Setup Process:',
                steps: [
                    { stepNumber: 1, title: 'Complete your supplier profile', description: 'Navigate to your dashboard and fill in your store name, business address, contact details, and business description.' },
                    { stepNumber: 2, title: 'Add store branding', description: 'Upload your store logo, banner image, and set your store theme color.' },
                    { stepNumber: 3, title: 'Configure shipping zones', description: 'Define which areas you can ship to and set base shipping rates by distance.' },
                    { stepNumber: 4, title: 'Add your first products', description: 'Go to the Inventory tab and start adding materials with prices, photos, weights, and dimensions.' }
                ]
            },
            {
                type: 'list',
                title: 'Store Dashboard Tabs:',
                items: [
                    'My Store: Your public storefront preview — how buyers see your store.',
                    'Inventory: Manage all your product listings, stock levels, and pricing.',
                    'Orders: View incoming orders, process fulfillment, and track delivery status.'
                ]
            }
        ]
    },
    {
        id: 'merchant-order-management',
        title: 'Processing & Fulfilling Orders',
        role: 'merchant',
        summary: 'How to manage incoming orders, confirm stock, and coordinate with couriers.',
        sections: [
            {
                type: 'text',
                body: 'When a client purchases materials from your store, you receive an order notification. You must confirm stock availability, prepare the items, and coordinate pickup with the assigned courier.'
            },
            {
                type: 'step',
                title: 'Order Fulfillment Flow:',
                steps: [
                    { stepNumber: 1, title: 'Receive order notification', description: 'A new order appears in your Orders tab with the buyer details, items, quantities, and delivery address.' },
                    { stepNumber: 2, title: 'Confirm stock availability', description: 'Verify that all ordered items are in stock. If an item is out of stock, notify the buyer immediately.' },
                    { stepNumber: 3, title: 'Prepare the order', description: 'Pack and label all items for pickup. Ensure weights match the listed specifications.' },
                    { stepNumber: 4, title: 'Courier pickup', description: 'A logistics courier claims the delivery job and arrives at your store for pickup. Hand over the prepared items.' },
                    { stepNumber: 5, title: 'Track delivery & get paid', description: 'Track the delivery status in real-time. Payment is released from escrow once the buyer confirms receipt.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Always confirm stock before accepting an order. Repeated cancellations due to stock issues may affect your store rating and visibility.'
            }
        ]
    },
    {
        id: 'courier-job-radar',
        title: 'Claiming Deliveries via Courier Job Radar',
        role: 'courier',
        summary: 'How logistics partners claim and manage active material delivery jobs.',
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
                type: 'step',
                title: 'Claiming a Delivery Job:',
                steps: [
                    { stepNumber: 1, title: 'Open the Job Radar', description: 'Navigate to the Job Radar tab in your dashboard sidebar to see available delivery jobs.' },
                    { stepNumber: 2, title: 'Review job details', description: 'Each job shows the pickup location (supplier store), delivery location (project site), material type, weight, and estimated distance.' },
                    { stepNumber: 3, title: 'Check vehicle requirements', description: 'Ensure your vehicle matches the required type based on the material dimensions and weight.' },
                    { stepNumber: 4, title: 'Claim the job', description: 'Click "Claim Job" to accept the delivery. The supplier and buyer are both notified.' }
                ]
            }
        ]
    },
    {
        id: 'courier-delivery-tracking',
        title: 'Real-Time Delivery Status Updates',
        role: 'courier',
        summary: 'How to update delivery status as you pick up and deliver materials.',
        sections: [
            {
                type: 'text',
                body: 'Once you claim a delivery job, you must update the status in real-time so the buyer and supplier can track progress. Accurate status updates build your reliability rating.'
            },
            {
                type: 'step',
                title: 'Delivery Status Updates:',
                steps: [
                    { stepNumber: 1, title: 'Mark as "Picked Up"', description: 'After collecting materials from the supplier store, update the status to "Picked Up" with a photo of the loaded items.' },
                    { stepNumber: 2, title: 'Update to "En Route"', description: 'When you depart from the supplier location, mark the delivery as "En Route" to the project site.' },
                    { stepNumber: 3, title: 'Confirm "Delivered"', description: 'Upon arrival at the delivery address, hand over the materials and update status to "Delivered" with proof photos.' },
                    { stepNumber: 4, title: 'Buyer confirmation', description: 'The buyer confirms receipt of the materials. Your shipping fee is released from escrow.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'Each delivery status update triggers a real-time notification to both the buyer and the supplier. Late or missing updates may affect your courier rating.'
            }
        ]
    },
    {
        id: 'courier-earnings',
        title: 'Understanding Courier Payments & Fees',
        role: 'courier',
        summary: 'How shipping fees are calculated and when your earnings are released.',
        sections: [
            {
                type: 'text',
                body: 'Shipping fees on 4Ceria are calculated based on the total weight of materials, the distance between the supplier store and the delivery site, and the vehicle type required.'
            },
            {
                type: 'list',
                title: 'Fee Calculation Factors:',
                items: [
                    'Material Weight: Heavier loads command higher shipping fees — measured in kg from the product specifications.',
                    'Distance: The distance between the supplier store and the project site, calculated via GPS coordinates.',
                    'Vehicle Type: Larger vehicles (trucks, flatbeds) earn higher fees than motorcycles or vans.',
                    'Urgency: Express delivery requests may include a premium fee for same-day or next-day service.'
                ]
            },
            {
                type: 'list',
                title: 'Payment Timeline:',
                items: [
                    'Shipping fees are held in escrow when the buyer places the order.',
                    'Fees are released to your account once the buyer confirms delivery receipt.',
                    'If there is a dispute, fees remain in escrow until the dispute is resolved by platform mediators.'
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Maintain a high delivery success rate to unlock priority access to higher-value delivery jobs.'
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
                body: '4Ceria serves as a neutral intermediary. In the rare event of a dispute between a client and a professional, we offer dedicated mediation and arbitration processes.'
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Never complete transactions outside the platform. Doing so voids all milestone protections and account guarantees.'
            }
        ]
    }
];
