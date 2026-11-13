# Prism-DevRel charter

Stated by Alex for the UOR Foundation. This charter is the primary source for what Prism-DevRel is for: who it serves, what they care about, and what it offers them. Terms that an established framework already defines (ISO/IEC/IEEE 42010 stakeholders and concerns, ISO/IEC 25010 quality, STRIDE, Diátaxis, the Developer Journey) are not restated here; the model cites them from the frameworks.

prism-fidelity cites each stakeholder, concern and feature of the model from the line below that states it, as a W3C PROV-O derivation attributed to the charter's author (model/provenance.toml). A record whose text this charter does not state stays open on the derived axis, so a change of purpose starts here and the model follows.

## Purpose

Prism-DevRel shows developers how to build Prism apps. It is itself a Prism app, a reference implementation whose norms become standards for the ecosystem, and it teaches from case studies of real Prism models, UORust among them.

## Stakeholders

ISO/IEC/IEEE 42010 stakeholders: the people Prism-DevRel serves.

- DevRel author: Writes and maintains the learning resources, and needs to know which records no page teaches yet.
- Maintainer: Keeps the catalog in step with the subject when either changes, without hand-editing generated pages.
- Prism modeler: Already writes Prism models and wants to see how a complete subject model is laid out, record by record.
- Developer new to Prism: Can program, has never built a Prism app, and wants a working app of their own: from an idea, from existing code, or from an example.
- Security reviewer: Checks what the subject claims about threats and controls, and that the catalog cannot misstate it.

## Concerns

ISO/IEC/IEEE 42010 concerns: what those stakeholders care about.

- Accessibility of every page: Every page reads for people with assistive technology and, as plain text, for agents.
- Accuracy against the subject: A page states only what the subject model declares, quoted from its records at the pinned commit.
- Coverage of every record: Every facet record of the subject is taught by at least one resource.
- Findability of a record: Given a record identifier or index, a developer reaches the pages that teach it.
- Freshness of the catalog: The catalog names the subject commit it describes and is regenerated when the pin moves.
- Integrity of what is published: What a reader loads is what the pinned build generated, and subject text cannot run as code.

## Features

What Prism-DevRel offers them, one feature per line.

- A developer turns an existing Rust project into a checked Prism model, following one page.
- A reader learns who the subject model serves, what they care about, and how each concern became a facet.
- Every architecture record of the subject is explained with its stakeholders, concerns, components, edges, viewpoints and views.
- Every design view of the subject is drawn and every element of it is listed.
- Every feature and journey of the subject is explained with the calls that realize it and the rows that accept it.
- Every asset, threat, risk, control and threat model row of the subject is explained with its STRIDE category and evidence.
- Every ISO/IEC 25010 record of the subject is listed with its characteristic and threshold.
- Every theorem of the subject is listed with its statement and proof method.
- The subject's system model and release manifest are explained, and how a holo is published.
- Every extension facet record of the subject is listed by its domain.
- A developer looks up every command and option of the subject's tool, read from its source, and the commands the subject's own gate runs.
- One slide per facet, with a script to read over it, introduces the subject in a talk.
- A developer finds any facet record by identifier, facet or text, and opens the pages that teach it.
- An agent reads the whole catalog as plain text through llms.txt, a Markdown twin of every page and a feed.
- Given a record index, the application answers the record identifier and the slugs of the resources that cover it.
