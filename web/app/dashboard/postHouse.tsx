'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Native "Post a House" form.
 *
 * The legacy form built a `FormData` payload in the browser and posted it with
 * axios. This one does the same thing against the BFF (`/api/houses`), which
 * attaches the httpOnly token server-side — the browser still never sees it.
 * The room repeater and the file inputs are the only reason this is a client
 * component; every other screen in the cluster renders on the server.
 */

interface RoomDraft {
    name: string;
    type: string;
    width: string;
    length: string;
    desc: string;
    pics: File[];
}

const ROOM_TYPES = [
    { value: 'room', label: 'Room' },
    { value: 'bedroom', label: 'Bedroom' },
    { value: 'bathroom', label: 'Bathroom' },
    { value: 'others', label: 'Others' },
];

const EMPTY_ROOM: RoomDraft = { name: '', type: 'room', width: '', length: '', desc: '', pics: [] };

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</span>
            {hint && <span className="ml-2 text-[10px] text-neutral-400">{hint}</span>}
            <div className="mt-1.5">{children}</div>
        </label>
    );
}

const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-900';

export function PostHouseForm() {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [housePics, setHousePics] = useState<File[]>([]);
    const [rooms, setRooms] = useState<RoomDraft[]>([]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmitting(true);
        setError(null);

        const form = event.currentTarget;
        const data = new FormData(form);

        // The API wants bare digits for the price, exactly like the legacy
        // `String(value).replace(/\D/g, '')`.
        const rawPrice = String(data.get('price') ?? '');
        data.set('price', rawPrice.replace(/\D/g, ''));

        housePics.forEach((file, index) => data.append(`house_pic[${index}]`, file));
        rooms.forEach((room, index) => {
            data.set(`rooms[${index}][name]`, room.name);
            data.set(`rooms[${index}][type]`, room.type);
            data.set(`rooms[${index}][width]`, room.width);
            data.set(`rooms[${index}][length]`, room.length);
            data.set(`rooms[${index}][desc]`, room.desc);
            room.pics.forEach((file, picIndex) => data.append(`rooms[${index}][pics][${picIndex}]`, file));
        });

        try {
            const response = await fetch('/api/houses', { method: 'POST', body: data });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as
                    | { message?: string; errors?: Record<string, string[]> }
                    | null;
                const firstError = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
                setError(firstError ?? body?.message ?? `The listing could not be published (${response.status}).`);
                return;
            }

            router.push('/dashboard/my-houses');
            router.refresh();
        } catch {
            setError('The listing could not be published. Check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div data-native-panel="post-house" className="max-w-3xl space-y-6">
            <div>
                <h1 className="text-2xl font-black text-neutral-900">Post a House</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    Property details and listing registration. Photos are optional but a listing without one is
                    hard to sell.
                </p>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Property details
                    </h2>

                    <Field label="Listing title">
                        <input name="name" required maxLength={255} className={inputClass} placeholder="Modern family home in Bekasi" />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Pricing (Rp)">
                            <input name="price" required inputMode="numeric" className={inputClass} placeholder="2500000000" />
                        </Field>
                        <Field label="Floors">
                            <input name="floors" type="number" min={1} max={99} defaultValue={1} required className={inputClass} />
                        </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-4">
                        <Field label="Bed (BR)">
                            <input name="br" type="number" min={0} max={99} defaultValue={0} required className={inputClass} />
                        </Field>
                        <Field label="Bath (BA)">
                            <input name="ba" type="number" min={0} max={99} defaultValue={0} required className={inputClass} />
                        </Field>
                        <Field label="Width (m)">
                            <input name="width" type="number" min={0} step="0.01" required className={inputClass} />
                        </Field>
                        <Field label="Length (m)">
                            <input name="length" type="number" min={0} step="0.01" required className={inputClass} />
                        </Field>
                    </div>

                    <Field label="Description">
                        <textarea name="house_desc" required rows={4} className={inputClass} placeholder="What makes this house worth a visit?" />
                    </Field>
                </section>

                <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Pin property location
                    </h2>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Province">
                            <input name="province" required maxLength={255} className={inputClass} />
                        </Field>
                        <Field label="City">
                            <input name="kab_kota" required maxLength={255} className={inputClass} />
                        </Field>
                        <Field label="Kecamatan">
                            <input name="kecamatan" required maxLength={255} className={inputClass} />
                        </Field>
                        <Field label="Kelurahan">
                            <input name="kelurahan" required maxLength={255} className={inputClass} />
                        </Field>
                        <Field label="Street name">
                            <input name="street_name" required maxLength={255} className={inputClass} />
                        </Field>
                        <Field label="Postal code">
                            <input name="postal_code" required inputMode="numeric" className={inputClass} />
                        </Field>
                        <Field label="Latitude">
                            <input name="lat" required defaultValue="-6.2088" className={inputClass} />
                        </Field>
                        <Field label="Longitude">
                            <input name="lng" required defaultValue="106.8456" className={inputClass} />
                        </Field>
                    </div>
                </section>

                <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Listing photos
                    </h2>
                    <input
                        type="file"
                        name="house_pic"
                        multiple
                        accept="image/jpeg,image/png,image/jpg"
                        onChange={(event) => setHousePics(Array.from(event.target.files ?? []))}
                        className="block w-full text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:text-white"
                    />
                    <p className="text-[10px] text-neutral-400">
                        JPEG or PNG, up to 2 MB each. {housePics.length} selected.
                    </p>
                </section>

                <section className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                            Rooms (optional)
                        </h2>
                        <button
                            type="button"
                            onClick={() => setRooms((rows) => [...rows, { ...EMPTY_ROOM }])}
                            className="px-3 py-1.5 rounded-lg border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                        >
                            Add room
                        </button>
                    </div>

                    {rooms.length === 0 && <p className="text-xs text-neutral-500">No rooms added yet.</p>}

                    {rooms.map((room, index) => (
                        <div key={index} className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                    Room {index + 1}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setRooms((rows) => rows.filter((_, i) => i !== index))}
                                    className="text-[10px] font-black uppercase tracking-wider text-red-500"
                                >
                                    Remove
                                </button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-4">
                                <Field label="Name">
                                    <input
                                        value={room.name}
                                        required
                                        onChange={(event) =>
                                            setRooms((rows) =>
                                                rows.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)),
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Category">
                                    <select
                                        value={room.type}
                                        onChange={(event) =>
                                            setRooms((rows) =>
                                                rows.map((row, i) => (i === index ? { ...row, type: event.target.value } : row)),
                                            )
                                        }
                                        className={inputClass}
                                    >
                                        {ROOM_TYPES.map((type) => (
                                            <option key={type.value} value={type.value}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Width (m)">
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={room.width}
                                        required
                                        onChange={(event) =>
                                            setRooms((rows) =>
                                                rows.map((row, i) => (i === index ? { ...row, width: event.target.value } : row)),
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Length (m)">
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={room.length}
                                        required
                                        onChange={(event) =>
                                            setRooms((rows) =>
                                                rows.map((row, i) => (i === index ? { ...row, length: event.target.value } : row)),
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </Field>
                            </div>

                            <Field label="Description">
                                <input
                                    value={room.desc}
                                    onChange={(event) =>
                                        setRooms((rows) =>
                                            rows.map((row, i) => (i === index ? { ...row, desc: event.target.value } : row)),
                                        )
                                    }
                                    className={inputClass}
                                />
                            </Field>

                            <Field label="Room photos (optional)">
                                <input
                                    type="file"
                                    multiple
                                    accept="image/jpeg,image/png,image/jpg"
                                    onChange={(event) =>
                                        setRooms((rows) =>
                                            rows.map((row, i) =>
                                                i === index ? { ...row, pics: Array.from(event.target.files ?? []) } : row,
                                            ),
                                        )
                                    }
                                    className="block w-full text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:text-white"
                                />
                            </Field>
                        </div>
                    ))}
                </section>

                <div className="flex items-center justify-end gap-3">
                    <Link
                        href="/dashboard/my-houses"
                        className="px-4 py-2 rounded-xl border border-neutral-200 text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-5 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-neutral-700 disabled:opacity-50"
                    >
                        {submitting ? 'Publishing…' : 'Post property'}
                    </button>
                </div>
            </form>
        </div>
    );
}
