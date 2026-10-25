#!/usr/bin/env bash
#
# branch-protection.sh — the rule set for `main`.
#
# WHY
# ---
# `main` had NO protection. Any push went straight in, and the only gate was
# a manual sequence in AGENTS.md that nobody could prove had been run. Worse,
# the pipeline that was supposed to be the gate had never executed a single
# line of project code (see the history at the top of
# .github/workflows/ci.yml), so "the build is green" was not a fact anyone
# could assert.
#
# THE RULE SET
# ------------
#   - The CI jobs must pass. `strict` means the branch has to be up to date
#     with `main`, so a stale PR cannot be merged on the strength of an old
#     green run.
#   - One approving review.
#   - Stale approvals are dismissed — a review of an old revision is not a
#     review of the new one.
#   - Linear history. The repository has 401 commits and ZERO merge commits;
#     this keeps it that way.
#   - No force-push, no branch deletion.
#   - Conversations must be resolved before merging.
#
# `enforce_admins` is deliberately OFF: the owner works directly on `main` and
# reviews the tree themselves (AGENTS.md). Forcing PRs for every commit would
# be friction, not safety. The status checks still apply to every PR.
#
# USAGE
#   bash scripts/ci/branch-protection.sh                 # apply
#   bash scripts/ci/branch-protection.sh --show          # print the current rule set
#
# The required check names are the `name:` fields of the CI jobs. A check that
# has never been reported is not enforced, so the first push that runs the
# new workflow is what registers them.

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
BRANCH="${BRANCH:-main}"

if [ "${1:-}" = "--show" ]; then
    gh api "repos/${REPO}/branches/${BRANCH}/protection" || echo "not protected"
    exit 0
fi

echo "==> protecting ${REPO}:${BRANCH}"

# The CI job names, exactly as GitHub reports them. The matrix job expands to
# one check per PHP version.
CONTEXTS=$(cat <<'JSON'
[
  "Action policy",
  "Secret scan",
  "API (PHP 8.4)",
  "API (PHP 8.5)",
  "Schema integrity",
  "SPA (TypeScript + Vite)"
]
JSON
)

PAYLOAD=$(cat <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": ${CONTEXTS}
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
)

echo "$PAYLOAD" | gh api --method PUT "repos/${REPO}/branches/${BRANCH}/protection" --input - > /dev/null

echo "    applied"
echo
gh api "repos/${REPO}/branches/${BRANCH}/protection" \
  --jq '"    required checks: " + (.required_status_checks.contexts | join(", ")),
         "    strict:            " + (.required_status_checks.strict | tostring),
         "    reviews required:  " + (.required_pull_request_reviews.required_approving_review_count | tostring),
         "    linear history:    " + (.required_linear_history | tostring),
         "    force pushes:      " + (.allow_force_pushes.enabled | tostring),
         "    deletions:         " + (.allow_deletions.enabled | tostring)'
