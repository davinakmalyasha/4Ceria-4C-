import { DocArticle } from './docTypes';

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
                    'Sell House: List properties with SHM (Sertifikat Hak Milik / Freehold Title) or HGB (Hak Guna Bangunan / Building Rights Title) and room details.',
                    'Post Project: Create detailed construction briefs for the Bidding Board.',
                    'Hire Professionals: Invite verified architects, contractors, interior designers, notaries, and project managers.',
                    'Buy Materials: Purchase construction products directly from accredited supplier merchants.',
                    'Explore Houses: Browse and compare available properties on the marketplace.'
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
                    'Ownership certificate verification — SHM (Sertifikat Hak Milik / Freehold Title) or HGB (Hak Guna Bangunan / Building Rights Title).',
                    'Detailed room breakdown (number of bedrooms, bathrooms, and size in meters).',
                    'High-quality property photos showing exterior and interior rooms.',
                    'Full address with kelurahan (village), kecamatan (district), and kab/kota (city/regency).'
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Ensure all sizes match the values on your certificate. Discrepancies will be caught during notary checking.'
            }
        ]
    },
    {
        id: 'client-explore-houses',
        title: 'Browsing & Searching Properties',
        role: 'client',
        summary: 'How to explore the property marketplace, use filters, and view house details.',
        sections: [
            {
                type: 'text',
                body: 'The Explore Houses tab gives you a powerful property marketplace with map-based search, advanced filters, and detailed house cards. You can filter by location, price range, number of bedrooms, and more.'
            },
            {
                type: 'step',
                title: 'How to Browse Properties:',
                steps: [
                    { stepNumber: 1, title: 'Open the Explore tab', description: 'Navigate to Properties → Browse Houses in your dashboard sidebar to access the marketplace.' },
                    { stepNumber: 2, title: 'Use the Filter Panel', description: 'Filter by province, city/regency, price range, number of bedrooms/bathrooms, and building size.' },
                    { stepNumber: 3, title: 'Browse the Map View', description: 'Switch between list and map views to see property locations plotted on an interactive map.' },
                    { stepNumber: 4, title: 'View House Details', description: 'Click any property card to open the full detail modal with room specs, photos, certificate info, and seller contact.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Use the map view to discover properties near specific locations. You can also save properties to your favorites for later comparison.'
            }
        ]
    },
    {
        id: 'client-compare-houses',
        title: 'Comparing Properties Side-by-Side',
        role: 'client',
        summary: 'Use the Compare Tool to evaluate multiple properties against each other.',
        sections: [
            {
                type: 'text',
                body: 'The Compare Tool lets you select up to 3 properties and view their specifications side-by-side in a comparison table. This makes it easy to weigh your options before making a purchase decision.'
            },
            {
                type: 'step',
                title: 'How to Compare Properties:',
                steps: [
                    { stepNumber: 1, title: 'Select properties to compare', description: 'While browsing houses, click the "Compare" checkbox on each property card you want to compare.' },
                    { stepNumber: 2, title: 'Open the comparison view', description: 'Once you have selected 2-3 properties, click the "Compare" button that appears at the bottom of the screen.' },
                    { stepNumber: 3, title: 'Review the comparison table', description: 'The table shows price, land area, building area, bedrooms, bathrooms, floors, and certificate type side-by-side.' }
                ]
            }
        ]
    },
    {
        id: 'client-schedule-visit',
        title: 'Scheduling Property Visits',
        role: 'client',
        summary: 'How to book an on-site property visit with the owner.',
        sections: [
            {
                type: 'text',
                body: 'If you find a property you are interested in, you can schedule a visit directly through the platform. The property owner will receive your visit request and can confirm or suggest an alternative time.'
            },
            {
                type: 'step',
                title: 'Booking a Visit:',
                steps: [
                    { stepNumber: 1, title: 'Open the property detail', description: 'Click on any property card to view the full detail modal.' },
                    { stepNumber: 2, title: 'Click "Schedule Visit"', description: 'Find the Schedule Visit button in the property actions area.' },
                    { stepNumber: 3, title: 'Pick your preferred date & time', description: 'Select an available date slot and add a note for the property owner (e.g., special requests or questions).' },
                    { stepNumber: 4, title: 'Submit and wait for confirmation', description: 'The owner receives a notification and can confirm your visit. You will be notified once accepted.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'Visits are scheduled through the platform to protect both buyers and sellers. Never share personal contact details before a visit is confirmed.'
            }
        ]
    },
    {
        id: 'client-saved-items',
        title: 'Favorites & Saved Items Dashboard',
        role: 'client',
        summary: 'Manage your saved properties, professionals, and materials for quick access.',
        sections: [
            {
                type: 'text',
                body: 'The Saved Items Dashboard keeps track of all your bookmarked properties, professionals, and marketplace materials. You can quickly return to items you are interested in without searching again.'
            },
            {
                type: 'list',
                title: 'What You Can Save:',
                items: [
                    'Properties: Bookmark houses while browsing to compare or revisit later.',
                    'Professionals: Save architects, contractors, or other professionals you may want to hire.',
                    'Materials: Bookmark construction products from the marketplace for future orders.'
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Saved items are accessible from the dashboard overview. Click the bookmark icon on any card to add or remove it from your saved list.'
            }
        ]
    },
    {
        id: 'client-my-properties',
        title: 'Managing Your Listed Properties',
        role: 'client',
        summary: 'Edit, update, or remove your properties from the marketplace.',
        sections: [
            {
                type: 'text',
                body: 'The My Properties section shows all houses you have listed for sale. From here, you can edit property details, update photos, manage room configurations, and track view statistics.'
            },
            {
                type: 'step',
                title: 'Managing a Listed Property:',
                steps: [
                    { stepNumber: 1, title: 'Go to Properties → My Properties', description: 'Navigate to the My Properties tab in your dashboard sidebar.' },
                    { stepNumber: 2, title: 'Select a property', description: 'Click on any listed property to open the detail view with edit options.' },
                    { stepNumber: 3, title: 'Edit details', description: 'Update prices, descriptions, room configurations, or upload new photos.' },
                    { stepNumber: 4, title: 'Manage room details', description: 'Add, edit, or remove rooms with specific dimensions and photos.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'warning',
                body: 'Changes to certified dimensions (land/building area) may require re-verification. Always ensure your listing matches official certificate values.'
            }
        ]
    }
];

