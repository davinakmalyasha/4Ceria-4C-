#!/usr/bin/env bash
#
# branch-protection.sh — the rule set for `main`.
#
# The live rule set MUST match the CONTEXTS list below: GitHub only reports
# the CI job names, so a hand-added check name (or a renamed job) makes every
# PR unmergeable through the normal flow. If the live settings drift, re-run
# this script to converge them; do not hand-edit the branch protection.
#
# WHY PROTECTION
# --------------
# An unprotected `main` lets any push land without the gate, and a pipeline
# that never executed project code made "the build is green" unassertable
# (see the history at the top of .github/workflows/ci.yml).
#
# THE RULE SET
# ------------
#   - The CI jobs must pass. `strict` means the branch has to be up to date
#     with `main`, so a stale PR cannot be merged on the strength of an old
#     green run.
#   - One approving review.
#   - Stale approvals are dismissed — a review of an old revision is not a
#     review of the new one.
#   - Linear history. The repository uses a linear history with zero merge commits;
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

# The CI job names, exactly as GitHub reports them.
CONTEXTS=$(cat <<'JSON'
[
  "Action policy",
  "Secret scan",
  "Go suites",
  "Next.js",
  "PostgreSQL baseline, seed and DB tests",
  "API image"
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
