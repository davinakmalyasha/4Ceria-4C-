-- =============================================================================
-- 0011 — The dispute short codes in the ledger registry.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- `DisputeService::PAYMENT_TYPES` names a linked payment with SHORT codes
-- (`termin`, `addendum`, `material`, `arsitek_bid`, …), while the registry
-- was seeded with class names, table names and — for bids — the
-- `*_bid` spellings only. Three of the ten short codes have no row that
-- answers to them:
--
--   termin      -> payment_termin   (had ProjectPaymentTermin, project_payment_termins)
--   addendum    -> addendum         (had ProjectAddendum, project_addendums)
--   material    -> material_order   (had MaterialOrder, material_orders)
--
-- The seven bid codes (`arsitek_bid`, `kontraktor_bid`, `notaris_bid`,
-- `interior_bid`, `pm_bid`, `structural_bid`, `mep_bid`) are all present.
--
-- Without the row, the Go port cannot turn a dispute's `payment_type` into
-- the `reference_type_id`/`reverses_type_id` the PG ledger keys on, so
-- `paidAgainst`/`refundedAgainst` read zero for every payment and every
-- arbitration cap computes against nothing. The legacy application never
-- tripped on this because MySQL keys the ledger on the raw strings.
--
-- Append-only: `legacy_aliases` is a text array, and `array_append` guarded
-- by a membership test is idempotent, so a re-run is a no-op.
-- =============================================================================

UPDATE ledger_reference_types
   SET legacy_aliases = array_append(legacy_aliases, 'termin')
 WHERE type_key = 'payment_termin'
   AND NOT ('termin' = ANY (legacy_aliases));

UPDATE ledger_reference_types
   SET legacy_aliases = array_append(legacy_aliases, 'addendum')
 WHERE type_key = 'addendum'
   AND NOT ('addendum' = ANY (legacy_aliases));

UPDATE ledger_reference_types
   SET legacy_aliases = array_append(legacy_aliases, 'material')
 WHERE type_key = 'material_order'
   AND NOT ('material' = ANY (legacy_aliases));
