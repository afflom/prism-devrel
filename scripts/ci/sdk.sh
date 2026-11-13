#!/usr/bin/env bash
# Run one shell command inside the SDK image prismpm.lock selects, with this
# checkout mounted at its own path. It is the invocation build.yml and
# pages.yml carry inline (the gate forbids calling a local action), kept here
# once for the workflows that only need to run a recipe:
#
#     scripts/ci/sdk.sh 'just generate'
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"
image=$(sed -n 's/.*"sdk_image":"\([^"]*\)".*/\1/p' prismpm.lock)
if [[ ! $image =~ ^[a-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9./_-]+@sha256:[0-9a-f]{64}$ ]]; then
  printf '%s\n' 'prismpm.lock does not select an immutable SDK image' >&2
  exit 64
fi
docker_config=$(mktemp -d)
# The SDK's /tmp is a private directory on the runner's own disk, so the
# build's scratch space is bounded by the disk the runner has, not by a
# fixed size; it is removed with the credentials when the step ends.
scratch=$(mktemp -d)
mkdir -p "$scratch/prismpm-home/.docker"
trap 'rm -rf "$docker_config" "$scratch"' EXIT
printf '{}\n' >"$docker_config/config.json"
exec docker run --rm \
  --user "$(id -u):$(id -g)" \
  --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  --volume "$scratch:/tmp" \
  --volume "$PWD:$PWD" \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$docker_config:/tmp/prismpm-home/.docker:ro" \
  --workdir "$PWD" \
  --env DOCKER_CONFIG=/tmp/prismpm-home/.docker \
  --env BUILDX_CONFIG=/tmp/prismpm-buildx \
  --env HOME=/tmp/prismpm-home \
  --env PRISMPM_EPHEMERAL_HOME=1 \
  "$image" bash -c "$1"
