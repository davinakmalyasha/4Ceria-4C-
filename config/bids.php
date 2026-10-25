<?php

/*
|--------------------------------------------------------------------------
| Bid Role Map — single source of truth for the 7 professional roles
|--------------------------------------------------------------------------
|
| The bid domain has 7 near-identical tables/models. ProjectController (and
| friends) previously maintained FIVE separate inline match/array mappings of
| role -> class/column, which had to be kept in sync by hand and drifted.
|
| This config replaces those mappings.
|
| THE ID SPACES — read this before touching the keys below
| -------------------------------------------------------
| Every role has ONE declaration that says what the project column holds:
|
|   project_id_column   the column on `projects` that identifies the hired
|                       professional for this role. It holds a PROFILE row id
|                       — an `arsiteks` / `kontraktors` / `project_managers` /
|                       ... id — for ALL SEVEN roles.
|
| `projects.pm_id` USED TO hold the PM's USER id, and it was the one exception
| in the whole schema. The pm_id resolution migration removed it: the column
| now holds the PM's PROFILE id, the same value `bids_project_manager.pm_id`
| holds and the same value `acceptBid` writes. So there is no `project_id_kind`
| any more — one convention, not seven.
|
| This is verified against the live data, not asserted:
|
|     projects.selected_arsitek_id = 6634  ->  arsiteks.id 6634 EXISTS
|                                             users.id 6634 does NOT
|
| There used to be a THIRD key here, `project_user_key`, set to
| `selected_arsitek_id` and friends for the six profile roles. It claimed a
| USER id where the column holds a PROFILE id — and it was DEAD: nothing in
| `app/` or `tests/` ever read it. A key that is wrong AND unread is the worst
| of both: it looks authoritative, and it is a trap for the next person who
| wires something up to it. It is gone.
|
| The second convention, also enforced here:
|
|   - bids_* tables always store PROFILE ids in their FK column,
|     including bids_project_manager.pm_id.
|
*/

return [
    'arsitek' => [
        'label' => 'Architect',
        'bid_model' => App\Models\BidArsitek::class,
        'profile_model' => App\Models\Arsitek::class,
        'bid_fk' => 'arsitek_id',
        'project_id_column' => 'selected_arsitek_id',
        'relation' => 'bidsArsitek',
    ],

    'kontraktor' => [
        'label' => 'Contractor',
        'bid_model' => App\Models\BidKontraktor::class,
        'profile_model' => App\Models\Kontraktor::class,
        'bid_fk' => 'kontraktor_id',
        'project_id_column' => 'selected_kontraktor_id',
        'relation' => 'bidsKontraktor',
    ],

    'notaris' => [
        'label' => 'Notary',
        'bid_model' => App\Models\BidNotaris::class,
        'profile_model' => App\Models\NotarisProfile::class,
        'bid_fk' => 'notaris_id',
        'project_id_column' => 'selected_notaris_id',
        'relation' => 'bidsNotaris',
    ],

    'interior' => [
        'label' => 'Interior Designer',
        'bid_model' => App\Models\BidInterior::class,
        'profile_model' => App\Models\InteriorProfile::class,
        'bid_fk' => 'interior_id',
        'project_id_column' => 'selected_interior_id',
        'relation' => 'bidsInterior',
    ],

    'structural' => [
        'label' => 'Structural Engineer',
        'bid_model' => App\Models\BidStructural::class,
        'profile_model' => App\Models\StructuralEngineer::class,
        'bid_fk' => 'structural_id',
        'project_id_column' => 'structural_id',
        'relation' => 'bidsStructural',
    ],

    'mep' => [
        'label' => 'MEP Engineer',
        'bid_model' => App\Models\BidMep::class,
        'profile_model' => App\Models\MepEngineer::class,
        'bid_fk' => 'mep_id',
        'project_id_column' => 'mep_id',
        'relation' => 'bidsMep',
    ],

    // `projects.pm_id` holds the PM's PROFILE id, the same value
    // `bids_project_manager.pm_id` holds. The pm_id resolution migration
    // removed the special case.
    'project_manager' => [
        'label' => 'Project Manager',
        'bid_model' => App\Models\BidProjectManager::class,
        'profile_model' => App\Models\ProjectManager::class,
        'bid_fk' => 'pm_id',
        'project_id_column' => 'pm_id',
        'relation' => 'bidsProjectManager',
    ],
];
