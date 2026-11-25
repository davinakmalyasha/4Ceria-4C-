'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Password input with a show/hide toggle and an optional strength meter.
 *
 * Backend caps passwords at 72 bytes (bcrypt truncates silently beyond
 * that), so `maxLength={72}` is the default, not a suggestion. The meter is
 * advisory only — the server enforces length, and nothing else.
 */
export function PasswordField({
    id,
    name,
    label,
    autoComplete = 'new-password',
    required = true,
    minLength = 8,
    maxLength = 72,
    placeholder = 'At least 8 characters',
    showStrength = false,
    value,
    defaultValue,
    onChange,
    inputClassName,
}: {
    id?: string;
    name: string;
    label?: string;
    autoComplete?: string;
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    placeholder?: string;
    showStrength?: boolean;
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    inputClassName?: string;
}) {
    const autoId = useId();
    const fieldId = id ?? `password-${autoId}`;
    const [show, setShow] = useState(false);
    const [inner, setInner] = useState(defaultValue ?? '');
    const current = value ?? inner;

    const score =
        current.length >= 16 || (current.length >= 12 && /[^A-Za-z0-9]/.test(current))
            ? 3
            : current.length >= 12 || (current.length >= 8 && /[a-z]/.test(current) && /[A-Z]/.test(current) && /\d/.test(current))
              ? 2
              : current.length >= 8
                ? 1
                : 0;
    const meter = ['Too short', 'Basic', 'Strong', 'Very strong'][score];
    const meterClass =
        score >= 3 ? 'bg-emerald-500' : score === 2 ? 'bg-lime-500' : score === 1 ? 'bg-amber-500' : 'bg-neutral-200';

    return (
        <div>
            {label ? (
                <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold text-neutral-700">
                    {label}
                </label>
            ) : null}
            <div className="relative">
                <input
                    id={fieldId}
                    name={name}
                    type={show ? 'text' : 'password'}
                    required={required}
                    minLength={minLength}
                    maxLength={maxLength}
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                    value={current}
                    onChange={(event) => {
                        setInner(event.target.value);
                        onChange?.(event.target.value);
                    }}
                    aria-describedby={showStrength ? `${fieldId}-strength` : undefined}
                    className={
                        inputClassName ??
                        'block w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 pr-11 text-sm transition-all placeholder:text-neutral-400 focus:border-[#FD1D1D] focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/15'
                    }
                />
                <button
                    type="button"
                    onClick={() => setShow((value) => !value)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    aria-pressed={show}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center text-neutral-400 transition hover:text-neutral-700"
                >
                    {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
            </div>
            {showStrength ? (
                <div id={`${fieldId}-strength`} aria-live="polite" className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
                        <div className={`h-full rounded-full transition-all ${meterClass}`} style={{ width: `${(score / 3) * 100}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-neutral-500">{current.length === 0 ? 'Password strength' : meter}</span>
                </div>
            ) : null}
        </div>
    );
}
