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
| This config replaces those mappings. Conventions encoded here (see AGENTS.md):
|   - projects.pm_id stores the PM's USER id ('project_user_key' => 'pm_id')
|   - every other selected_* column stores PROFILE ids
|   - bids_* tables always store PROFILE ids in their FK column,
|     except bids_project_manager.pm_id which is also a profile id.
|
*/

return [
    'arsitek' => [
        'label' => 'Architect',
        'bid_model' => App\Models\BidArsitek::class,
        'profile_model' => App\Models\Arsitek::class,
        'bid_fk' => 'arsitek_id',
        'project_profile_column' => 'selected_arsitek_id',
        'project_user_key' => 'selected_arsitek_id',
        'relation' => 'bidsArsitek',
    ],

    'kontraktor' => [
        'label' => 'Contractor',
        'bid_model' => App\Models\BidKontraktor::class,
        'profile_model' => App\Models\Kontraktor::class,
        'bid_fk' => 'kontraktor_id',
        'project_profile_column' => 'selected_kontraktor_id',
        'project_user_key' => 'selected_kontraktor_id',
        'relation' => 'bidsKontraktor',
    ],

    'notaris' => [
        'label' => 'Notary',
        'bid_model' => App\Models\BidNotaris::class,
        'profile_model' => App\Models\NotarisProfile::class,
        'bid_fk' => 'notaris_id',
        'project_profile_column' => 'selected_notaris_id',
        'project_user_key' => 'selected_notaris_id',
        'relation' => 'bidsNotaris',
    ],

    'interior' => [
        'label' => 'Interior Designer',
        'bid_model' => App\Models\BidInterior::class,
        'profile_model' => App\Models\InteriorProfile::class,
        'bid_fk' => 'interior_id',
        'project_profile_column' => 'selected_interior_id',
        'project_user_key' => 'selected_interior_id',
        'relation' => 'bidsInterior',
    ],

    'structural' => [
        'label' => 'Structural Engineer',
        'bid_model' => App\Models\BidStructural::class,
        'profile_model' => App\Models\StructuralEngineer::class,
        'bid_fk' => 'structural_id',
        'project_profile_column' => 'structural_id',
        'project_user_key' => 'structural_id',
        'relation' => 'bidsStructural',
    ],

    'mep' => [
        'label' => 'MEP Engineer',
        'bid_model' => App\Models\BidMep::class,
        'profile_model' => App\Models\MepEngineer::class,
        'bid_fk' => 'mep_id',
        'project_profile_column' => 'mep_id',
        'project_user_key' => 'mep_id',
        'relation' => 'bidsMep',
    ],

    // SPECIAL CASE: projects.pm_id holds the PM's USER id, while
    // bids_project_manager.pm_id holds the PM's PROFILE id. Any code mapping a
    // project onto its hired PM user must go through profile_model->user_id.
    'project_manager' => [
        'label' => 'Project Manager',
        'bid_model' => App\Models\BidProjectManager::class,
        'profile_model' => App\Models\ProjectManager::class,
        'bid_fk' => 'pm_id',
        'project_profile_column' => 'pm_id',
        'project_user_key' => 'pm_id',
        'relation' => 'bidsProjectManager',
    ],
];
