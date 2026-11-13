#!/usr/bin/env bash
# Check out every pinned subject in devrel/subjects.json at exactly its pinned
# commit, each under <dir>/<slug> (default target/subjects), and print <dir>:
# devrel-catalog's --checkouts. A clean checkout already at its pin is kept;
# any other is fetched again, one commit deep. The self subject is this
# repository, read at the commit being built, so it is not fetched. catalog.sh,
# site.sh and pages.yml all fetch through this.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
dir=${1:-$root/target/subjects}
mkdir -p "$dir"
dir=$(cd "$dir" && pwd)
# slug, repository and commit of each pinned subject, one per line.
node -e '
  const { subjects } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const s of subjects) if (!s.self) console.log([s.slug, s.repository, s.commit].join("\t"));
' "$root/devrel/subjects.json" | while IFS=$'\t' read -r slug repository commit; do
  if [[ ! $slug =~ ^[a-z0-9][a-z0-9-]*$ || ! $commit =~ ^[0-9a-f]{40}$ ]]; then
    printf 'subjects: %s must have a lowercase slug and a full commit, not %s\n' "$slug" "$commit" >&2
    exit 64
  fi
  checkout="$dir/$slug"
  if [[ -d $checkout/.git && $(git -C "$checkout" rev-parse HEAD) == "$commit" && -z $(git -C "$checkout" status --porcelain) ]]; then
    printf 'subjects: %s is at %s\n' "$slug" "$commit" >&2
    continue
  fi
  rm -rf "$checkout"
  git init -q "$checkout"
  git -C "$checkout" fetch -q --depth 1 "$repository" "$commit"
  git -C "$checkout" checkout -q --detach FETCH_HEAD
  test "$(git -C "$checkout" rev-parse HEAD)" = "$commit"
  printf 'subjects: fetched %s at %s\n' "$slug" "$commit" >&2
done
printf '%s\n' "$dir"
