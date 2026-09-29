#!/usr/bin/env bash
# Replicates the CI PHP lint gate exactly, so the gate is verifiable locally.
# Windows-friendly via Git Bash / WSL: pass the PHP binary as $1.
set -euo pipefail
PHP="${1:-php}"

out=$(find app database routes tests -name '*.php' -print0 \
      | xargs -0 -P 4 -n 1 "$PHP" -l 2>&1 \
      | grep -v 'No syntax errors detected' || true)

if [ -n "$out" ]; then
  echo "$out"
  echo "::error::PHP syntax errors found"
  exit 1
fi

echo "php -l clean"
