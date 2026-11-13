#!/usr/bin/env bash
# Rewrite app/src/Catalog.lex.tex as the catalog of the exact commits
# devrel/subjects.json pins (DR-03 compares it in pages.yml). Run as
# `just catalog`; the pinned subjects are fetched into target/subjects by
# scripts/subjects.sh, and the self subject is this repository at HEAD.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
checkouts=$(scripts/subjects.sh)
cargo run -q --locked -p devrel-catalog -- \
  --subjects devrel/subjects.json --checkouts "$checkouts" \
  --self-root "$root" --self-commit "$(git rev-parse HEAD)" \
  --lean app/src/Catalog.lex.tex
