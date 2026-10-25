#!/usr/bin/env bash
#
# Supply-chain policy for GitHub Actions.
#
# WHY THIS EXISTS
# ---------------
# The CI workflow used `redis/redis-stack-action@v1`. That repository does not
# exist — `GET /repos/redis/redis-stack-action` returns 404 — so the action
# could never be resolved and the `api` job died at *action resolution*, before
# a single line of project code was executed. Every run since 2026-09-28 was
# red for a reason that had nothing to do with the project, and nobody noticed
# because the failure was constant and therefore background noise.
#
# A floating tag (`@v4`) is the same class of problem in slower motion: the
# tag can be moved to a different commit at any time, and a moved tag is a
# silent change to the build. This script makes that impossible to express.
#
# THE POLICY
# ----------
#   1. Every `uses:` must be pinned to a full 40-hex commit SHA, OR be a local
#      action (`./path`).
#   2. Every container image reference must be pinned by digest
#      (`name@sha256:<64-hex>`), not by tag.
#   3. `pull_request_target` is forbidden. It runs with repository secrets and
#      a write token against code from a fork.
#
# The script is committed rather than inlined so it can be run locally before
# pushing, and so the rule has exactly one implementation.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW_DIR="$ROOT/.github/workflows"

fail=0

note() { printf '  %s\n' "$1"; }
bad()  { printf '  ::error::%s\n' "$1"; fail=1; }

if [ ! -d "$WORKFLOW_DIR" ]; then
    echo "No .github/workflows directory — nothing to check."
    exit 0
fi

# Every workflow file, one per line.
workflow_files() {
    find "$WORKFLOW_DIR" -type f \( -name '*.yml' -o -name '*.yaml' \) | sort
}

# A workflow with its backslash line-continuations joined, so a `docker run`
# whose image sits on the next physical line is still one command.
join_continuations() {
    awk '
        {
            if (pending != "") {
                line = pending " " $0
            } else {
                line = $0
            }
            if (line ~ /\\[ \t]*$/) {
                sub(/\\[ \t]*$/, "", line)
                pending = line
            } else {
                print line
                pending = ""
            }
        }
        END {
            if (pending != "") print pending
        }
    ' "$1"
}

echo "==> action-policy"

# ---------------------------------------------------------------- rule 1
# `uses:` values look like:
#     uses: actions/checkout@v4
#     uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.2.2
#     uses: ./.github/actions/thing
#
# Only the third form is allowed without a SHA. A version suffix on a pinned
# SHA (`@<sha> # v4.2.2`) is fine — that is a human-readable annotation, not a
# ref.
echo "-> rule 1: every 'uses:' is pinned to a 40-hex commit SHA"

while IFS=: read -r file lineno rest; do
    [ -z "${rest:-}" ] && continue
    case "$rest" in
        *'#'*) rest="${rest%%#*}" ;;
    esac
    # `uses:` may appear as `uses: x` or `  - uses: x`
    rest="${rest#"${rest%%[![:space:]]*}"}"
    case "$rest" in
        uses:*) ;;
        *) continue ;;
    esac
    ref="${rest#uses:}"
    ref="${ref#"${ref%%[![:space:]]*}"}"
    ref="${ref%%[[:space:]]*}"
    ref="${ref%\"}"; ref="${ref#\"}"
    ref="${ref%\'}"; ref="${ref#\'}"

    [ -z "$ref" ] && continue

    case "$ref" in
        ./*|./)
            note "local action (allowed): $ref"
            continue
            ;;
    esac

    if ! printf '%s' "$ref" | grep -Eq '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+@[0-9a-f]{40}$'; then
        bad "$(basename "$file"):$lineno — 'uses: $ref' is not pinned to a 40-hex commit SHA"
    else
        note "pinned: $ref"
    fi
done < <(grep -rEn '^[[:space:]]*(-[[:space:]]*)?uses:' "$WORKFLOW_DIR" 2>/dev/null || true)

# ---------------------------------------------------------------- rule 2
# Container images referenced by `services:` or `docker run`.
#
# The scan strips `"$VAR"` / `'$VAR'` first: a volume mount like
# `-v "$PWD:/repo"` looks exactly like an image reference, and it is not one.
echo "-> rule 2: every container image is pinned by digest"

while IFS=: read -r file lineno rest; do
    [ -z "${rest:-}" ] && continue
    case "$rest" in
        *'#'*) rest="${rest%%#*}" ;;
    esac
    rest="${rest#"${rest%%[![:space:]]*}"}"
    case "$rest" in
        image:*) ;;
        *) continue ;;
    esac
    ref="${rest#image:}"
    ref="${ref#"${ref%%[![:space:]]*}"}"
    ref="${ref%%[[:space:]]*}"
    ref="${ref%\"}"; ref="${ref#\"}"

    if ! printf '%s' "$ref" | grep -Eq '@sha256:[0-9a-f]{64}$'; then
        bad "$(basename "$file"):$lineno — image '$ref' is not pinned by digest"
    else
        note "digest-pinned: $ref"
    fi
done < <(grep -rEn '^[[:space:]]*image:[[:space:]]*' "$WORKFLOW_DIR" 2>/dev/null || true)

# `docker run` references.
while IFS= read -r file; do
    [ -z "$file" ] && continue
    base="$(basename "$file")"

    while IFS= read -r line; do
        [ -z "$line" ] && continue

        # Strip variable references so a volume mount is not read as an image.
        scrubbed=$(printf '%s' "$line" | sed -e 's/"\$[A-Za-z_][A-Za-z0-9_]*"//g' -e "s/'\$[A-Za-z_][A-Za-z0-9_]*'//g")

        # Only lines that actually run a container.
        case "$scrubbed" in
            *"docker run"*|*"docker  run"*) ;;
            *) continue ;;
        esac

        for ref in $(printf '%s\n' "$scrubbed" | grep -Eo '[A-Za-z0-9][A-Za-z0-9._/-]*(@sha256:[0-9a-f]{64}|:[A-Za-z0-9._-]+)' || true); do
            case "$ref" in
                *@sha256:*)
                    note "digest-pinned: $ref"
                    continue
                    ;;
            esac
            # A `docker run` flag value that happens to contain a colon is not
            # an image. Only complain about something that could plausibly be
            # a registry path.
            case "$ref" in
                */*) ;;
                *) continue ;;
            esac
            bad "$base — 'docker run' image '$ref' is not pinned by digest"
        done
    done < <(join_continuations "$file")
done < <(workflow_files)

# ---------------------------------------------------------------- rule 3
echo "-> rule 3: no 'pull_request_target'"
if grep -rEq '^[[:space:]]*pull_request_target[[:space:]]*:' "$WORKFLOW_DIR" 2>/dev/null; then
    bad "a workflow uses 'pull_request_target' — it runs fork code with repository secrets"
else
    note "no pull_request_target"
fi

echo
if [ "$fail" -ne 0 ]; then
    echo "ACTION POLICY VIOLATED"
    exit 1
fi
echo "action policy OK"
