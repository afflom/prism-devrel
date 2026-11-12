#!/usr/bin/env bash
# Fail when the brand, design and context-of-use facets are not what
# scripts/experience writes from uor.foundation (brand/foundation.lock) and the
# model's own facets: regenerate them in a scratch copy, format with lexlean
# and compare byte for byte. Run inside the locked SDK as `just experience-check`.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
python3 -I "$root/scripts/experience/authority.py" "$root" --check
tar -C "$root" --exclude=app/.lexlean --exclude=app/.prism --exclude=app/target --exclude=app/.lake -cf - app | tar -C "$work" -xf -
python3 -I "$root/scripts/experience/experience.py" "$work" "$root" >/dev/null
(cd "$work/app" && lexlean fmt >/dev/null)
status=0
for file in app/src/Brand.lex.tex app/src/Users.lex.tex app/src/Foundation/Experience/V1/Model.lex.tex \
  $(cd "$work" && ls app/language/prism.arch/entries/*brand* app/language/prism.arch/entries/*context-of-use*) \
  brand/tokens.json brand/foundation.css; do
  if ! cmp -s "$root/$file" "$work/$file"; then
    echo "experience: $file is not what scripts/experience writes; run just experience" >&2
    diff -u "$root/$file" "$work/$file" | head -20 >&2 || true
    status=1
  fi
done
[[ $status -eq 0 ]] && echo "experience: every brand, design and context-of-use file matches its generator"
exit $status
