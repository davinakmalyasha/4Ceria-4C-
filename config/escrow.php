<?php

/*
|--------------------------------------------------------------------------
| Escrow retention and warranty terms
|--------------------------------------------------------------------------
|
| Construction escrow normally withholds a slice of a contractor's final payment
| until the defects-liability period expires, then releases it. 4Ceria has the
| COLUMNS for this (`project_payment_termins.retention_amount` and `net_amount`)
| and had exactly one write site, which hardcoded 0.
|
| The warranty window was also hardcoded in three places -- the lifecycle service
| (`now()->addDays(180)`), the BAST contract copy, and a controller comment --
| so changing it meant finding all three.
|
| Both are configuration here, so the commercial term is stated once.
|
| `retention_percent` is a PERCENTAGE OF THE STAGE, not of the contract, and is
| applied to the stage that funds retention (see RetentionService). 5% is the
| common construction-industry default for a 6-month DLP.
|
*/

return [

    /*
    |--------------------------------------------------------------------------
    | Retention
    |--------------------------------------------------------------------------
    |
    | `percent` is the slice of a stage withheld until the warranty expires.
    | Set to 0 to disable retention entirely, in which case `net_amount` always
    | equals `amount` and nothing is ever held back.
    |
    */

    'retention_percent' => (float) env('ESCROW_RETENTION_PERCENT', 5),

    /*
    |--------------------------------------------------------------------------
    | Platform fee
    |--------------------------------------------------------------------------
    |
    | ZERO BY DEFAULT, deliberately. The product copy in
    | `resources/js/constants/docs/commonDocs.ts` states:
    |
    |   "4Ceria does not currently charge a platform fee. That is a deliberate
    |    current state, not a hidden charge, and we would rather tell you plainly
    |    than list fees that do not exist in the product."
    |
    | and
    |
    |   "If a future release introduces a platform fee, it will be itemised on the
    |    project ledger next to the payment it applies to, not deducted invisibly."
    |
    | So the default keeps that copy literally true, and when a percentage IS set,
    | PlatformFeeService writes a SEPARATE `platform_fee` ledger row beside the
    | payment it applies to -- never a combined figure, and never taken out of the
    | professional's fee.
    |
    */

    'platform_fee_percent' => (float) env('ESCROW_PLATFORM_FEE_PERCENT', 0),

    /*
    |--------------------------------------------------------------------------
    | Warranty / defects-liability window
    |--------------------------------------------------------------------------
    |
    | Days from finalisation to the end of the warranty period. Previously
    | hardcoded as 180 in ProjectLifecycleService and repeated in the BAST copy.
    |
    | `days` drives the dates; `months` is for display only, and the two are kept
    | separate so a contract can say "6 bulan" while the arithmetic stays in exact
    | days. They are NOT derived from each other, because 6 months is not 180
    | days and pretending otherwise would move an expiry date.
    |
    */

    'warranty_days' => (int) env('ESCROW_WARRANTY_DAYS', 180),

    'warranty_months_display' => (int) env('ESCROW_WARRANTY_MONTHS', 6),

    /*
    |--------------------------------------------------------------------------
    | Claim states that block a release
    |--------------------------------------------------------------------------
    |
    | A retention balance is released only when nothing is still being disputed
    | against it. `resolved` is deliberately NOT blocking: the work was done and
    | the cost settled, so holding the money for it would strand it. `closed` is
    | the state the platform itself puts a claim into when it is finished.
    |
    */

    'blocking_claim_states' => ['open', 'fixing'],

];