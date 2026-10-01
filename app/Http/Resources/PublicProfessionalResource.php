<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The ONLY shape a public professional directory may emit.
 *
 * WHY A RESOURCE AND NOT A SANITISER
 * -----------------------------------
 * `PublicProfessionalController::sanitizePublicPayload()` existed and hid
 * identity numbers, NPWP/SIUP document paths and bank details — on the
 * professional and on the nested user. It was a DENYLIST, and a denylist is
 * only as good as the next column someone adds to a model.
 *
 * Two relations escaped it entirely, because the sanitiser only ever touched
 * `$professional` and `$professional->user`:
 *
 *   - `projects` — eager-loaded on four of the seven endpoints, serialising a
 *     FULL `Project` row. `Project` has no `$hidden`, so this leaked, per
 *     project the professional is hired on:
 *
 *       budget                  the owner's escrow ceiling
 *       payment_instructions    "Bank: BCA | No. Rekening: 123… | A/N: …"
 *       share_token             a live unauthenticated /api/brief/{token} link,
 *                               which makes the whole construction brief, the
 *                               document checklist and the Q&A readable
 *       legal_requirements      SHM / AJB / KTP / credit-agreement checklist —
 *                               the owner's property and financing posture
 *       design_details,
 *       construction_details    including the RAB cost estimate, which
 *                               getPublicBrief() goes out of its way to strip
 *       negotiated_fee, user_id, pm_id, selected_*_id
 *
 *   - `user.teamMembers` — `TeamMember` has no `$hidden`, and its `$fillable`
 *     includes name, phone, email and role_title. So every architect's and
 *     contractor's THIRD-PARTY STAFF were published anonymously.
 *
 * A denylist cannot fix either, because the leak is a whole relation, not a
 * field. An allowlist can: anything not named here is not emitted, so the next
 * column added to a model is private by default rather than public by default.
 *
 * WHAT IS DELIBERATELY KEPT
 * -------------------------
 * Contact numbers. This is a marketplace directory — being able to reach a
 * professional is the product. They are projected explicitly (and only the
 * public-facing ones) rather than arriving as a side effect of eager-loading
 * `user`, which is how they were previously exposed.
 *
 * `id` is kept because the SPA uses it for favourites and for the profile
 * route. `user_id` is kept because the profile link needs it; it is not a secret
 * and `User` has no other identifying field on the payload.
 */
class PublicProfessionalResource extends JsonResource
{
    /**
     * Columns that mean the same thing on all seven profile tables.
     *
     * @var list<string>
     */
    private const COMMON = [
        'id', 'user_id', 'nama', 'company_name', 'nama_perusahaan',
        'spesialisasi', 'lokasi', 'deskripsi', 'pengalaman_tahun',
        'rate_harga', 'foto', 'koefisien', 'legalitas',
    ];

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return array_filter([
            'id' => $this->resource->id,
            'user_id' => $this->resource->user_id,

            // Identity and trade.
            'nama' => $this->attribute('nama'),
            'nama_perusahaan' => $this->attribute('nama_perusahaan')
                ?? $this->attribute('company_name'),
            'company_name' => $this->attribute('company_name')
                ?? $this->attribute('nama_perusahaan'),
            'spesialisasi' => $this->attribute('spesialisasi'),
            'lokasi' => $this->attribute('lokasi'),
            'deskripsi' => $this->attribute('deskripsi'),
            'pengalaman_tahun' => $this->attribute('pengalaman_tahun'),

            // Money: the advertised rate, which is public by design.
            'rate_harga' => $this->attribute('rate_harga'),
            'koefisien' => $this->attribute('koefisien'),

            // Ratings, aggregated only. Never the individual review rows, which
            // carry the reviewer's identity.
            'average_rating' => $this->attribute('average_rating'),
            'review_count' => $this->attribute('review_count'),
            'reviews_count' => $this->attribute('review_count'),

            'legalitas' => $this->attribute('legalitas'),
            'layanan' => $this->attribute('layanan'),

            // A NUMBER, not the projects. `withCount('projects')` produces this,
            // and a count cannot leak a column the way eager-loading the relation
            // did. `count` is kept alongside because the SPA reads `count`.
            'projects_count' => $this->attribute('projects_count'),
            'count' => $this->attribute('projects_count'),

            // Contact, from the columns that actually hold it. There is no
            // `users.phone` COLUMN — `phoneNumber` is a hasMany relation onto
            // `phone_user` — and the profile tables carry `no_telp` (and, on
            // some, `phone`). Reading a column that does not exist throws under
            // shouldBeStrict, so each is presence-checked.
            'no_telp' => $this->attribute('no_telp'),
            'phone' => $this->attribute('phone'),
            'phone_number' => $this->attribute('phone_number'),
            'services' => $this->whenLoaded(
                'services',
                fn () => $this->resource->services->map(fn ($s) => [
                    'id' => $s->id ?? null,
                    'nama' => $s->nama ?? null,
                    'deskripsi' => $s->deskripsi ?? null,
                ])->all(),
            ),

            'foto' => $this->attribute('foto'),
            'category' => $this->attribute('category'),

            // Verification is PUBLISHED state, not review state. `rejection_reason`
            // and any internal note stay private; the fact that a professional
            // is verified is the whole point of a directory.
            'is_verified' => $this->attribute('verification_status') === 'verified',

            // A minimal, non-sensitive slice of the USER. Never `email`, never
            // bank details, never `two_factor_secret`, and no relations — the
            // previous eager-load of `user.teamMembers` is what published third
            // parties.
            'user' => $this->whenLoaded('user', fn () => [
                'id' => $this->resource->user->id,
                'name' => $this->resource->user->name,
                'pic' => $this->resource->user->pic,
                // The `phone_user` relation, projected. This is the ONLY contact
                // channel the SPA reads from a directory listing, and it is the
                // product's core function — but it is published deliberately and
                // explicitly rather than arriving because `user` was eagerly
                // loaded, which is how it leaked before (together with
                // `user.teamMembers`, which is NOT projected here).
                'phoneNumber' => $this->resource->user->relationLoaded('phoneNumber')
                    ? $this->resource->user->phoneNumber->map(fn ($p) => [
                        'contact' => $p->contact ?? null,
                        'id_contact' => $p->id_contact ?? null,
                    ])->all()
                    : [],
            ]),
        ], fn ($value) => $value !== null);
    }

    /**
     * Read an attribute only when the model actually has it.
     *
     * The seven profile tables do NOT share a schema — that is why this codebase
     * once needed five hand-rolled role maps. Reading an attribute that is absent
     * throws under `Model::shouldBeStrict(!isProduction())`, so absence is
     * checked rather than assumed.
     *
     * `array_key_exists`, NOT `in_array($key, $attrs)`: `getAttributes()`
     * returns a KEY => value map, so `in_array` compares the key against the
     * VALUES and never matches. That silently turned every field on this
     * resource into null, which is why the first run of its own test suite
     * produced a payload of nothing but `id`.
     */
    private function attribute(string $key): mixed
    {
        $attributes = $this->resource->getAttributes();

        return array_key_exists($key, $attributes)
            ? $this->resource->getAttribute($key)
            : null;
    }
}