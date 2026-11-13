# `just vv` is the normative acceptance gate. Every other recipe is either one
# of its parts or a writer the gate checks the output of.
#
# Each check in `vv` runs exactly once. The parts are ordered so the cheapest
# failure is reported first: formatting needs no compiler, the repository gates
# compile only `xtask`, and the SDK's checks run before the workspace build.

default: vv

# The whole gate.
vv: fmt-check model template-check experience-check fidelity lint test deny app
    @echo "vv: the acceptance gate passed"

fmt-check:
    cargo fmt --all -- --check

# R1, R4, R5 and the bootstrap trust root: `check-model`, `audit-limits`,
# `audit-deferral` and `audit-bootstrap` (which includes
# `audit-dependency-updates`), in one `xtask` process.
model:
    cargo run -q --locked -p xtask -- validate

# The SDK's own checks of the contract and both locks. `template check` also
# regenerates `CONFORMANCE.md` in an isolated copy through `model-write`.
template-check:
    prismpm template check
    prismpm lock check

# FI-01..FI-04: the citations, the fidelity register and the model's measurement of it are
# what the model scores to, and no closed κ is open again.
fidelity:
    cargo run -q --locked -p prism-fidelity -- --project app --repo . --register fidelity.toml --cite model/provenance.toml app/src/Provenance.lex.tex --measures model/measures.toml --lean app/src/Fidelity.lex.tex --check

# Cite and rescore the model: app/src/Provenance.lex.tex, fidelity.toml and
# app/src/Fidelity.lex.tex.
fidelity-write:
    cargo run -q --locked -p prism-fidelity -- --project app --repo . --register fidelity.toml --cite model/provenance.toml app/src/Provenance.lex.tex --measures model/measures.toml --lean app/src/Fidelity.lex.tex

# Clippy at `-D warnings` over every target with every feature enabled. This is
# the one place an optional feature is compiled: a rename upstream of an
# optional dependency fails nowhere else until someone turns the flag on, and
# `--all-targets` because the tests behind a flag are code too. `test` compiles
# the default feature set.
lint:
    cargo clippy --workspace --all-targets --all-features --locked -- -D warnings

# The workspace suite, which includes the `repo-conformance` meta-gate (R3,
# `CM-02`, `CM-03`).
test:
    cargo test --workspace --locked

# R6: nothing shipped depends on a dev-only crate, no wildcard version
# requirement, no advisory against anything in the tree. `cargo-deny` is
# supplied by the locked SDK.
deny:
    cargo deny --all-features check

# The template's own Prism application, the contract checker. The model must
# be canonical and locked. `prismpm verify` builds the holo, replaying its
# acceptance vectors in the compiled guest, then has the Lean kernel and
# leanchecker check every theorem (`TC-01`) and the generated code against the
# model. It runs the build itself, so a separate `prismpm build` would repeat it.
app:
    cd app && lexlean fmt --check && lexlean lock --check
    prismpm --project app verify

# Only the meta-gate, while iterating on a scenario. `test` already runs it.
bdd:
    cargo test --locked -p repo-conformance

fmt:
    cargo fmt --all

# Regenerate everything the model owns: CONFORMANCE.md.
model-write:
    cargo run -q --locked -p xtask -- check-model --write

# R3's first step in one command: a register row, its scenario, a failing test
# named for the ID, and the regenerated CONFORMANCE.md.
#
#     just new-capability CX-01 build parsing "A parsed document round-trips"
new-capability id level suite statement:
    cargo run -q --locked -p xtask -- new-capability {{quote(id)}} {{quote(level)}} {{quote(suite)}} {{quote(statement)}}

# Move every pin in devrel/subjects.json to its subject's newest green main
# commit (never back, never to a commit whose gate failed; DR-53).
repin:
    scripts/repin.sh

# Rewrite app/src/Catalog.lex.tex from the subjects devrel/subjects.json pins
# (DR-03), fetched into target/subjects.
catalog:
    scripts/catalog.sh

# The whole documentation site, assembled locally without the holo as
# pages.yml assembles it: case studies, facet pages, the builder, examples and
# the docs shell, checked against the content standard. Serve `out` after.
site out="target/site":
    scripts/site.sh {{quote(out)}}

# The brand, design and context-of-use facets (DR-40, DR-41): Brand and Users
# in app/src, read from uor.foundation as brand/foundation.lock pins it and from
# the model's own stakeholders, journeys, features and components, then locked
# and formatted. The check regenerates them in a scratch copy and compares.
experience:
    python3 -I scripts/experience/authority.py . --check
    python3 -I scripts/experience/experience.py .
    cd app && lexlean lock && lexlean fmt

experience-check:
    scripts/experience/check.sh

# Every writer: CONFORMANCE.md, the builder's packed assets, and the catalog.
# `generate.yml` runs `repin` and this on every push to main and on a schedule,
# and commits what changed, so no generated file is stale and every case study
# follows its subject without anyone re-pinning it.
# The catalog follows `experience`: the lookup reads every app source but
# the ones written from it, and `fidelity-write` scores the lookup last.
generate: model-write experience catalog fidelity-write
    node builder/pack.mjs

# The content standard over an assembled site: apply what a machine can
# apply, then measure every rule (scripts/content/standard.json).
content site="site":
    node scripts/content/enrich.mjs {{site}}
    node scripts/content/check.mjs {{site}}
