//! The fidelity scorer's conformance rows, `FI-01` to `FI-03`.

use std::path::{Path, PathBuf};

use prism_fidelity::{file_kappa, lean, score, span_kappa, Axis, Register};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repository root")
}

const SOURCE: &str =
    "# Charter\nMaintainer: The maintainer keeps the catalog true.\nAnother line.\n";

fn module(name: &str, body: &str) -> String {
    format!("\\begin{{lexlean}}{{{name}}}\n\\title{{t}}\n\\begin{{semanticmodule}}\n{body}\\end{{semanticmodule}}\n\\end{{lexlean}}\n")
}

/// A project with four records: `stakeholderMaintainer` derived from line 2
/// of `charter.md`, `concernTruth` named by a theorem, `measureOpen` with a
/// measurement result, and `componentBare` with nothing.
fn project(dir: &Path, kappa: &str, derive: bool) {
    let src = dir.join("app/src");
    std::fs::create_dir_all(&src).unwrap();
    std::fs::write(dir.join("charter.md"), SOURCE).unwrap();
    std::fs::write(dir.join("measure.txt"), "3\n").unwrap();
    let measure_kappa = file_kappa("measure.txt", b"3\n");
    let records = "\
definition{name: stakeholderMaintainer, parameters: [], result: Foundation.Arch::Stakeholder, body: (record Foundation.Arch::Stakeholder {index := 0, name := \"Maintainer\", text := \"The maintainer keeps the catalog true.\"})}
definition{name: concernTruth, parameters: [], result: Foundation.Arch::Concern, body: (record Foundation.Arch::Concern {index := 0, name := \"Truth\", text := \"x\"})}
definition{name: measureOpen, parameters: [], result: Foundation.Qual::QualityMeasure, body: (record Foundation.Qual::QualityMeasure {index := 0, requirementIndex := 0, threshold := 0})}
definition{name: componentBare, parameters: [], result: Foundation.Arch::Component, body: (record Foundation.Arch::Component {index := 0, name := \"Bare\", text := \"y\"})}
theorem{name: truthHolds, parameters: [], statement: ((project (concernTruth) index) = 0), proof: decide{}}
";
    std::fs::write(
        src.join("Architecture.lex.tex"),
        module("Architecture", records),
    )
    .unwrap();
    let derivation = if derive {
        "(cons (record Foundation.Provenance.V1.Model::Derivation {generatedEntity := \"Architecture::stakeholderMaintainer\", usedEntityIndex := 0, activityIndex := 0}) (nil Foundation.Provenance.V1.Model::Derivation))"
    } else {
        "(nil Foundation.Provenance.V1.Model::Derivation)"
    };
    let prov = format!(
        "definition{{name: sources, parameters: [], result: (List Foundation.Provenance.V1.Model::SourceEntity), body: (cons (record Foundation.Provenance.V1.Model::SourceEntity {{index := 0, location := \"charter.md\", firstLine := 2, lastLine := 2, kappa := \"{kappa}\"}}) (nil Foundation.Provenance.V1.Model::SourceEntity))}}
definition{{name: derivations, parameters: [], result: (List Foundation.Provenance.V1.Model::Derivation), body: {derivation}}}
definition{{name: indicators, parameters: [], result: (List Foundation.Measurement.V1.Model::Indicator), body: (cons (record Foundation.Measurement.V1.Model::Indicator {{index := 0, name := \"Architecture::measureOpen\", conceptIndex := 0, derivedMeasureIndex := 0, analysisModel := \"a\", criteriaIndex := 0}}) (nil Foundation.Measurement.V1.Model::Indicator))}}
definition{{name: results, parameters: [], result: (List Foundation.Measurement.V1.Model::MeasurementResult), body: (cons (record Foundation.Measurement.V1.Model::MeasurementResult {{indicatorIndex := 0, value := 3, source := \"measure.txt\", kappa := \"{measure_kappa}\"}}) (nil Foundation.Measurement.V1.Model::MeasurementResult))}}
"
    );
    std::fs::write(src.join("Provenance.lex.tex"), module("Provenance", &prov)).unwrap();
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("prism-fidelity-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn open(score: &prism_fidelity::Score, record: &str, axis: Axis) -> bool {
    score
        .residue
        .iter()
        .any(|r| r.record == record && r.axis == axis)
}

/// `FI-01`: every record is scored on derived, meant and measured, and a false
/// provenance or measurement row is refused.
#[test]
fn scored_against_standards_fi_01() {
    let dir = scratch("fi01");
    let good = span_kappa(
        "charter.md",
        "Maintainer: The maintainer keeps the catalog true.",
    );
    project(&dir, &good, true);
    let s = score(&dir.join("app"), &dir).expect("scores");
    assert_eq!(s.records.len(), 4);
    assert!(!open(
        &s,
        "Architecture::stakeholderMaintainer",
        Axis::Derived
    ));
    assert!(open(&s, "Architecture::concernTruth", Axis::Derived));
    assert!(!open(&s, "Architecture::concernTruth", Axis::Meant));
    assert!(open(&s, "Architecture::componentBare", Axis::Meant));
    assert!(!open(&s, "Architecture::measureOpen", Axis::Measured));
    assert!(
        !s.residue
            .iter()
            .chain(&s.closed)
            .any(|r| r.record == "Architecture::componentBare" && r.axis == Axis::Measured),
        "only measures are asked the measured question"
    );

    // A κ that does not recompute is a false claim.
    project(&dir, &"0".repeat(64), true);
    let err = score(&dir.join("app"), &dir).expect_err("refused");
    assert!(err.to_string().contains("κ"), "{err}");

    // A span that does not hold the record's text is a false claim.
    let other = span_kappa("charter.md", "Another line.");
    project(&dir, &other, true);
    let text = std::fs::read_to_string(dir.join("app/src/Provenance.lex.tex")).unwrap();
    std::fs::write(
        dir.join("app/src/Provenance.lex.tex"),
        text.replace(
            "firstLine := 2, lastLine := 2",
            "firstLine := 3, lastLine := 3",
        ),
    )
    .unwrap();
    let err = score(&dir.join("app"), &dir).expect_err("refused");
    assert!(err.to_string().contains("do not contain its text"), "{err}");
    let _ = std::fs::remove_dir_all(&dir);
}

/// `FI-02`: a closed κ never reopens, and the committed register is the one
/// the model scores to.
#[test]
fn register_only_shrinks_fi_02() {
    let dir = scratch("fi02");
    let good = span_kappa(
        "charter.md",
        "Maintainer: The maintainer keeps the catalog true.",
    );
    project(&dir, &good, true);
    let first = score(&dir.join("app"), &dir).unwrap();
    let reg = Register::next(&Register::default(), &first).unwrap();
    assert_eq!(
        Register::parse(&reg.render()).unwrap(),
        reg,
        "the register round-trips"
    );
    project(&dir, &good, false);
    let second = score(&dir.join("app"), &dir).unwrap();
    let err = Register::next(&reg, &second).expect_err("reopening refused");
    assert!(
        err.to_string()
            .contains("Architecture::stakeholderMaintainer")
            && err.to_string().contains("derived"),
        "{err}"
    );
    let _ = std::fs::remove_dir_all(&dir);

    // The committed register and measurement data are what the model scores to.
    let repo = root();
    let s = score(&repo.join("app"), &repo).unwrap();
    let committed = std::fs::read_to_string(repo.join("fidelity.toml")).unwrap();
    let previous = Register::parse(&committed).unwrap();
    let next = Register::next(&previous, &s).unwrap().render();
    assert_eq!(
        committed, next,
        "fidelity.toml is stale: run `just fidelity-write`"
    );
    let lean_text = lean::module(
        &s,
        "fidelity.toml",
        &file_kappa("fidelity.toml", next.as_bytes()),
    );
    assert_eq!(
        std::fs::read_to_string(repo.join("app/src/Fidelity.lex.tex")).unwrap(),
        lean_text,
        "app/src/Fidelity.lex.tex is stale: run `just fidelity-write`"
    );
}

/// `FI-03`: one 15939 indicator per property, each with a result read from the
/// committed register by its κ, the value its open count.
#[test]
fn own_fidelity_measured_fi_03() {
    let repo = root();
    let text = std::fs::read_to_string(repo.join("app/src/Fidelity.lex.tex")).unwrap();
    let register = std::fs::read(repo.join("fidelity.toml")).unwrap();
    let kappa = file_kappa("fidelity.toml", &register);
    let s = score(&repo.join("app"), &repo).unwrap();
    for (i, axis) in Axis::ALL.into_iter().enumerate() {
        let row = format!(
            "indicatorIndex := {i}, value := {}, source := \"fidelity.toml\", kappa := \"{kappa}\"",
            s.open(axis)
        );
        assert!(text.contains(&row), "no result for {}: {row}", axis.name());
    }
    assert!(text.contains("name: indicatorsKnown"));
    assert!(text.contains("name: everyIndicatorMeasured"));
    let lexlean = std::fs::read_to_string(repo.join("app/lexlean.toml")).unwrap();
    assert!(
        lexlean.contains("\"src/Fidelity.lex.tex\""),
        "the Lean kernel checks the module"
    );
}
