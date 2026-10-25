<?php

namespace App\Support;

/**
 * Which stored paths are PUBLIC, and which are PRIVATE.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ProjectResource::isPrivatePath()` used to be:
 *
 *     return str_starts_with($path, 'receipts/');
 *
 * One prefix. Every other private file — the KYC scan, the business
 * certificate, the requirement image, the dispute evidence, the signed SPK
 * contract, the project document, the material payment proof — was classified
 * as PUBLIC, and got a world-readable URL.
 *
 * The consequence is not hypothetical: the `public` disk is the
 * world-readable one, so a private path rendered through `publicUrl()` handed
 * anyone who could guess (or read) the path a permanent link to a signed
 * contract, a KYC scan or a dispute evidence file. It worked until the day the
 * buckets merged, and it worked TODAY.
 *
 * WHY AN ALLOWLIST AND NOT A DENYLIST
 * -----------------------------------
 * A denylist of private prefixes has to be updated every time a private
 * upload path is added, and the day someone forgets, the file is public. The
 * failure is SILENT — nothing errors, the URL just works.
 *
 * An allowlist of PUBLIC prefixes fails the other way: a path that is not on
 * the list is treated as private, and `Vault::url()` then falls back to the
 * public disk for it, so a missing entry costs one extra disk lookup and no
 * disclosure.
 *
 * The asymmetry is the whole point: fail CLOSED.
 */
final class StoragePath
{
    /**
     * The path prefixes stored on the world-readable `public` disk.
     *
     * Everything NOT listed here is treated as private.
     *
     * @var list<string>
     */
    private const PUBLIC_PREFIXES = [
        'addendums/',
        'avatars/',
        'chat_images/',
        'daily_logs/',
        'design_briefs/',
        'deliveries/',
        'delivery_docs/',
        'firm_banners/',
        'materials/',
        'milestone_files/',
        'milestones/',
        'portfolios/',
        'project_assets/',
        'project_attachments/',
        'project_images/',
        'projects/',
        'reviews/',
        'suppliers/',
        'team-members/',
        'uploads/',
    ];

    /**
     * The path prefixes stored on the private vault disk.
     *
     * Listed for the READER, not for the logic: the allowlist decides, and
     * this list is the statement of what the private side actually contains.
     * A prefix here that is not in `PUBLIC_PREFIXES` is private by
     * construction; a prefix in neither is private by default.
     *
     * @var list<string>
     */
    private const PRIVATE_PREFIXES = [
        'certificates/',
        'contracts/',
        'disputes/',
        'kyc/',
        'payment_proofs/',
        'project_documents/',
        'receipts/',
        'requirements/',
    ];

    /**
     * Is this path stored on the private vault disk?
     */
    public static function isPrivate(string $path): bool
    {
        $path = ltrim($path, '/');

        if ($path === '') {
            return false;
        }

        foreach (self::PUBLIC_PREFIXES as $prefix) {
            if (str_starts_with($path, $prefix)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Is this path stored on the world-readable `public` disk?
     */
    public static function isPublic(string $path): bool
    {
        return ! self::isPrivate($path);
    }

    /**
     * The private prefixes, for the reconciliation report and for the test
     * that keeps the two lists honest.
     *
     * @return list<string>
     */
    public static function privatePrefixes(): array
    {
        return self::PRIVATE_PREFIXES;
    }

    /**
     * The public prefixes.
     *
     * @return list<string>
     */
    public static function publicPrefixes(): array
    {
        return self::PUBLIC_PREFIXES;
    }
}
