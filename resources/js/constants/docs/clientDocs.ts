import { DocArticle } from './clientDocs';

export const clientDocs: DocArticle[] = [
    {
        id: 'client-overview',
        title: 'Client Workspace Overview',
        role: 'client',
        summary: 'Getting started as a property owner or project client on 4Ceria.',
        sections: [
            {
                type: 'text',
                body: 'Welcome to the 4Ceria client space. Here you can list houses for sale, recruit professionals (architects, contractors, and notaries), purchase materials, and manage construction milestones.'
            },
            {
                type: 'list',
                title: 'Key Client Capabilities:',
                items: [
                    'Sell House: List properties with SHM/HGB and room details.',
                    'Post Project: Create detailed construction briefs for bidding.',
                    'Hire Professionals: Invite verified architects and builders.',
                    'Buy Materials: Purchase products directly from supplier merchants.'
                ]
            }
        ]
    },
    {
        id: 'client-sell-house',
        title: 'Selling Properties & Listing Homes',
        role: 'client',
        summary: 'Learn how to list your property or completed house on the 4Ceria marketplace.',
        sections: [
            {
                type: 'text',
                body: 'Listing your house on the public marketplace requires detailed room specs and certified ownership documents.'
            },
            {
                type: 'widget',
                widgetName: 'sellhouse'
            },
            {
                type: 'list',
                title: 'Property Listing Requirements:',
                items: [
                    'Accurate dimensions (width & length of land and building).',
                    'Ownership certificate verification (SHM - Hak Milik or HGB - Hak Guna Bangunan).',
                    'Detailed room breakdown (number of bedrooms, bathrooms, and size in meters).'
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Ensure all sizes match the values on your certificate. Discrepancies will be caught during notary checking.'
            }
        ]
    }
];
export type { DocArticle };
