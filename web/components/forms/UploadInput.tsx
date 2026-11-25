'use client';

import { useState } from 'react';

/**
 * File input with a client-side size guard.
 *
 * The backend validates every upload (type + size → 422 field message), but
 * a 9 MB photo on a 2 MB field currently travels to the server before the
 * user learns anything. This checks `File.size` on selection, names the
 * limit up front, and clears an over-limit selection so the form can never
 * submit it. The `maxMB` must equal the backend `validateFile` limit for
 * the field — a smaller number would block valid uploads.
 */
export function UploadInput({
    name,
    accept,
    multiple,
    required,
    maxMB,
    className,
    disabled,
}: {
    name: string;
    accept?: string;
    multiple?: boolean;
    required?: boolean;
    maxMB: number;
    className?: string;
    disabled?: boolean;
}) {
    const [error, setError] = useState<string | null>(null);

    return (
        <span className="block">
            <input
                type="file"
                name={name}
                accept={accept}
                multiple={multiple}
                required={required}
                disabled={disabled}
                className={className}
                onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    const over = files.find((file) => file.size > maxMB * 1024 * 1024);
                    if (over) {
                        setError(
                            `"${over.name}" is ${(over.size / 1048576).toFixed(1)} MB — the limit is ${maxMB} MB per file.`,
                        );
                        event.target.value = '';
                    } else {
                        setError(null);
                    }
                }}
            />
            <span className="mt-1 block text-[10px] text-neutral-400">Up to {maxMB} MB per file.</span>
            {error ? (
                <span role="alert" className="mt-1 block text-xs font-bold text-red-600">
                    {error}
                </span>
            ) : null}
        </span>
    );
}
