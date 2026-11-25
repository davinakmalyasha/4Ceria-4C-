'use client';

import { SegmentError } from '@/components/feedback/SegmentError';

export default function ProjectError({ error, retry }: { error: unknown; retry: () => void }) {
    return <SegmentError title="Project" error={error} retry={retry} />;
}
