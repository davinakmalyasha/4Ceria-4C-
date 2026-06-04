import { DocArticle } from './docs/docTypes';
import { clientDocs } from './docs/clientDocs';
import { clientProjectDocs } from './docs/clientProjectDocs';
import { proDocs } from './docs/proDocs';
import { proSpecialistDocs } from './docs/proSpecialistDocs';
import { merchantCourierDocs } from './docs/merchantCourierDocs';
import { commonDocs } from './docs/commonDocs';
import { gettingStartedDocs } from './docs/gettingStartedDocs';
import { chatDocs } from './docs/chatDocs';
import { adminDocs } from './docs/adminDocs';
import { faqDocs } from './docs/faqDocs';

export type { DocArticle };

export const allDocArticles: DocArticle[] = [
    ...gettingStartedDocs,
    ...clientDocs,
    ...clientProjectDocs,
    ...proDocs,
    ...proSpecialistDocs,
    ...merchantCourierDocs,
    ...chatDocs,
    ...adminDocs,
    ...commonDocs,
    ...faqDocs
];

export interface CategoryGroup {
    name: string;
    role: DocArticle['role'];
    icon: string;
}

export const docCategories: CategoryGroup[] = [
    { name: 'Getting Started', role: 'getting-started', icon: 'Rocket' },
    { name: 'Clients (Property Owners)', role: 'client', icon: 'User' },
    { name: 'Professionals (Builders)', role: 'professional', icon: 'HardHat' },
    { name: 'Project Workspace', role: 'workspace', icon: 'Layout' },
    { name: 'Material Suppliers', role: 'merchant', icon: 'Store' },
    { name: 'Logistics Couriers', role: 'courier', icon: 'Truck' },
    { name: 'Admin Panel', role: 'admin', icon: 'Settings' },
    { name: 'Trust & Safety', role: 'common', icon: 'ShieldAlert' },
    { name: 'FAQ & Troubleshooting', role: 'faq', icon: 'HelpCircle' }
];
