<?php

use App\Support\StoragePath;
use App\Support\Vault;

/*
|--------------------------------------------------------------------------
| A private file must not be served from the world-readable disk
|--------------------------------------------------------------------------
|
| Regression suite for two related defects:
|
| B7 — the private disk was HARDCODED
| ------------------------------------
| Six upload sites wrote to `Storage::disk('railway')` literally, while the
| rest of the application used `config('filesystems.vault_disk')`. That:
|
|   - made the paths untestable outside production, because the `railway` disk
|     does not exist there;
|   - and made local and staging diverge from production, so a path that works
|     locally fails on deploy, or the reverse.
|
| The affected files are the sensitive ones: the KYC scan, the business
| certificate, the requirement image, the dispute evidence, the payment
| receipt, the project document, and the material payment proof.
|
| B8 — the private-path list was ONE PREFIX
| -----------------------------------------
| `ProjectResource::isPrivatePath()` was:
|
|     return str_starts_with($path, 'receipts/');
|
| So every OTHER private file was classified as PUBLIC and handed a
| world-readable URL: the signed SPK contract, the KYC scan, the dispute
| evidence, the requirement image, the project document.
|
| The rule is now an ALLOWLIST of the public prefixes, so a path that is not
| known-public is private. That fails CLOSED; a denylist fails OPEN, and it
| fails silently — nothing errors, the URL just works.
|
*/

uses(Tests\TestCase::class);

it('treats every known private prefix as private', function (string $prefix) {
    expect(StoragePath::isPrivate($prefix.'something/file.pdf'))->toBeTrue();
})->with([
    'certificates/',
    'contracts/',
    'disputes/',
    'kyc/',
    'payment_proofs/',
    'project_documents/',
    'receipts/',
    'requirements/',
]);

it('treats every known public prefix as public', function (string $prefix) {
    expect(StoragePath::isPrivate($prefix.'something/file.pdf'))->toBeFalse();
})->with([
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
]);

it('treats an UNKNOWN prefix as private, because the rule fails closed', function () {
    // The defect this replaces was a DENYLIST: a prefix nobody had thought
    // about was public. A file added to a new private folder must be private
    // the moment it is uploaded, with no code change and no review.
    expect(StoragePath::isPrivate('some_new_private_folder/report.pdf'))->toBeTrue()
        ->and(StoragePath::isPublic('some_new_private_folder/report.pdf'))->toBeFalse();
});

it('does not let a public prefix be shadowed by a lookalike', function () {
    // `project_images/` is public; `project_images_private/` is not, and
    // `receipts/` is private while `receipts_public/` is not public either.
    expect(StoragePath::isPrivate('project_images_private/x.png'))->toBeTrue()
        ->and(StoragePath::isPrivate('receipts_public/x.png'))->toBeTrue();
});

it('keeps the private and public prefix lists disjoint', function () {
    $private = StoragePath::privatePrefixes();
    $public = StoragePath::publicPrefixes();

    expect(array_intersect($private, $public))->toBe([])
        ->and($private)->not->toBeEmpty()
        ->and($public)->not->toBeEmpty();
});

it('resolves the private disk through the configuration, not a literal', function () {
    // The production default is unchanged.
    expect(Vault::disk())->toBe(config('filesystems.vault_disk', 'railway'));

    // But it FOLLOWS the configuration, so a local or staging environment can
    // put the private bucket on local disk.
    config(['filesystems.vault_disk' => 'public']);

    expect(Vault::disk())->toBe('public');
});

it('never writes a private file to a hardcoded disk name', function () {
    // The static gate: no upload site may name a disk literal. Every private
    // write goes through `Vault::disk()`, so the six sites that used to hard
    // code 'railway' cannot come back.
    $directory = app_path();
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory));

    $violations = [];

    foreach ($files as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'php') {
            continue;
        }

        $source = (string) file_get_contents($file->getPathname());

        foreach (explode("\n", $source) as $number => $line) {
            // A `store()` or `put()` call naming a disk literal.
            if (! preg_match('/->store\(|->put\(/', $line)) {
                continue;
            }

            if (preg_match("/->store\([^)]*'railway'|->put\([^)]*'railway'/", $line)) {
                $violations[] = sprintf(
                    '%s:%d — a hardcoded private disk: %s',
                    str_replace(base_path().DIRECTORY_SEPARATOR, '', $file->getPathname()),
                    $number + 1,
                    trim($line)
                );
            }
        }
    }

    expect($violations)->toBe([], implode("\n", $violations));
});
