<p align="center">
  <a href="https://afflom.github.io/prism-devrel/case-studies/"><b>Case studies</b></a>
  ·
  <a href="https://afflom.github.io/prism-devrel/">App</a>
  ·
  <a href="https://afflom.github.io/prism-devrel/llms.txt">llms.txt</a>
  ·
  <a href="https://uor.foundation/docs">Prism docs</a>
  ·
  <a href="https://github.com/afflom/uorust">UORust</a>
  ·
  <a href="AGENTS.md">Agent rules</a>
</p>

<p align="center">
  <a href="https://github.com/afflom/prism-devrel/actions/workflows/bootstrap.yml"><img src="https://github.com/afflom/prism-devrel/actions/workflows/bootstrap.yml/badge.svg?branch=main" alt="bootstrap"></a>
  <a href="https://github.com/afflom/prism-devrel/actions/workflows/pages.yml"><img src="https://github.com/afflom/prism-devrel/actions/workflows/pages.yml/badge.svg?branch=main" alt="pages"></a>
  <img src="https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue" alt="License: MIT OR Apache-2.0">
</p>

# Prism-DevRel

Prism-DevRel is a Prism model of developer relations. Its stakeholders are
developers, its features are learning resources and its journeys are learning
paths. Its own extension facet, `Foundation.DevRel.V1`, declares a **subject**
(another Prism model, pinned to a commit), the **resources** that teach it in
several modalities, and which resources **cover** which of the subject's facet
records. The Lean kernel checks, over the generated catalog, that:

- every facet record of the subject is covered by at least one resource
  (`Catalog::catalogCovered`, `DR-01`);
- every resource a cover names is declared, and a catalog with an uncovered
  record or an undeclared resource is refused (`Catalog::uncoveredRecordRefused`,
  `Catalog::undeclaredResourceRefused`, `DR-02`).

Each subject is a case study. `devrel/subjects.json` lists them: UORust (the
tool that maps a Cargo workspace onto a complete Prism model), Rule 30,
Verdant Resonance, Foundry, and Prism-DevRel itself, each read from its own
Prism project at the commit it pins (Prism-DevRel at the commit being built).
The app's record lookup catalogs every subject: each record is numbered in
one index, led by its project's slug (`uorust/Architecture::…`), and answered
with the case-study pages that teach it. Files written from the lookup itself
(`lookupExcludes`) are left out of it, so it is never its own input. Each case study states
its pinned commit and the count per facet, generated from that commit rather
than restated here.

## What is published

