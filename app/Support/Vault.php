<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;

/**
 * The private-document disk, in ONE place.
 *
 * WHY THIS EXISTS
 * ---------------
 * `config('filesystems.vault_disk')` exists so a non-production environment can
 * put the private bucket on local disk:
 *
 *     'vault_disk' => env('VAULT_DISK', 'railway'),
 *
 * and several call sites already honoured it (`ProjectDocumentController`,
 * `MaterialQuoteController`, `MaterialOrderController`). But sixteen others
 * hardcoded `Storage::disk('railway')`, which:
 *
 *   - makes those paths untestable -- the first attempt at a regression test for
 *     ProjectContractService failed with UnableToCheckFileExistence, because the
 *     service wrote to a disk that does not exist outside production;
 *   - and silently diverges local and staging from production, so a path that
 *     works locally fails on deploy, or the reverse.
 *
 * `disk()` returns the configured vault disk. `url()` deliberately resolves BOTH
 * layouts, because `ProjectDocument` stores private files on the vault disk in
 * production and on `public` locally, and an accessor that only knows one of them
 * renders a broken link in the other environment.
 *
 * The production default is unchanged: `VAULT_DISK` defaults to `railway`.
 */
final class Vault
{
    /**
     * The configured private-disk name.
     */
    public static function disk(): string
    {
        return (string) config('filesystems.vault_disk', 'railway');
    }

    /**
     * A temporary URL for a vault file, falling back to `public`.
     *
     * Order matters. The vault disk is checked FIRST because in production that
     * is where private files live; the `public` fallback is what makes a file
     * written under a local `VAULT_DISK=public` still resolve.
     */
    public static function url(string $path, int $minutes = 15): ?string
    {
        if ($path === '') {
            return null;
        }

        foreach ([self::disk(), 'public'] as $disk) {
            try {
                if (Storage::disk($disk)->exists($path)) {
                    return Storage::disk($disk)->temporaryUrl($path, now()->addMinutes($minutes));
                }
            } catch (\Throwable) {
                // Disk not configured in this environment; try the next one.
            }
        }

        // Nothing exists at that path. Return a best-effort URL on whichever disk
        // is configured rather than null, so the UI can show a placeholder and a
        // broken path is still diagnosable.
        foreach ([self::disk(), 'public'] as $disk) {
            try {
                return Storage::disk($disk)->url($path);
            } catch (\Throwable) {
                continue;
            }
        }

        return null;
    }
}