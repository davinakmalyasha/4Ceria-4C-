# ADR-0015: Hired professionals are profile ids, everywhere

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

`AGENTS.md` trap #2 records the asymmetry that has cost the most time in this codebase:

> **`projects.pm_id` stores the PM's USER id**, while bid tables store profile ids
> (`arsitek_id` etc.). Never "fix" one to match the other.

The live database confirms it:

| Column | Live value | Resolves to | Semantics |
|---|---|---|---|
| `selected_arsitek_id` | 6634 | `arsiteks.id = 6634` → `user_id = 31682`; **`users.id = 6634` does not exist** | **profile id** |
| `selected_kontraktor_id` | 6544 | `kontraktors.id` | profile id |
| `selected_notaris_id` | 564 | `notaris_profiles.id` | profile id |
| `selected_interior_id` | 377 | `interior_profiles.id` | profile id |
| `structural_id` / `mep_id` | NULL | `structural_engineers.id` / `mep_engineers.id` | profile id |
| **`pm_id`** | 31689 | `project_managers.user_id = 31689` (the profile id is 831) | **user id** |

Six roles use a profile id. One uses a user id. The asymmetry has produced three
distinct defects:

1. **`config/bids.php` is wrong for 6 of 7 roles.** It declares
   `project_user_key => 'selected_arsitek_id'` for every non-PM role — i.e. it claims
   those columns hold a **user** id. The data says profile id. (Defect B5.)

2. **`Project::selectedArsitek()` joins the wrong id space.** It is
   `belongsTo(User::class, 'selected_arsitek_id')` — `users.id = 6634`, which does not
   exist. **The relation always resolves to null**, and the admin dashboard would show a
   *different person* as the project's architect. (Defect B2.)

3. **`Project::selectedKontraktor` does not exist at all**, so
   `GET /api/admin/projects` returns **500** and
   `POST /api/admin/projects/{p}/force-terminate` commits `status='cancelled'` and
   *then* throws — a silent state change behind an error response. (Defect B1.)

## Decision

**Every `selected_*` column on `projects` stores a PROFILE id, including `pm_id`.**

`projects.pm_id` is migrated from a user id to a profile id. In Go, the two id spaces
become **distinct newtypes** — `identity.UserID` and `identity.ProfileID` — so mixing
them is a compile error rather than a runtime comparison that silently succeeds or
fails.

The Go role registry records the convention explicitly, one row per role:

```go
type RoleSpec struct {
    Role                   Role
    Label                  string
    ProfileTable           string
    ProjectColumn          string   // projects.selected_arsitek_id, …
    ProjectColumnIsUserID  bool     // false for all seven, after the migration
    LegacyBidFK            string   // kept only for the backfill
}
```

**Why profile id, and not user id, for the other six?**

A profile id is the thing the bid points at. `bids_arsitek.arsitek_id` holds a profile
id, and `acceptBid` writes `selected_arsitek_id = $bid->arsitek_id` — **the same
value** (`ProjectController.php:1682`). Making `selected_*` a user id would mean the
column no longer equals the bid's own column, and every "who is hired?" query would
need a second join through the profile table. Profile id is the only value that is
directly comparable with what the bids table already stores.

**Why change `pm_id` to a profile id, rather than the other way round?**

Because `projects.pm_id` is *also* read by `Hire::profileIdFor()` and
`Hire::isOwnerOrAssignedPm()` — the 225-line authorisation rule that 107 call sites
depend on — and by `app/Models/Project.php:361`:
`belongsTo(ProjectManager::class, 'pm_id', 'user_id')`. The `user_id` key on that
relation is the tell: it exists *only* because the column holds a user id. Making the
column a profile id lets the relation become the ordinary
`belongsTo(ProjectManager::class, 'pm_id')` — the same shape as the other six — and
removes the special case from the registry, from `Hire`, and from the model.

**The cost:** the PM's *user* id is no longer directly on the project. It is one join
away (`project_managers.user_id`). That join already exists in the model.

**The `Hire` rule is unaffected in substance.** It already requires all four of: the
role is held, a profile exists, the project's column is non-null, and the ids match.
What changes is that "the project's column" is unambiguously a profile id for all seven
roles, so the rule has no exception to remember.

