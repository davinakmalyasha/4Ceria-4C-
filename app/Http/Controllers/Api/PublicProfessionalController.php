<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicProfessionalResource;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\InteriorProfile;
use App\Models\NotarisProfile;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\MepEngineer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;

/**
 * The public professional directories. UNAUTHENTICATED by design — anyone may
 * browse who is available.
 *
 * WHAT CHANGED, AND WHY IT WAS A LEAK
 * ------------------------------------
 * These endpoints used to serialise the raw Eloquent models through a
 * DENYLIST sanitiser that hid identity numbers, NPWP/SIUP document paths and
 * bank details. A denylist cannot protect a relation, and two relations were
 * eager-loaded and therefore untouched by it:
 *
 *   projects      — a FULL `Project` row per job the professional holds.
 *                    `Project` has no `$hidden`, so `budget`, `payment_instructions`,
 *                    `share_token`, `legal_requirements` and the RAB cost
 *                    estimate in `construction_details` were published to any
 *                    anonymous caller. `share_token` is the worst of them: it is
 *                    a live unauthenticated `/api/brief/{token}` link, so the
 *                    owner's whole construction brief became readable.
 *   teamMembers   — `TeamMember` has no `$hidden` and its fillable list includes
 *                    name, phone and email, so every architect's and
 *                    contractor's THIRD-PARTY STAFF were published too.
 *
 * Both are now gone, replaced by `PublicProfessionalResource` — an ALLOWLIST,
 * so the next column added to a model is private until someone names it.
 *
 * VERIFIED PROFESSIONALS ONLY
 * --------------------------
 * Registration used to create profiles with `verification_status => 'verified'`,
 * so the fix in AuthController was only half a fix: profiles are now created
 * `pending`, but the LISTINGS never filtered on it, which meant anyone could
 * still register, become publicly listable and be shortlisted. Both halves are
 * needed. A directory of unvetted identities is a liability for the platform
 * and for the clients who hire from it.
 */
class PublicProfessionalController extends Controller
{
    /**
     * The base query for a public directory.
     *
     * Two invariants, applied to all seven roles so a new one inherits them:
     *
     *   1. VERIFIED ONLY. A profile awaiting review is not a marketplace
     *      identity.
     *   2. NO `projects`, NO `teamMembers`. Both were the leak, and neither is
     *      read by any public-listing component — verified against the SPA
     *      before removing them. The `projects` count is published instead, as a
     *      number, which is what a client actually wants to know.
     *
     * @param  Builder  $query
     * @param  list<string>  $with
     * @return Builder
     */
    private function directory($query, array $with = []): Builder
    {
        $query->where('verification_status', 'verified');

        // `withCount` rather than `with`: a number cannot leak a column.
        return $query->with($with)->withCount('projects');
    }

    /**
     * Cache a directory listing.
     *
     * Tag-based where the cache driver supports it, so a profile's
     * verification changing can invalidate the list rather than leaving a
     * pending profile listed for the full TTL.
     *
     * @param  Builder  $query
     * @param  list<string>  $with
     */
    private function remember(string $key, $query, array $with = [])
    {
        $builder = fn () => $this->directory($query, $with)->get();
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached'], true);

        return $supportsTags
            ? Cache::tags(['professionals', 'directories'])->remember($key, 600, $builder)
            : Cache::remember($key, 600, $builder);
    }

    public function getArsiteks()
    {
        $data = $this->remember(
            'api_arsitek_list',
            Arsitek::query(),
            ['user', 'user.phoneNumber', 'ratings']
        );

        return PublicProfessionalResource::collection($data);
    }

    public function getKontraktors()
    {
        $data = $this->remember(
            'api_kontraktor_list',
            Kontraktor::query(),
            ['user', 'user.phoneNumber', 'ratings', 'spesialisasis']
        );

        return PublicProfessionalResource::collection($data);
    }

    public function getInteriors()
    {
        $data = $this->remember(
            'api_interior_list',
            InteriorProfile::query(),
            ['user', 'user.phoneNumber', 'ratings']
        );

        return PublicProfessionalResource::collection($data);
    }

    public function getNotarises()
    {
        $data = $this->remember(
            'api_notaris_list',
            NotarisProfile::query(),
            ['user', 'user.phoneNumber', 'ratings', 'services']
        );

        return PublicProfessionalResource::collection($data);
    }

    public function getProjectManagers()
    {
        $data = $this->remember(
            'api_project_manager_list',
            ProjectManager::query(),
            ['user', 'user.phoneNumber', 'ratings']
        );

        return PublicProfessionalResource::collection($data);
    }

    public function getStructuralEngineers()
    {
        $data = $this->remember(
            'api_structural_list',
            StructuralEngineer::query(),
            ['user', 'user.phoneNumber']
        );

        return PublicProfessionalResource::collection($data);
    }

    public function getMepEngineers()
    {
        $data = $this->remember(
            'api_mep_list',
            MepEngineer::query(),
            ['user', 'user.phoneNumber']
        );

        return PublicProfessionalResource::collection($data);
    }
}