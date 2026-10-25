# ADR-0008: Collation is decided per column family

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Davin Akmal Yasha

## Context

MySQL's default collation is `utf8mb4_unicode_ci` — **case-insensitive**. PostgreSQL's
default is **case-sensitive**.

The rewrite moves the database from MySQL to PostgreSQL (ADR-0006). This single
difference silently breaks every case-insensitive comparison, and it breaks them in the
**most authentication-critical** places:

| Column | Used by | Failure mode |
|---|---|---|
| `users.email` | login, registration uniqueness, password reset | a user cannot log in with a differently-cased address that worked yesterday |
| `personal_access_tokens.token` | **every** Sanctum bearer-token lookup | every authenticated request 401s |
| `projects.share_token` | the public brief link (`/brief/{token}`) | every shared brief 404s |
| `users.unique_code` | the 30-bit public identity tag used by firm rosters | firm invites stop resolving — **though the code already uppercases the query, so this one is NOT actually load-bearing. Corrected 2026-10-21 after the schema audit: `FirmMemberService:24` and `FirmMemberController:166` both `strtoupper()` the value before looking it up, so the lookup is collation-independent either way. `citext` is applied anyway, and the row stays in the table because the column is a human-facing identifier.** |
| `users.username` | the public professional directory | the directory silently loses rows |
| `firm_members` invite codes | the firm invite flow | invites stop resolving |

None of these produce a type error, a lint warning, or a failed test — until a test
exists. A CI run that does not exercise a case variant of a token passes green, and the
failure appears in production at 02:00.

## Decision

**Collation is decided per column family, explicitly, in the schema migration — never
left to the engine's default.**

The families and their treatments:

| Family | Columns | Treatment | Rationale |
|---|---|---|---|
| **Authentication identifiers** | `users.email`, `personal_access_tokens.token`, `users.password_reset_token`, `users.email_verified_at`-adjacent tokens | **`citext`** | Case-insensitivity is a *correctness requirement* of these columns, not an accident. `citext` is the type-level expression of that requirement, and it keeps the equality operator's semantics unchanged. |
| **Public share / invite tokens** | `projects.share_token`, firm invite codes | **`citext`** | Same reasoning: a token is a secret, and secrets are case-insensitive by convention (`base64` is, hex usually is, UUIDs are not but are generated lowercase). Preserving today's behaviour is the requirement. |
| **Human-facing unique names** | `users.username`, `users.unique_code` | **`citext`**, or a `lower()` functional unique index | These are typed by humans. Two humans typing `Budi` and `budi` must not create two accounts. |
| **Enum / status / type columns** | all 44 enum columns, `transaction_type`, `role_type`, `verification_status`, `phase_role`, `owner_role` | **`text` (enum) — case-sensitive is correct** | These are machine-written from a fixed vocabulary. Case-insensitivity here would *hide* a bug (a typo'd `'Paid'` would silently match `'paid'`) — precisely the failure mode `AGENTS.md` trap #8 warns about. |
| **Free-text content** | `proposal`, `notes`, `descriptions`, `review` text | **case-sensitive, the default** | Human text. Case-insensitive search over free text is a *feature* request, not a schema default, and `ILIKE` is available when it is wanted. |
| **JSON payloads** | the 59 JSON columns | **case-sensitive, the default** | Structured data, matched exactly. |

**Every unique index on a string column is accompanied by a test that inserts the
case-variant of a known value and asserts the expected outcome** — unique violation for
the `citext` families, successful insert for the case-sensitive ones. These tests are
part of the `go-parity` job's golden-file set and are also asserted on the MySQL side, so
the two engines' behaviour is compared directly.

## Consequences

### Positive

- **The class of bug is closed rather than mitigated.** A case-variant of a token
  behaves identically in MySQL and in PostgreSQL, and a test proves it.
- **The status columns become stricter, not looser.** A typo'd `'Paid'` fails loudly
  instead of silently matching — which is the direction `AGENTS.md` trap #8 wants.
- **The decision is documented per column**, so a future contributor adding a string
  column knows to make the choice.

### Negative

- **`citext` is not `citext` everywhere.** It is a type with locale-aware comparison
  semantics, and it is slightly slower than `text` for large scans because of the
  implicit `lower()` on the index. For the column volumes here (a few hundred thousand
  rows at most) this is irrelevant.
- **`citext` is not available for every pattern** — notably not inside a partial index
  predicate, and not for a `COLLATE`-qualified expression. Where a functional
  `lower()` index is used instead, the query must use `lower(col)` explicitly, which is
  a footgun the schema comment must warn about.
- **The ICU nondeterministic-collation option was considered and rejected** for the
  unique families: it gives correct case-insensitive *matching* but its interaction with
  unique indexes and with `LIKE` is subtle, and `citext` is the boring, well-understood
  choice.

### Neutral

- The MySQL side is unchanged, so the two engines' behaviour is compared rather than
  assumed equal. The differential test corpus is the instrument.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Do nothing — use PostgreSQL's default everywhere** | Silently breaks login, every token lookup and the share link. Unacceptable. |
| **ICU nondeterministic collation (`und-u-ks-level2`)** | Correct for matching, subtle with unique indexes and `LIKE`, and its performance characteristics are less well understood than `citext`'s. |
| **`lower()` functional indexes everywhere** | The correct approach for a case-sensitive column that needs case-insensitive *lookup*, but it requires every query to use `lower(col)` — easy to get wrong, and a missed `lower()` is a silent bug. `citext` removes the footgun. |
| **Normalise to lowercase on write** | The simplest option, and it changes the stored data — which breaks the byte-for-byte golden-file comparison with MySQL, where the original casing is preserved. |

## References

- `docs/REWRITE-PLAN.md` §11, risk R2
- `docs/adr/0006-postgresql-17-as-the-target.md`
- `AGENTS.md` trap #8