## Consequences

### Positive

- **One convention, not seven.** Every `selected_*` column holds a profile id. The
  registry's `project_user_key` field disappears.
- **The three defects are fixed by the convention, not by a patch.** B1 (the missing
  relation), B2 (the wrong id space) and B5 (the wrong registry) all dissolve.
- **In Go, the id spaces are compile-time distinct.** `identity.UserID` and
  `identity.ProfileID` cannot be compared — the compiler rejects it. The whole
  `null == null` bypass class that `App\Support\Hire` was written to close becomes
  unrepresentable.
- **The cross-table profile-id overlap stops mattering**, because no global key is ever
  a bare profile id.

### Negative

- **A data migration with a join.** `projects.pm_id` is updated from
  `project_managers.user_id` to `project_managers.id` for every row that has a PM.
  The join is unambiguous and the pre-flight count of unresolvable rows must be 0.
- **`Hire` and the 107 call sites are touched.** The *behaviour* is unchanged, but the
  signature of `profileIdFor()` and the PM branch of `isOwnerOrAssignedPm()` change.
  A codemod plus a full-suite run is the mitigation — the 546-test suite includes
  `HireAuthorizationTest` (29 tests), `RoleNullComparisonBypassTest` (13) and
  `HireHistoryController`'s coverage.
- **The `pm_id` semantics change is a *data* change in a production column.** It is
  reversible (the old value is derivable by the inverse join) and the old value is
  preserved in the migration's audit log.

### Neutral

- **The Go `RoleSpec` keeps a `LegacyBidFK` field** for the backfill only. It is
  deleted once the seven legacy bid tables are gone.
- **The `Hire` port keeps all four conditions.** It is the best-designed class in the
  repository; the port does not simplify it.

## Implementation (2026-10-21)

**This ADR is implemented.** The state it describes as "the decision" is now the state of
the code and the data.

| Piece | Where |
|---|---|
| The data migration | `database/migrations/2026_10_21_000001_resolve_projects_pm_id_to_a_profile_id.php` — `projects.pm_id` from `project_managers.user_id` to `project_managers.id`, with a **total pre-flight** (0 unresolvable rows, 0 non-injective user ids) that refuses to run otherwise. Reversible. |
| The one rule | `App\Support\Hire::isAssignedPm()` — the single place that answers "is this user the project's assigned PM?", comparing **profile** ids. It replaced roughly eighty copies of `$project->pm_id === $user->id` across twenty-five controllers and about thirty in the SPA. |
| The registry | `config/bids.php` — `project_id_column` remains; `project_id_kind` and the old dead `project_user_key` are both GONE. There is no id-space split left to express. |
| The model | `Project::projectManager()` is now `belongsTo(ProjectManager::class, 'pm_id')` — the third argument (`'user_id'`) existed only because of the exception. `ProjectManager::projects()` likewise. |
| The notification targets | Six sites used `$project->pm_id` as a `notifications.user_id`. They now resolve the profile and use its `user_id`. |
| The tests | `tests/PmIdResolutionTest.php` (6 tests) pins the invariant, including that a user id must NOT satisfy the rule, and that the migration refuses to run on an unresolvable row. |

**The live data moved exactly as the ADR predicted:** project 14975's `pm_id` went from
`31689` (the PM's user id) to `831` (the PM's `project_managers.id`), and the profile's
`user_id` is `31689`.

**One residual, deliberately not changed:** the SPA's `proUserId` fallback chain
(`bid.pm_id` used where a user id is wanted) still mixes the two id spaces. It is a
display-path fallback that is reached only when `bid.bidder?.user?.id` is absent, and
changing it risks a visual change for no parity benefit — the port will not reproduce it.

## References

- `docs/REWRITE-PLAN.md` §3 (defects B1, B2, B5), §6
- `AGENTS.md` trap #2
- `app/Support/Hire.php`
- `app/Models/Project.php:196-229, :361`
- `config/bids.php`
- `app/Http/Controllers/Api/ProjectController.php:1682`
- live `information_schema` + row values on the `4ceria` database
