---
name: project-brief
description: Turn a vague construction idea into a complete 4Ceria project brief, including scope, rooms, budget band, location and the roles needed.
---

# Project brief

Use this when the user is planning a build, renovation or interior project
and has not posted it yet, or when their brief is too thin for professionals
to bid on.

## Interview

Ask only for what is missing. Prefer one compact set of questions over a long
interrogation:

1. What is being built or changed: new build, renovation, or interior?
2. Where: city/kabupaten, kecamatan if known, and the site status.
3. Size: floor area in m2, floors, bedrooms, bathrooms.
4. Scope: design only, build only, design + build, or legal/notary help.
5. Budget: the range the owner is comfortable with, in IDR.
6. Timing: target start and target finish, or "flexible".
7. Quality: standard/ekonomis, middle, or premium.
8. Constraints: occupied site, heritage/renovation limits, permits (PBG/SLF),
   access for materials, or a preferred style.
9. Which roles they expect to hire: arsitek, kontraktor, interior, notaris,
   project_manager, structural, mep. Do not add roles they did not ask for
   without explaining why.

## Output

Produce a Markdown brief using `references/brief-template.md`. Fill unknowns
with `[to confirm]`; never invent a number. Add a short "what happens next"
section: post the project, collect bids, compare proposals, then sign.

If the user asks for a budget number, call `estimate_budget` and label it a
range, not a quote. If the user asks where to post, point at
Dashboard → Post Project.
