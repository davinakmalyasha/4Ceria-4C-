import { DocArticle } from './docTypes';
import { clientDocs } from './clientDocs';
import { clientProjectDocs } from './clientProjectDocs';
import { proDocs } from './proDocs';
import { proSpecialistDocs } from './proSpecialistDocs';
import { merchantCourierDocs } from './merchantCourierDocs';
import { commonDocs } from './commonDocs';
import { gettingStartedDocs } from './gettingStartedDocs';
import { chatDocs } from './chatDocs';
import { adminDocs } from './adminDocs';
import { faqDocs } from './faqDocs';

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
