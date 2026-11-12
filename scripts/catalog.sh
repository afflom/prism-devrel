#!/usr/bin/env bash
# Rewrite app/src/Catalog.lex.tex as the catalog of the exact subject commit
# devrel/subject.json pins (DR-03 compares it in pages.yml). Run as
# `just catalog`; the subject is fetched into target/subject.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
field() { node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("devrel/subject.json", "utf8"))[process.argv[1]])' "$1"; }
subject=target/subject
rm -rf "$subject"
git init -q "$subject"
git -C "$subject" fetch -q --depth 1 "$(field repository)" "$(field commit)"
git -C "$subject" checkout -q --detach FETCH_HEAD
test "$(git -C "$subject" rev-parse HEAD)" = "$(field commit)"
cargo run -q --locked -p devrel-catalog -- --config devrel/subject.json --subject "$subject/$(field path)" --lean app/src/Catalog.lex.tex
