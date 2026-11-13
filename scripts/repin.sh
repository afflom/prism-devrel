#!/usr/bin/env bash
# Move every pinned subject in devrel/subjects.json to the newest commit on
# its main whose gate workflow passed, when that commit descends from the one
# pinned now. A pin never moves back, and never to a commit whose gate has not
# passed; a subject whose API call fails keeps its pin (scripts/repin.mjs has
# the rule, DR-53). Run as `just repin`, then `just catalog`; generate.yml
# runs both.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
node scripts/repin.mjs
