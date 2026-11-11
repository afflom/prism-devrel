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

The first subject is [UORust](https://github.com/afflom/uorust), the tool that
maps a Cargo workspace onto a complete Prism model. Until UORust's own facet
records are published, the subject is PrismPM's all-facet reference project
(`tests/fixtures/threat-model/tm-01-prism-code`) at the SDK's commit, so the
pipeline is exercised on every facet from the start.

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

The app answers a record index (decimal) with `record <id>:` and the slugs of
the pages that teach it, `unknown record` past the end, and `invalid request`
otherwise (`DR-06`). The pages link to the [Prism docs](https://uor.foundation/docs)
and the [PrismPM specification](https://github.com/UOR-Foundation/prismpm/blob/15f630aa6deec5d6490ac22e222381fa28d6f17d/SPEC.md)
instead of restating them.

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
