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
