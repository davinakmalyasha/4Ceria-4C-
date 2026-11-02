/** Centralized documentation type definitions */

export interface DocStep {
    stepNumber: number;
    title: string;
    description: string;
}

export interface DocSection {
    type: 'text' | 'list' | 'alert' | 'widget' | 'step';
    title?: string;
    body?: string;
    items?: string[];
    alertType?: 'warning' | 'tip' | 'info';
    widgetName?: string;
    steps?: DocStep[];
}

export interface DocArticle {
    id: string;
    title: string;
    role: 'client' | 'professional' | 'merchant' | 'courier' | 'common' | 'getting-started' | 'workspace' | 'admin' | 'faq';
    summary: string;
    sections: DocSection[];
}
