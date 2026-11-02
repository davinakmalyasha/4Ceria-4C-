import { DocArticle } from './docTypes';

export const chatDocs: DocArticle[] = [
    {
        id: 'workspace-chat',
        title: 'Using the Messaging System',
        role: 'workspace',
        summary: 'How to send messages, manage conversations, and communicate with other users.',
        sections: [
            {
                type: 'text',
                body: 'The 4Ceria messaging system allows you to communicate directly with professionals, clients, suppliers, and other users. All conversations are secured and logged within the platform.'
            },
            {
                type: 'widget',
                widgetName: 'chat'
            },
            {
                type: 'step',
                title: 'How to Start a Conversation:',
                steps: [
                    { stepNumber: 1, title: 'Open the Chat tab', description: 'Click the chat/message icon in the dashboard header or navigate to the Chat section.' },
                    { stepNumber: 2, title: 'Select or start a conversation', description: 'Choose an existing conversation from the list, or click "New Message" to start a fresh conversation with another user.' },
                    { stepNumber: 3, title: 'Type and send your message', description: 'Type your message in the input field at the bottom and click Send or press Enter.' },
                    { stepNumber: 4, title: 'Attach files (optional)', description: 'You can attach documents, photos, or project files directly within the chat.' }
                ]
            },
            {
                type: 'list',
                title: 'Chat Features:',
                items: [
                    'Conversation List: See all your active conversations organized by most recent message.',
                    'Message Thread: Full message history with timestamps for each conversation.',
                    'Chat Overlay: A floating chat widget that stays accessible while you browse other sections.',
                    'Compact View: A minimized chat sidebar for quick access without leaving your current page.'
                ]
            },
            {
                type: 'alert',
                alertType: 'tip',
                body: 'Use the chat widget from professional profile cards to initiate conversations about specific projects or inquiries directly.'
            }
        ]
    },
    {
        id: 'workspace-project-comments',
        title: 'Project Activity Feed & Comments',
        role: 'workspace',
        summary: 'How to use the project activity feed and discussion threads.',
        sections: [
            {
                type: 'text',
                body: 'Each project has an Activity feed and a Comments section. The Activity feed is an automated log of all project events, while Comments is a discussion thread where team members can post updates and questions.'
            },
            {
                type: 'list',
                title: 'Activity Feed Events:',
                items: [
                    'Bid submitted or accepted.',
                    'Milestone status changed (pending → in progress → completed).',
                    'Deliverable uploaded or approved.',
                    'Payment released from escrow.',
                    'Contract signed by a party.',
                    'Phase transition (e.g., Design phase completed, Construction phase started).',
                    'Team member added or removed from the project.'
                ]
            },
            {
                type: 'step',
                title: 'Posting a Comment:',
                steps: [
                    { stepNumber: 1, title: 'Navigate to the project', description: 'Open your project workspace and switch to the Comments tab.' },
                    { stepNumber: 2, title: 'Write your comment', description: 'Type your message, question, or update in the comment input field.' },
                    { stepNumber: 3, title: 'Post', description: 'Click "Post" to add your comment to the thread. All project members will see it.' }
                ]
            },
            {
                type: 'alert',
                alertType: 'info',
                body: 'The Activity feed is system-generated and cannot be edited. It provides an immutable audit trail of all project events for transparency.'
            }
        ]
    },
    {
        id: 'workspace-qa-board',
        title: 'Quality Assurance Q&A Board',
        role: 'workspace',
        summary: 'Using the QA board to ask questions, report issues, and track resolutions.',
        sections: [
            {
                type: 'text',
                body: 'The QA Board is a dedicated section within each project workspace for quality-related questions and issue tracking. Clients, project managers, and professionals can post QA items that need attention.'
            },
            {
                type: 'step',
                title: 'Using the QA Board:',
                steps: [
                    { stepNumber: 1, title: 'Open the QA tab', description: 'Navigate to your project workspace and click the QA Board tab.' },
                    { stepNumber: 2, title: 'Post a question or issue', description: 'Click "New QA Item" and describe the quality concern — include photos if applicable.' },
                    { stepNumber: 3, title: 'Assign to a team member', description: 'Tag the relevant professional who should address the issue.' },
                    { stepNumber: 4, title: 'Track resolution', description: 'The assigned professional responds with their action plan. Mark the item as resolved once satisfied.' }
                ]
            },
            {
                type: 'list',
                title: 'QA Board Best Practices:',
                items: [
                    'Always include photos when reporting quality issues — visual evidence speeds up resolution.',
                    'Tag specific milestones or phases so QA items are linked to the right project stage.',
                    'Use the QA board instead of chat for quality issues — it creates a trackable record.',
                    'Resolve items promptly to maintain project momentum and avoid milestone delays.'
                ]
            }
        ]
    }
];
