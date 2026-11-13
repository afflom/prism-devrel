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
  Scenario: The committed catalog is the catalog of the subject at the commit devrel/subjects.json pins
    Given devrel/subjects.json naming, for the catalog subject, a repository, a full commit and a project path
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
    Given devrel/subjects.json naming, for a subject, a Justfile recipe, a fixture workspace, the tool's source and the register rows the tutorial rests on
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

  @DR-31 @build
  Scenario: Example apps and case studies are collections with their own tabs: a page that names a collection is listed there, grouped by its collection group, and keeps its Diátaxis type and journey stage as labels
    Given a site whose example pages name the examples collection under their patterns, whose case study pages name the case-studies collection under their project, with a landing page for each, and a tutorial inside case-studies/ that names no collection
    When devrel/test.mjs DR-31 runs devrel/shell.mjs over it
    Then each collection has its own tab after the four Diátaxis tabs, its side navigation is its landing page then its groups in the order the generators list them, and its pages leave their type's tab but keep their type and stage as labels
    And the docs hub offers every tutorial and every collection as a way to start, lists each collection by group, and keeps collections out of its stage-by-type map, and llms.txt lists the collections after the types
    And an unknown collection, a collection named without its group and a collection without a landing page are each refused

  @DR-21 @build
  Scenario: Every pattern the builder offers has a how-to guide that builds an app of that pattern from a prompt, and every example page belongs to the Examples collection under its pattern
    Given every pattern in builder/prompt.mjs PATTERNS, every example prompt in examples/gallery.json and the example job of .github/workflows/pages.yml
    When builder/test.mjs DR-21 writes the site
    Then each pattern has guides/<pattern>/ titled "How to build a <pattern> app", a how-to guide for building in no collection, in numbered steps, whose worked prompt is the pattern's example with the fewest rules, checked with builder/cli.mjs and passed through the gate pages.yml runs, linking every example of the pattern
    And every example page and the gallery name the examples collection, under the pattern's plural name or Overview, keeping their Diátaxis type and journey stage, llms.txt lists the gallery then the examples in pattern order, and a guide that drops a pattern or a page that drops its collection fails the check

  @DR-22 @build
  Scenario: A prompt's brand is a prism/brand-lock/1 lock pinned to upstream commits: the app's page and its example page carry the brand's name, logo and W3C DTCG color and font tokens, every copied file is verified by its SHA-256 and a mismatch is refused, and a prompt without a brand builds as it always has
    Given builder/brands/chaoss-grimoirelab.brand.json, pinned to chaoss/grimoirelab and chaoss/community commits, with its copied files under builder/brands/files
    When builder/test.mjs DR-22 builds the rule 30 prompt with that brand and writes its example page
    Then site/card.css sets every color and font token as the template page's variables, the header shows the brand name and logo, site/app.json names the brand and its pins, every copied file is served with the digest the lock records, and the example page shows the logo and name in a section styled by the tokens
    And a changed byte, a missing file or a lock recording another digest is refused as a BrandDigestError, by the CLI with exit 2 and no file written, a lock of the wrong shape is refused before anything is read, and every gallery prompt builds with no brand file, member or stylesheet

  @DR-23 @build
  Scenario: A prompt's own compliance obligations follow the derived ones in the Compliance module, numbered in order and each naming its evidence, so everyObligationEvidenced holds of them all; an obligation without evidence or with a subject already used is refused, and a prompt without obligations builds as it always has
    Given the rule 30 prompt with a Developer Certificate of Origin 1.1 obligation and a Discord Developer Terms of Service obligation, each with its evidence
    When builder/test.mjs DR-23 builds it
    Then app/src/Compliance.lex.tex lists the derived obligations unchanged, then the prompt's in its order, every index in sequence from 0, with the theorem everyObligationEvidenced every app has
    And empty or blank evidence, a subject named twice or already derived, and a missing standard are refused, by the CLI with exit 2, and a prompt without obligations writes no obligations member and the module an empty list writes

  @DR-50 @build
  Scenario: Every subject in devrel/subjects.json has a case study under case-studies/<slug>/, read from every facet record of the subject at its pinned commit, or at the commit being built for the self subject, and the case studies index lists every subject
    Given a subjects file listing a pinned subject checked out under --checkouts and this repository as the self subject
    When devrel-catalog runs with --self-commit and --site, as pages.yml runs it
    Then each subject has an overview and a page per published resource under case-studies/<slug>/, in the case studies collection grouped by its name
    And its records.json lists every facet record of the subject in identifier order, at its pin or, for the self subject, at the commit being built
    And case-studies/index.html links to every subject and quotes what each subject's model says it is
    And a run without the commit being built, a self subject with a pin, a pinned subject without one, a slug listed twice, a catalog naming no subject and a missing checkout are each refused

  @DR-51 @build
  Scenario: Every Prism facet has a concept page that explains the facet from its standard and shows how each case study declares it, with record counts read from the subjects
    Given the catalogs of two subjects, this repository's model and a small fixture
    When devrel-catalog renders the site
    Then facets/<facet>/ exists for every facet as an explanation that cites the facet's standard at a pinned anchor and joins no collection
    And under each subject it counts the subject's records of the facet by kind and links the first record of each kind to where the case study teaches it
    And facets/ is a reference with a row per facet holding each subject's count

  @DR-52 @build
  Scenario: Every old learn/ address redirects to the page that replaced it, so no published link breaks
    Given the addresses the learn/ tree published: its hub, every resource's page, their Markdown twins and records.json
    When devrel-catalog renders the site with the catalog subject as the one learn/ described
    Then every old page address is a page that refreshes to, links to and names as canonical the case study page that replaced it, carries no Diátaxis type or journey stage and asks not to be indexed
    And every old twin and records.json is a copy of its replacement, so a client fetching it still reads what it asked for

  @DR-53 @build
  Scenario: Every subject pin moves only forward, to the newest main commit whose gate workflow passed, and the catalogs are regenerated from the new pins without anyone editing them
    Given devrel/subjects.json with pinned subjects whose newest green gate run on main is ahead of the pin, the pin itself, behind it, on a diverged history, missing, or unreachable through the GitHub API
    When scripts/repin.sh runs against those recorded API responses
    Then only the subject whose green commit is ahead moves, to exactly that commit, every other pin stays with one line saying why, and the file keeps its two-space formatting
    And generate.yml runs repin before just generate, whose writers include the catalog, and pushes devrel/subjects.json with what it regenerated
