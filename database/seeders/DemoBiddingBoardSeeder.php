<?php

namespace Database\Seeders;

use App\Models\Project;
use App\Models\User;
use Database\Seeders\Support\DemoAccount;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Two OPEN projects with competing bids, so the marketplace is demonstrable.
 *
 * WHY THIS EXISTS ALONGSIDE `DummyProfessionalDataSeeder`
 * -------------------------------------------------------
 * That seeder creates six `status = 'completed'` projects, one per professional,
 * as a portfolio of past work. Which is fine -- and useless for showing what the
 * product does, because every interesting screen filters on work that is still
 * available:
 *
 *   - the discovery / bidding board reads `projects.status IN ('open', ...)` and
 *     excludes projects the viewer has already bid on;
 *   - it additionally requires `selected_arsitek_id IS NULL` and so on;
 *   - a bid with `status = 'pending'` on an open project is what puts a project
 *     in front of the other six professionals in that role.
 *
 * With only completed projects the board renders empty, so a screenshot of it
 * demonstrates nothing and a contributor cloning the repo sees an empty
 * marketplace and concludes it is broken.
 *
 * SCOPE, STATED PLAINLY
 * ---------------------
 * This is demo data, and it is obviously synthetic: the titles name the
 * scenario, the addresses are on `example.test`, and the numbers are round. It is
 * NOT a claim that these projects or professionals exist. There is deliberately
 * no fabricated social proof here -- no ratings, no testimonials, no review
 * counts -- because that would be inventing an endorsement. The earlier audit
 * removed fabricated testimonials from `LandingPage.tsx` for the same reason, and
 * re-adding the pattern in seed data would defeat it.
 *
 * It also writes NO ledger rows. Escrow balances are derived from
 * `project_budget_transactions`, and fabricating a payment history here would
 * make `money:reconcile` report on numbers nobody can audit. An open project has
 * no payments, which is the honest state for an open project.
 */
