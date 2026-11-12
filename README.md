<p align="center">
  <a href="https://afflom.github.io/prism-devrel/learn/"><b>Learning catalog</b></a>
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

The subject is [UORust](https://github.com/afflom/uorust), the tool that
maps a Cargo workspace onto a complete Prism model, read from its own
self-model in `app/` at the commit `devrel/subject.json` pins
(`a4dfa2270bcb`). All 309 of its facet records are covered: 108 security, 73
design, 61 architecture, 38 quality, 15 features, 11 behavior, 2 system and 1
application record.

## What is published

The Pages site has the app at its root and the catalog under `learn/`:

| Resource | Modality |
| --- | --- |
| Model your Rust project with UORust | walkthrough |
| How UORust was modeled | walkthrough (case study) |
| Architecture, Features and journeys, Security and threat model, System and release | walkthroughs |
| Design views in OPM and UML | diagrams, drawn from the design records |
| Quality (ISO/IEC 25010), Behavior and proofs, Extension facets | reference |
| Slides and video script | one slide per facet with a script |
| Record explorer | interactive search over `learn/records.json` |
| llms.txt and Markdown twins | `llms.txt`, `llms-full.txt`, `feed.xml` and a `.md` twin of every page |

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
(Build) are fourteen apps in the spirit of real Prism projects, each built from
one prompt and verified; the [reference](https://afflom.github.io/prism-devrel/start/reference/)
(Build) is the MCP tool's own input schema; and the
[explanation](https://afflom.github.io/prism-devrel/start/explanation/)
(Evaluate) says why one prompt determines every facet. Every page declares its
type and stage (`DR-14`), with the identifiers the DevRel model uses.

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

## How the catalog is made

1. `devrel/subject.json` pins the subject: repository, full commit and project
   path.
2. `devrel-catalog` (`crates/devrel`) reads every `.lex.tex` module of the
   subject, takes its facet records (definitions whose result is a
   `Foundation.Arch`, `Foundation.Sec`, `Foundation.Qual`, `Production.*` or
   extension record type, and every theorem), numbers them by identifier and
   assigns each to the resources that teach it.
3. It writes `app/src/Catalog.lex.tex` (committed; the coverage theorems are
   checked against it) and the pages (generated in `pages.yml`, never
   committed). `pages.yml` fetches the pinned commit and fails if the committed
   catalog is not that commit's catalog (`DR-03`).

```sh
# regenerate after moving the pin
cargo run -p devrel-catalog -- --subject <checkout>/<path> --lean app/src/Catalog.lex.tex --site site
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

[AGENTS.md](AGENTS.md) holds the rules R1 to R6. [CONFORMANCE.md](CONFORMANCE.md)
lists the registered capabilities. Built from
[UOR-Foundation/template](https://github.com/UOR-Foundation/template).

Licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
