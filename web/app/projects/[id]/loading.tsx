export default function ProjectLoading() {
    return (
        <div className="p-6" aria-busy="true" aria-label="Loading project">
            <div className="h-8 w-64 rounded bg-neutral-200 animate-pulse" />
            <div className="mt-4 h-4 w-96 max-w-full rounded bg-neutral-200 animate-pulse" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5">
                        <div className="h-3 w-20 rounded bg-neutral-200 animate-pulse" />
                        <div className="mt-3 h-7 w-28 rounded bg-neutral-200 animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}
