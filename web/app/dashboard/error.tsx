'use client';

import { SegmentError } from '@/components/feedback/SegmentError';

export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
    return <SegmentError title="Dashboard" error={error} retry={retry} />;
}
