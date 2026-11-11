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
  Scenario: The lookup answers a record index with the record identifier and the slugs of the resources that cover it, and refuses malformed requests
    Given the catalog and Foundation.DevRel.V1.Model::lookup
    When it is asked for a record index, an index past the end, or a request that is empty, too long or not decimal
    Then it answers the record identifier and its covering slugs, unknown record, or invalid request
