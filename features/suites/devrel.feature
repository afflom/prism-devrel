Feature: devrel

  The DevRel catalog: the subject's facet records, the learning resources that
  teach them, and the coverage the Lean kernel decides over both.

  @DR-01 @build
  Scenario: Every facet record of the subject is covered by at least one resource, and every resource a cover names is declared
    Given the catalog app/src/Catalog.lex.tex generated from the pinned subject
    When the Lean kernel checks Catalog::catalogCovered during lexlean verify
    Then every subject record has a Covers row with at least one resource
    And every resource a row names is below the number of declared resources

  @DR-02 @build
  Scenario: A catalog with an uncovered record or a cover naming an undeclared resource is refused
    Given the committed catalog with its first record's cover removed, or a cover naming one resource past the last
    When the Lean kernel checks Catalog::uncoveredRecordRefused and Catalog::undeclaredResourceRefused
    Then catalogValid is false for both planted defects

  @DR-03 @build
  Scenario: The committed catalog is the catalog of the subject at the commit devrel/subject.json pins
    Given devrel/subject.json naming a repository, a full commit and a project path
    When pages.yml fetches exactly that commit and runs devrel-catalog with --check
    Then the regenerated Catalog.lex.tex equals the committed one byte for byte, or the run fails

  @DR-04 @build
  Scenario: Every page shows every record the catalog says it covers, and its Markdown twin quotes the same records
    Given the catalog of a Prism project with records in every facet
    When devrel-catalog renders the learning pages and their twins
    Then each resource page carries an anchor for every record it covers
    And its Markdown twin quotes every such record identifier

  @DR-05 @build
  Scenario: Subject text is escaped in every page and quoted as data in every twin
    Given a subject whose record text contains markup and instructions
    When devrel-catalog renders the pages
    Then no page contains the subject's markup unescaped
    And every twin quotes the subject's prose as a block quote

  @DR-06 @build
  Scenario: The lookup answers a record index with the record identifier, its facet and the pages that cover it, refuses malformed requests, and frames the workbench's answers as JSON
    Given the catalog, DevRel::dispatch and the workbench frames
    When it is asked for a record index, an index past the end, or a request that is empty, too long or not decimal, plainly or framed by the workbench
    Then it answers record, facet and page lines, refused unknown-record, or error invalid-request, and a framed request gets that answer as the page's JSON

  @DR-07 @build
  Scenario: A prompt is checked as prism-code checks a drafted spec, and every facet it adds is checked too; each refusal is typed and names its reason
    Given a prism/prompt/1 prompt, bare or as a tools/call of prism_prompt
    When builder/test.mjs DR-07 derives the model from the Rule 30 prompt and from prompts with one planted defect each
    Then the good prompt is accepted, and an example the rules contradict, a property with a counterexample, a spec with no field, an uncontrolled threat, an unknown STRIDE category, a misplaced ISO/IEC 25010 subcharacteristic, a journey step naming no rule, an undeclared concern and a call of another tool are each refused with a SpecError naming why

  @DR-08 @build
  Scenario: Every example prompt becomes every Prism facet, each facet module with the validity theorem the Lean kernel checks
    Given each prompt in examples/
    When builder/test.mjs DR-08 builds it
    Then its Architecture, Quality and Compliance modules prove their validity theorems, Design has OPM and UML views with a transition per rule, Features has a feature per rule and property and a journey per stakeholder, every threat is controlled or accepted, every property is a control's proof evidence, the request bound is a quality threshold, and records are numbered by identifier

  @DR-09 @build
  Scenario: A prompt becomes a whole repository created from UOR-Foundation/template: the app, its register rows, scenarios, tests, conformance table, page description and lock
    Given the Rule 30 prompt
    When builder/test.mjs DR-09 builds it
    Then every template file the app owns is written and the template's example is removed, each claim has a register row, a scenario, a test and a CONFORMANCE.md row, lexlean.lock binds lexlean.toml and the Lake files by SHA-256, and every module is an entrypoint

  @DR-10 @build
  Scenario: The same prompt and instant write the same bytes, and the download is a valid ZIP of them
    Given the Rule 30 prompt and one instant
    When builder/test.mjs DR-10 builds it twice and archives both
    Then the files and the archives are equal, the archive opens with a local file header and its end record counts every file, CRC-32 gives its check value, and another instant dates the control set differently

  @DR-11 @build
  Scenario: Every example is built from its prompt into a template instance whose own gate passes in the locked SDK before its page is published
    Given examples/gallery.json listing every prompt in examples/
    When pages.yml runs one job per example
    Then the builder writes the app into UOR-Foundation/template at the commit frame.lock pins, just vv passes there in the SDK prismpm.lock selects, and the page is written from that verified holo, or the run fails

  @DR-12 @build
  Scenario: The builder's vendored and packed copies equal their sources
    Given builder/assets/, the vendored prism-code journey and its VENDOR.md
    When builder/test.mjs DR-12 compares them
    Then assets.mjs is packed from assets/, each vendored file has the SHA-256 VENDOR.md records, and the app input of prism_prompt is the prism_spec input prism-code declares

  @DR-13 @build
  Scenario: An example page shows every record the prompt becomes, and prompt text is escaped in the page and quoted as data in its twin
    Given a Rule 30 prompt whose goal and stakeholder carry markup, a code fence and Markdown
    When builder/test.mjs DR-13 writes its page and twin
    Then no prompt text becomes markup, the twin's fence outruns every backtick run in the prompt, and every rule, property, stakeholder, concern, component, view, feature, threat, requirement, standard, claim and module is on the page

  @DR-14 @build
  Scenario: Every builder page is one Diátaxis documentation type and one stage of the developer journey, and the prompt reference is the MCP tool's own input schema
    Given the Diátaxis types of diataxis.fr and the journey stages Discover, Evaluate, Learn, Build and Scale of Lewko and Parton, Developer Relations
    When builder/test.mjs DR-14 writes the site and reads every page it wrote
    Then each page declares exactly one type and one stage, the tutorial, reference, explanation and how-to guides are separate pages, and the reference documents every member of prism_prompt and of its app spec

  @DR-15 @build
  Scenario: The tutorial runs the subject's tool on the subject's fixture with the commands its gate runs, and shows the committed projection's records, frontier and first lifted function; the CLI reference is the tool's clap declaration
    Given devrel/subject.json naming a Justfile recipe, a fixture workspace, the tool's source and the register rows the tutorial rests on
    When devrel-catalog reads the subject's checkout at the pinned commit
    Then the tutorial's commands are the recipe's lines for that fixture, its numbers are read from the committed projection and lift register, and its example is the first lifted function beside its definition
    And a checkout without the recipe, the fixture's check line, a claimed row or the clap declaration is refused rather than rendered

  @DR-16 @build
  Scenario: Every record value is shown as data: list and record literals as nested lists, and identifiers of records the catalog teaches as links to the page that teaches them; every page carries its Diátaxis type and journey stage
    Given a catalog whose records hold list literals, nested record literals and record identifiers
    When devrel-catalog renders the pages and their twins
    Then no list literal is shown as Lean source, each identifier links to its record's home page, and the twins nest the same values
    And every page names one Diátaxis type and one developer journey stage with the identifiers builder/site.mjs uses

  @DR-30 @build
  Scenario: Every documentation page shares one uor.foundation header, Diátaxis tabs and footer, grouped by journey stage, and no link between pages lands nowhere
    Given a site as the catalog and the builder write it, with devrel/site.json naming the Diátaxis types of diataxis.fr, the journey stages of Lewko and Parton and the uor.foundation brand
    When devrel/test.mjs DR-30 runs devrel/shell.mjs over it
    Then every page has the one header, tabs and footer, its own content, styles and scripts, a side navigation by journey stage and a list of its sections; the docs hub, llms.txt by type, the pages llms-full.txt and feed.xml lacked, sitemap.xml and the app page's docs link are written; and an unknown type or stage, an unclassified documentation page, a link or fragment that lands nowhere and a site already wrapped are each refused

  @DR-17 @build
  Scenario: A state-machine prompt is checked as an OMG UML 2.5.1 state machine, and its final states and reachable states become invariants of every run that the Lean kernel proves
    Given a door machine whose kick breaks it from any state and which never reaches welded from closed
    When builder/test.mjs DR-17 builds it
    Then the reachable states are read from every request, a final state is never left and no reachable state steps to welded as derived properties, each a theorem, a claim and the UML obligation's evidence, the machine has its own UML state-machine view with a transition per step, a partial sample claims no state unreachable, and answers that are not the states, an unknown initial state, a final state a step leaves, a missing machine and a number state are refused

  @DR-18 @build
  Scenario: Every app names the established pattern its behavior follows, a DMN 1.5 decision table, an XACML 3.0 policy decision or a UML 2.5.1 state machine, as a compliance obligation, and a policy decision answers exactly the four XACML decisions
    Given the Rule 30 prompt, a door policy and every example prompt
    When builder/test.mjs DR-18 derives their models
    Then a policy decision with other answers and an unknown pattern are refused, a prompt without a pattern is a decision table, and every example has exactly one obligation for its pattern's standard

  @DR-19 @build
  Scenario: The Prism source page shows every Foundation, Production and language module every built app carries, with each declaration and the word that denotes it, served byte for byte with its recorded upstream source
    Given builder/assets/ and builder/assets/provenance.json
    When builder/test.mjs DR-19 writes the site
    Then every carried file has a recorded source at a full commit and its SHA-256, every module is served as carried with every declaration listed, every language entry names what it denotes, and every vendored prism-code module is served with the digest VENDOR.md records

  @DR-20 @build
  Scenario: The how-to guides are grouped by pattern, and a state machine's page runs it from its initial state through the verified holo, each answer the next state
    Given every example prompt and the door machine
    When builder/test.mjs DR-20 writes the gallery and the door's page
    Then each example is in its pattern's group only, in the order the patterns are declared, and the door's page shows every transition and a run seeded from its examples that feeds each answer back as the next state and stops at a refused step

  @DR-40 @build
  Scenario: Prism-DevRel's brand identity and design system are read from uor.foundation: every Wheeler brand element and every W3C design token of the pinned site, each with its source span, and every text and focus colour the site sets on a surface meets its WCAG 2.2 contrast criterion
    Given uor.foundation as brand/foundation.lock pins it and the model in app/src/Brand.lex.tex
    When the suite exercises DR-40
    Then every brand element kind and every --fd- token of the site is a sourced record
    And every contrast's ratio, recomputed from the token colours, meets its WCAG 2.2 criterion

  @DR-41 @build
  Scenario: Prism-DevRel's context of use (ISO 9241-11) is read from its own model: every journey's actor is a user group, every journey a goal whose tasks are its steps in order and each accepted, every user-facing component a technical environment, and every goal's usability measured or recorded open
    Given the journeys, features and components of app/src and the model in app/src/Users.lex.tex
    When the suite exercises DR-41
    Then every journey is a goal of its actor's user group, with its steps as tasks in order
    And every goal has an effectiveness, an efficiency and a satisfaction measure
