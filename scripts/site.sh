#!/usr/bin/env bash
# Assemble the whole documentation site locally, as pages.yml does after it
# has built the holo, without the holo: `just site`, then serve the output
# directory. Usage:
#
#     scripts/site.sh [out-dir] [--built DIR]
#
# out-dir defaults to target/site and is replaced. --built is a directory of
# verified example builds (<dir>/<name>/app.holo, holo-identities.json and
# design/), as pages.yml's example jobs make them; without it the example
# pages are written without a holo. The committed site/ is never written: the
# site is assembled in a copy, and the social image and the icons are drawn
# for that copy's app.json into the copy, by og.py and icons.py run from a
# scratch root whose site/ is the copy. app.holo is an empty placeholder, so
# the start page renders as it does before a build.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
out=target/site
built=
while (($#)); do
  case $1 in
    --built) built=$(cd "$2" && pwd); shift 2 ;;
    *) out=$1; shift ;;
  esac
done
rm -rf "$out"
mkdir -p "$(dirname "$out")"
cp -r site "$out"
out=$(cd "$out" && pwd)

# The case studies, the facet pages and the old learn/ redirects.
checkouts=$(scripts/subjects.sh)
cargo run -q --locked -p devrel-catalog -- \
  --subjects devrel/subjects.json --checkouts "$checkouts" \
  --self-root "$root" --self-commit "$(git rev-parse HEAD)" \
  --site "$out"

# The start page, the builder and the example pages.
node builder/site.mjs --site "$out" ${built:+--built "$built"}

# The social image and the icons, drawn into the copy. A Python with Pillow
# is used as it is; otherwise Pillow is installed by hash into
# target/draw, as pages.yml installs it.
python=python3
if ! python3 -I -c 'import PIL' 2>/dev/null; then
  python=$root/target/draw/bin/python
  if ! cmp -s bootstrap/draw-requirements.txt target/draw/requirements.txt; then
    rm -rf target/draw
    python3 -m venv target/draw
    target/draw/bin/pip install --quiet --no-deps --only-binary :all: --require-hashes -r bootstrap/draw-requirements.txt
    cp bootstrap/draw-requirements.txt target/draw/requirements.txt
  fi
fi
draw=$(mktemp -d)
trap 'rm -rf "$draw"' EXIT
mkdir "$draw/bootstrap"
cp bootstrap/og.py bootstrap/icons.py "$draw/bootstrap/"
ln -s "$out" "$draw/site"
"$python" -I "$draw/bootstrap/og.py"
"$python" -I "$draw/bootstrap/icons.py"

# The page, with no holo, and the vendored modules it loads.
: >"$out/app.holo"
cp -r try/vendor "$out/vendor"
rm -rf "$out/vendor/prism-code/fixtures"
node bootstrap/page.mjs "$out"
# The documentation shell, then the content standard, measured in Chromium.
node devrel/shell.mjs "$out"
node scripts/content/enrich.mjs "$out"
node scripts/content/check.mjs "$out"
node bootstrap/precache.mjs "$out"
printf 'site: %s is assembled; serve it with: python3 -m http.server --directory %s\n' "$out" "$out"