The Pages site has the app at its root, one case study per subject under
`case-studies/<slug>/`, and one concept page per Prism facet under `facets/`,
showing how each case study declares that facet. Every old `learn/` address
redirects to the page that replaced it. Each page is one
[Diátaxis](https://diataxis.fr) type and one stage of the developer journey,
with the identifiers the builder pages use (`DR-16`). UORust's case study,
which has a tutorial, carries every one of these resources:

| Resource | Diátaxis type | Journey stage |
| --- | --- | --- |
| Model your Rust project with UORust | tutorial | Learn |
| How UORust was modeled | explanation (case study, with UORust's lift register) | Evaluate |
| Architecture, Design views, Features and journeys | explanation | Learn |
| Security and threat model | explanation | Evaluate |
| Quality (ISO/IEC 25010) | reference | Evaluate |
| Behavior and proofs, Extension facets, UORust command reference | reference | Build |
| System and release | explanation | Scale |
| Slides and video script | explanation, one slide per facet with a script | Discover |
| Record explorer | reference, interactive search over the catalog's records | Build |
| llms.txt and Markdown twins | reference: `llms.txt`, `llms-full.txt`, `feed.xml` and a `.md` twin of every page | Build |

The tutorial runs UORust on the fixture workspace UORust's own gate projects,
with the lines of that gate's `uorust` recipe, and shows the committed
projection's records, its `frontier.toml` and its first lifted function beside
the LexLean definition it became. The command reference is read from the
`clap` declaration of the `uorust` binary. Both are read from the pinned
checkout, and a checkout that no longer holds what they show is refused
(`DR-15`). Record values are shown as data: list and record literals as nested
lists, and record identifiers as links to the page that teaches the record
(`DR-16`).

The app is a text/3 workbench. It answers a record index (decimal) with
`record <id>`, `facet <facet>` and one `page <slug>` line per page that
teaches it, `refused unknown-record` past the end, and `error
invalid-request` otherwise; the workbench page gets the same answer as JSON
(`DR-06`). The pages link to the [Prism docs](https://uor.foundation/docs)
and the [PrismPM specification](https://github.com/UOR-Foundation/prismpm/blob/15f630aa6deec5d6490ac22e222381fa28d6f17d/SPEC.md)
instead of restating them.

## One prompt, a whole Prism app

The builder in `builder/` turns one structured prompt into every facet of a
Prism application, laid out as a repository created from
[UOR-Foundation/template](https://github.com/UOR-Foundation/template). The
site documents it as [Diátaxis](https://diataxis.fr) documentation along the
developer journey of Lewko and Parton, *Developer Relations* (Apress, 2021):
the [tutorial](https://afflom.github.io/prism-devrel/start/) (Learn) runs the
builder in the browser; the [how-to guides](https://afflom.github.io/prism-devrel/examples/)
(Build) are 33 example apps, each grounded in a real afflom or UOR-Foundation
repository, built from one prompt and verified; the [reference](https://afflom.github.io/prism-devrel/start/reference/)
(Build) is the MCP tool's own input schema, and the
[Prism source](https://afflom.github.io/prism-devrel/start/source/) (Build) is
every Foundation, Production and language module each app carries, with its
recorded upstream source (`DR-19`); and the
[explanation](https://afflom.github.io/prism-devrel/start/explanation/)
(Evaluate) says why one prompt determines every facet. Every page declares its
type and stage (`DR-14`), with the identifiers the DevRel model uses.

Every prompt names the established pattern its behavior follows (`DR-18`): an
OMG DMN 1.5 decision table (hit policy FIRST, the default), an OASIS XACML 3.0
policy decision (exactly permit, deny, not-applicable or indeterminate), or an
OMG UML 2.5.1 state machine. A state machine is a pure transition function:
the state travels in the request and the answer is the next state, so the
guest keeps nothing between requests. From its `machine` member (the state
field, the initial state, the final states) the builder reads the reachable
states off the successor relation and adds the properties that make the
machine's invariants theorems: a final state is never left, and no step from a
reachable state leaves the reachable set. Each is one step, so by induction it
holds over every run (`DR-17`). As in UML, where every transition belongs to
its source state, the app decides by state first: `judge` tests the state and
hands the request to that state's own first-match chain, which keeps only the
rules that can fire from it (`builder/machine.mjs`). The answer is the flat
chain's for every request, and the prover splits one state's rules at a time,
so a machine of many rules still proves. The machine gets its own UML state-machine
view, and its example page runs it through the verified holo, feeding each
answer back as the next state (`DR-20`).

A prompt is `prism/prompt/1`. Its `app` member is the `prism/spec/1` spec that
prism-code's MCP tool `prism_spec` takes; stakeholders, concerns, components,
threats, quality requirements, journeys, license and repository are optional
and are derived from the spec when absent. From it the builder writes:

| Facet | What the builder writes | Checked by |
| --- | --- | --- |
| Behavior | the Text/1 model the guest is built from, a theorem per property, acceptance vectors | the Lean kernel and `prismpm verify` |
| Architecture | ISO/IEC/IEEE 42010 stakeholders, concerns, components, edges, viewpoints and views | `architectureDescriptionHolds` |
| Design | OPM object-process and UML component, sequence and state-machine views | the SDK's design check, rendered as OPL and PlantUML |
| Features | a feature per rule and property, and a journey per stakeholder | acceptance rows naming definitions |
| Security | assets, STRIDE threats, risks, and controls with evidence or accepted risks | the threat-model checks |
| Quality | ISO/IEC 25010:2023 requirements with measures and thresholds | `qualityModelHolds` and a theorem per threshold |
| Compliance | one obligation per standard with its evidence | `everyObligationEvidenced` |
| System and release | `lexlean.toml`, `lexlean.lock`, register rows, scenarios, Rust tests, `CONFORMANCE.md`, `site/app.json`, an OpenSpec spec | the template's own `just vv` |

```sh
node builder/cli.mjs check examples/rule-30-cell.prompt.json   # what the app will claim
node builder/cli.mjs build my.prompt.json --out my-app          # write it into a template instance
node builder/cli.mjs schema                                     # the MCP tool prism_prompt
node builder/cli.mjs axioms my.prompt.json verify.log          # record observed axiom sets
```

A prompt the builder cannot make into a sound app is refused with the reason
(exit code 2): an example the rules contradict, a property with a
counterexample, a threat with neither a control with evidence nor an accepted
risk, an unknown STRIDE category, a subcharacteristic outside its ISO/IEC 25010
characteristic, a journey step or stakeholder concern that names nothing
declared. Lean's exact axiom policy is recorded as prism-code records it: the
renderer expects `Quot.sound` and `propext`, and when a verify observes another
set (LLV7005), `axioms` writes it into the prompt's `axioms` member. The same prompt and commit instant always write the same bytes
(`DR-10`). The pages workflow builds every example into the template at the
commit `frame.lock` pins and runs that instance's whole gate in the locked SDK
before the example's page offers its holo (`DR-11`). The prism-code journey
modules the builder reuses are vendored byte for byte, with their digests in
`builder/vendor/prism-code/VENDOR.md` (`DR-12`). Example pages escape every piece of prompt
text and quote it as data in their Markdown twins (`DR-13`); with one escape
removed from the example page, `DR-13` fails on its first assertion.

An app built for an upstream contribution can carry that upstream's brand and
obligations. `brand` is a whole `prism/brand-lock/1` lock embedded in the
prompt, so the prompt stays the single source and is written back as
`app/prompt.json`: the brand's name, the upstream repository and commit each
file is pinned to, each copied file (one `logo`, optionally `logo-dark` and a
`mark`) with its SHA-256, and color and fontFamily tokens in W3C DTCG format.
The builder reads each copied file (by default from
`builder/brands/files/<owner>/<repo>/<commit>/<path>`, or `--brand-files`),
re-derives its digest and refuses a mismatch or a missing file with exit 2.
The copies are served under `site/brand/upstream/` beside the lock, the tokens
become `site/card.css` (the stylesheet the template's page inlines after its
own brand layer) with the logo and name in the page header, `site/app.json`
gains a `brand` member, and the example page shows the logo and name in a
section styled by the tokens (`DR-22`). `builder/brands/chaoss-grimoirelab.brand.json`
is CHAOSS GrimoireLab's, pinned to `chaoss/grimoirelab@61c957b` and
`chaoss/community@e3de23a`; its `license` member records that the CHAOSS
marks belong to The Linux Foundation and that permission to use them beyond a
contribution to CHAOSS has not been given. `obligations` appends compliance
obligations, each with its standard, subject, text and evidence, after the
derived ones, numbered in order, so `everyObligationEvidenced` holds of them
all; empty evidence or a repeated subject is refused (`DR-23`). A prompt
without either member builds byte for byte as before.

## How the catalog is made

1. `devrel/subjects.json` lists the subjects. Each pins a repository, a full
   commit, a project path and the `gate` workflow that must pass before the
   pin may move; UORust's entry also names, for the tutorial, the `Justfile`
   recipe, fixture workspace, CLI source and register rows it rests on. The
   subject marked `self` is this repository and has no pin.
2. `scripts/subjects.sh` checks out every pinned subject at exactly its
   commit under `target/subjects/<slug>`. `devrel-catalog` (`crates/devrel`)
   reads every `.lex.tex` module of each subject, takes its facet records
   (definitions whose result is a `Foundation.Arch`, `Foundation.Sec`,
   `Foundation.Qual`, `Production.*` or extension record type, and every
   theorem), numbers them by identifier and assigns each to the resources
   that teach it.
3. It writes `app/src/Catalog.lex.tex` from every subject (committed;
   the coverage theorems are checked against it) and the case studies and
   facet pages (generated in `pages.yml`, never committed). `pages.yml`
   fetches the pinned commits and fails if the committed catalog is not their
   catalog (`DR-03`).
4. Nobody moves a pin by hand. Every hour and on every push to main,
   `generate.yml` runs `scripts/repin.sh`, which moves each subject's pin
   forward to the newest commit on its main whose `gate` workflow passed,
   only when that commit descends from the pin: never back, never onto
   another history, and a subject GitHub cannot answer for keeps its pin
   (`DR-53`). It then regenerates the catalog and pushes, naming the subjects
   that moved.

```sh
just catalog   # rewrite app/src/Catalog.lex.tex from the pins
just site      # assemble the whole documentation site in target/site, without the holo
python3 -m http.server --directory target/site
```

Pages are rendered once as blocks and written as HTML and Markdown, so a twin
cannot say what its page does not (`DR-04`). Subject text is escaped in pages
and quoted as data in twins (`DR-05`).

## The model

Every facet is in `app/src`:

| Module | Facet |
| --- | --- |
| `Architecture` | ISO/IEC/IEEE 42010: five developer stakeholders, six concerns, eight components, nine edges, six viewpoints and views |
| `Design` | OPM view of generating the catalog; UML component, sequence and state machine views (checked by the SDK, PP2012) |
| `Features` | one feature per resource plus the lookup; a journey per stakeholder (PP2014-PP2018) |
| `Security` | assets, STRIDE threats, risks, controls with evidence, an accepted risk, and the `Production.ThreatModel` rows (PP2019-PP2022) |
| `Quality` | ISO/IEC 25010:2023 characteristics, subcharacteristics, requirements and measures |
| `Compliance` | each standard the model answers to, with its evidence |
| `Foundation/DevRel/V1/Model` | the DevRel extension facet: Subject, Modality, Resource, SubjectRecord, Covers, the coverage decision and the lookup |
| `Catalog` | generated: the pinned subject's records, the resources, the covers and their theorems |

## Everyday commands

| Command | What it does |
| --- | --- |
| `just vv` | The whole gate, in the SDK image `prismpm.lock` pins. |
| `prismpm --project app check` | Projects the model and runs the facet checks. |
| `cd app && lexlean verify` | Has the Lean kernel check every theorem. |
| `just model-write` | Regenerates `CONFORMANCE.md` from `model/`. |
| `just repin` | Moves every subject's pin to its newest green main commit (`DR-53`). |
| `just catalog` | Rewrites `app/src/Catalog.lex.tex` from the pinned subjects (`DR-03`). |
| `just site` | Assembles the documentation site locally in `target/site`, as `pages.yml` does but without the holo. |

[AGENTS.md](AGENTS.md) holds the rules R1 to R6. [CONFORMANCE.md](CONFORMANCE.md)
lists the registered capabilities. Built from
[UOR-Foundation/template](https://github.com/UOR-Foundation/template).

Licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
