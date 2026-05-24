import { DocArticle, clientDocs } from './docs/clientDocs';
import { clientProjectDocs } from './docs/clientProjectDocs';
import { proDocs } from './docs/proDocs';
import { merchantCourierDocs } from './docs/merchantCourierDocs';
import { commonDocs } from './docs/commonDocs';

export type { DocArticle };

export const allDocArticles: DocArticle[] = [
    ...clientDocs,
    ...clientProjectDocs,
    ...proDocs,
    ...merchantCourierDocs,
    ...commonDocs
];

export interface CategoryGroup {
    name: string;
    role: DocArticle['role'];
    icon: string;
}

export const docCategories: CategoryGroup[] = [
    { name: 'Clients (Property Owners)', role: 'client', icon: 'User' },
    { name: 'Professionals (Builders)', role: 'professional', icon: 'HardHat' },
    { name: 'Material Suppliers', role: 'merchant', icon: 'Store' },
    { name: 'Logistics Couriers', role: 'courier', icon: 'Truck' },
    { name: 'Trust & Safety', role: 'common', icon: 'ShieldAlert' }
];
