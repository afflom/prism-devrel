#!/usr/bin/env bash
# Move devrel/subject.json to the newest commit on the subject's main whose
# acceptance gate (bootstrap.yml) passed, when that commit descends from the
# one pinned now. A pin never moves back, and never to a commit whose gate has
# not passed. Run as `just repin`, then `just catalog`; generate.yml runs both.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
field() { node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("devrel/subject.json", "utf8"))[process.argv[1]])' "$1"; }
repository=$(field repository)
slug=${repository#https://github.com/}
pinned=$(field commit)
api() { gh api "repos/$slug/$1"; }
green=$(api "actions/workflows/bootstrap.yml/runs?branch=main&status=success&per_page=1" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const [run] = JSON.parse(s).workflow_runs;
    process.stdout.write(run ? run.head_sha : "");
  });')
if [[ -z $green || $green == "$pinned" ]]; then
  echo "repin: $slug stays at $pinned"
  exit 0
fi
status=$(api "compare/$pinned...$green" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => process.stdout.write(JSON.parse(s).status));')
if [[ $status != ahead ]]; then
  echo "repin: the newest green $slug commit $green is $status of $pinned; the pin stays"
  exit 0
fi
node -e '
  const fs = require("fs");
  const subject = JSON.parse(fs.readFileSync("devrel/subject.json", "utf8"));
  subject.commit = process.argv[1];
  fs.writeFileSync("devrel/subject.json", `${JSON.stringify(subject, null, 2)}\n`);
' "$green"
echo "repin: $slug $pinned -> $green"
