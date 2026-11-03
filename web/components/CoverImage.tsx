import Image from 'next/image';

/**
 * Card/cover image with built-in responsive sizing.
 *
 * The ported panels used raw `<img class="h-40 w-full object-cover">`, which
 * ships full-size `storage/` blobs to phones with no lazy sizing. This keeps
 * the same box — height classes pass through to a relative wrapper — and lets
 * Next serve sized variants with lazy loading.
 *
 * `src` is an already-resolved absolute URL (`assetUrl`/`resolveAsset`); empty
 * strings must be guarded by the caller exactly as before.
 */
export function CoverImage({
    src,
    alt,
    className,
}: {
    src: string;
    alt: string;
    className?: string;
}) {
    return (
        <span className={`relative block w-full overflow-hidden ${className ?? 'h-40'}`}>
            <Image
                src={src}
                alt={alt}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                className="object-cover"
            />
        </span>
    );
}