class DemoBiddingBoardSeeder extends Seeder
{
    public function run(): void
    {
        $client = DemoAccount::user(DemoAccount::CLIENT);

        // ---- the professionals who will bid -------------------------------
        // Resolved by account, not by a hard-coded profile id, so this stays
        // correct whatever order the seeders run in.
        $arsitek = User::where('email', DemoAccount::ARSITEK)->first();
        $kontraktor = User::where('email', DemoAccount::KONTRAKTOR)->first();
        $notaris = User::where('email', DemoAccount::NOTARIS)->first();
        $interior = User::where('email', DemoAccount::INTERIOR)->first();

        if (! $arsitek || ! $kontraktor) {
            // Nothing here is worth a half-built dataset.
            return;
        }

        // ---- Project 1: a live build, open to design + build bids ---------
        $villa = Project::updateOrCreate(
            ['title' => 'Demo: Two-storey house - design and build open for bids', 'user_id' => $client->id],
            [
                'description' => 'Demo project. Two-storey house on a 400 m2 lot in Bekasi: '
                    .'architectural design, structural, and build in two phases. Open for bids '
                    .'from architects and contractors.',
                'budget' => 850_000_000,
                'lokasi' => 'Bekasi, Jawa Barat',
                'jenis_proyek' => 'rumah',
                'status' => 'open',
                // 'both' is what makes one project visible to BOTH the architect
                // feed and the contractor feed. The feed branch for kontraktor
                // requires target_role = 'kontraktor', or 'both' plus a completed
                // design phase / a published kontraktor role.
                'target_role' => 'both',
                'wants_project_manager' => true,
                'published_bidding_roles' => ['project_manager', 'arsitek', 'kontraktor'],
                'bidding_choices' => [
                    'project_manager' => 'find',
                    'arsitek' => 'find',
                    'kontraktor' => 'find',
                ],
                'needed_phases' => ['design', 'build'],
            ]
        );

        // ---- Project 2: legal only, so the notary feed has something -------
        $legal = Project::updateOrCreate(
            ['title' => 'Demo: Notarisation and land documents, BSD pending', 'user_id' => $client->id],
            [
                'description' => 'Demo project. Notarisation of the sale deed and the land '
                    .'certificate (SHM) transfer for a ready house in Tangerang.',
                'budget' => 25_000_000,
                'lokasi' => 'Tangerang, Banten',
                'jenis_proyek' => 'tanah',
                'status' => 'open',
                'target_role' => 'arsitek',
                'published_bidding_roles' => ['notaris'],
                'bidding_choices' => ['notaris' => 'cert_only'],
                'needed_phases' => ['legal'],
            ]
        );

        // ---- Bids ---------------------------------------------------------
        // Two architects against the villa, one contractor, one notary against
        // the legal project. Two bids on the same project is the point: it is
        // what the owner actually compares, and it is the screen worth showing.
        $this->bid(
            project: $villa,
            user: $arsitek,
            profile: \App\Models\Arsitek::where('user_id', $arsitek->id)->first(),
            model: 'BidArsitek',

            price: 68_000_000,
            proposal: 'Demo bid. Concept design, 3D views, and a permit-ready drawing set. '
                .'Design in 5 weeks, one revision round included.',
            estimatedDuration: 5,
            durationUnit: 'weeks',
            isRecommended: true,
        );

        // A second, cheaper architect so the owner has something to compare.
        if ($interior) {
            $this->bid(
                project: $villa,
                user: $interior,
                profile: \App\Models\InteriorProfile::where('user_id', $interior->id)->first(),
                model: 'BidInterior',

                price: 61_000_000,
                proposal: 'Demo bid. Space planning, lighting and material selection alongside '
                    .'the architectural set, to keep the interior decisions from stalling the build.',
                estimatedDuration: 4,
                durationUnit: 'weeks',
                isRecommended: false,
            );
        }

        $this->bid(
            project: $villa,
            user: $kontraktor,
            profile: \App\Models\Kontraktor::where('user_id', $kontraktor->id)->first(),
            model: 'BidKontraktor',

            price: 640_000_000,
            proposal: 'Demo bid. Full build across two phases, materials quoted per stage, '
                .'structural and MEP by certified sub-contractors.',
            estimatedDuration: 7,
            durationUnit: 'months',
            isRecommended: false,
        );

        if ($notaris) {
            $this->bid(
                project: $legal,
                user: $notaris,
                profile: \App\Models\NotarisProfile::where('user_id', $notaris->id)->first(),
                model: 'BidNotaris',

                price: 6_500_000,
                proposal: 'Demo bid. AJPP, deed of sale and the SHM transfer, with the '
                    .'land-certificate check and tax filing handled.',
                estimatedDuration: 3,
                durationUnit: 'weeks',
                isRecommended: false,
            );
        }
    }

    /**
     * Insert one bid, if the professional profile exists.
     *
     * The seven bid tables have identical shapes but no shared parent model, so
     * this writes through the query builder against a table name rather than
     * pretending a common interface exists. `payment_status` is NOT NULL with no
     * default and `negotiation_count` / `is_recommended` likewise, which is why
     * they are all stated here instead of being left to chance.
     */
    private function bid(
        Project $project,
        User $user,
        ?object $profile,
        string $model,
        float $price,
        string $proposal,
        int $estimatedDuration,
        string $durationUnit,
        bool $isRecommended,
    ): void {
        if (! $profile) {
            return;
        }

        [$table, $profileColumn] = match ($model) {
            'BidArsitek' => ['bids_arsitek', 'arsitek_id'],
            'BidInterior' => ['bids_interior', 'interior_id'],
            'BidKontraktor' => ['bids_kontraktor', 'kontraktor_id'],
            'BidNotaris' => ['bids_notaris', 'notaris_id'],
            default => [null, null],
        };

        if ($table === null) {
            return;
        }

        DB::table($table)->updateOrInsert(
            [$profileColumn => $profile->id, 'project_id' => $project->id],
            [
                'price' => $price,
                'fee_type' => 'fixed',
                'proposal' => $proposal,
                'status' => 'pending',
                'negotiation_count' => 0,
                'is_recommended' => $isRecommended ? 1 : 0,
                'estimated_duration' => $estimatedDuration,
                'duration_unit' => $durationUnit,
                'payment_status' => 'unpaid',                'offered_by_id' => $user->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }
}
