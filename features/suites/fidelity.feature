Feature: fidelity

  How deeply a Prism model states what it claims. Each record is scored on
  properties taken from existing standards: derived (W3C PROV-O), meant
  (ISO/IEC/IEEE 29148) and measured (ISO/IEC/IEEE 15939), and the open
  questions are kept in a register that only shrinks.

  @FI-01 @build
  Scenario: Every record of a Prism project is scored as derived (W3C PROV-O wasDerivedFrom a source span whose κ recomputes and which holds its text), meant (a theorem names it, ISO/IEC/IEEE 29148) and, for a measure, measured (an ISO/IEC/IEEE 15939 measurement result whose κ recomputes); a source entity or result whose κ does not recompute is refused, and a span that does not hold the record's text verbatim leaves it underived
    Given a Prism project with a record derived from a source span, one named by a theorem, a quality measure with a measurement result, and one with none of these
    When prism-fidelity scores it
    Then each record's questions are closed or open exactly as its rows and theorems say
    And a source entity whose κ does not recompute is refused
    And a record derived from a span that does not hold its text verbatim stays open on the derived axis

  @FI-02 @build
  Scenario: The fidelity register only shrinks: every question is keyed by its κ, a κ once closed that a later projection finds open is refused, and the committed register is byte for byte the one the model scores to
    Given a register in which a record's derived question is closed
    When the record's derivation is removed and the project is scored again
    Then the next register is refused, naming the record and the axis
    And the committed fidelity.toml and app/src/Fidelity.lex.tex equal what prism-fidelity writes for app/

  @FI-03 @build
  Scenario: Prism-DevRel's own fidelity is measured in its model: one ISO/IEC/IEEE 15939 indicator per property, each with a result read from the committed register by its κ and decision criteria of no open question, and the Lean kernel checks every indicator is known and measured
    Given app/src/Fidelity.lex.tex written by prism-fidelity from app/
    When the Lean kernel checks Fidelity::indicatorsKnown and Fidelity::everyIndicatorMeasured during lexlean verify
    Then there is one indicator per property, each with a result whose value is the register's open count on that axis
    And every result's κ recomputes from fidelity.toml

  @FI-04 @build
  Scenario: A record no writer derives is cited from the smallest span of a primary source listed in model/provenance.toml that holds every text field of it verbatim, as a W3C PROV-O derivation by prism-fidelity; a record no listed source states stays open, and the committed citations are the ones the sources give
    Given a project whose stakeholder text is stated in charter.md and whose component text is stated nowhere
    When prism-fidelity cites it from the sources model/provenance.toml lists
    Then the stakeholder is derived from the one line of charter.md that states it
    And the component stays open on the derived axis
    And app/src/Provenance.lex.tex is what prism-fidelity cites for app/

  @FI-05 @build
  Scenario: Every quality measure model/measures.toml lists is measured by the Lean kernel: its ISO/IEC/IEEE 15939 indicator's result is the value of a LexLean method, the decision criteria's bound is the measure's own threshold, the result carries the κ of the method's file, and a theorem that the value satisfies the criteria is checked
    Given model/measures.toml and the methods in app/src/Measures.lex.tex
    When prism-fidelity writes app/src/Fidelity.lex.tex and the Lean kernel checks it
    Then each listed measure has an indicator named for it, criteria bounded by its threshold and a result whose value is its method
    And a theorem that the value satisfies the criteria is decided for each
    And the measure is closed on the measured axis of the register

  @FI-06 @build
  Scenario: A record no listed source states is derived, as a W3C PROV-O derivation between records, from the records it references or that quote its text; it is closed on the derived axis only when every record it is derived from is, and a record derivation that neither references nor quotes is refused
    Given a record that references a record cited from a source
    When prism-fidelity cites the project and scores it
    Then the record is derived from the record it references
    And it is closed only when the record it is derived from is closed
    And a derivation from a record it neither references nor quotes is refused

  @FI-07 @build
  Scenario: Each source an [[author]] of model/provenance.toml wrote is attributed to that W3C PROV-O agent, and the charter that states Prism-DevRel's purpose is attributed to a person
    Given model/provenance.toml names the author of model/charter.md
    When prism-fidelity cites the project
    Then every source entity of the charter is attributed to that agent
    And the agent is a person
