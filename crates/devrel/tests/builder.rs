//! The builder suite: `builder/test.mjs` checks, one per register row. Each test
//! runs `node builder/test.mjs <ID>` and requires it to pass and to report how
//! many assertions it made, so a case that checks nothing fails too.

use std::path::PathBuf;
use std::process::Command;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/devrel is two below the root")
        .to_path_buf()
}

/// Runs the builder's check for `id` and returns the number of assertions it made.
fn builder(id: &str) -> usize {
    let out = Command::new("node")
        .arg("builder/test.mjs")
        .arg(id)
        .current_dir(root())
        .output()
        .expect("node runs");
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(
        out.status.success(),
        "{id} failed:\n{stdout}\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let made = stdout
        .trim()
        .strip_prefix(&format!("{id}: "))
        .and_then(|rest| rest.strip_suffix(" assertions passed"))
        .and_then(|n| n.parse::<usize>().ok())
        .unwrap_or_else(|| panic!("{id} did not report its assertions: {stdout}"));
    assert!(made > 0, "{id} made no assertion");
    made
}

/// `DR-07`: A prompt is checked as prism-code checks a drafted spec, and every facet it adds is checked too; each refusal is typed and names its reason
#[test]
fn contract_dr_07() {
    builder("DR-07");
}

/// `DR-08`: Every example prompt becomes every Prism facet, each facet module with the validity theorem the Lean kernel checks
#[test]
fn facets_dr_08() {
    builder("DR-08");
}

/// `DR-09`: A prompt becomes a whole repository created from UOR-Foundation/template: the app, its register rows, scenarios, tests, conformance table, page description and lock
#[test]
fn instance_dr_09() {
    builder("DR-09");
}

/// `DR-10`: The same prompt and instant write the same bytes, and the download is a valid ZIP of them
#[test]
fn deterministic_dr_10() {
    builder("DR-10");
}

/// `DR-11`: Every example is built from its prompt into a template instance whose own gate passes in the locked SDK before its page is published
#[test]
fn examples_dr_11() {
    builder("DR-11");
}

/// `DR-12`: The builder's vendored and packed copies equal their sources
#[test]
fn vendored_dr_12() {
    builder("DR-12");
}

/// `DR-13`: An example page shows every record the prompt becomes, and prompt text is escaped in the page and quoted as data in its twin
#[test]
fn pages_dr_13() {
    builder("DR-13");
}

/// `DR-14`: Every builder page is one Diátaxis documentation type and one stage of the developer journey, and the prompt reference is the MCP tool's own input schema
#[test]
fn frameworks_dr_14() {
    builder("DR-14");
}

/// `DR-17`: A state-machine prompt is checked as an OMG UML 2.5.1 state machine, and its final states and reachable states become invariants of every run that the Lean kernel proves
#[test]
fn machine_dr_17() {
    builder("DR-17");
}

/// `DR-18`: Every app names the established pattern its behavior follows, a DMN 1.5 decision table, an XACML 3.0 policy decision or a UML 2.5.1 state machine, as a compliance obligation, and a policy decision answers exactly the four XACML decisions
#[test]
fn patterns_dr_18() {
    builder("DR-18");
}

/// `DR-19`: The Prism source page shows every Foundation, Production and language module every built app carries, with each declaration and the word that denotes it, served byte for byte with its recorded upstream source
#[test]
fn source_dr_19() {
    builder("DR-19");
}

/// `DR-20`: The how-to guides are grouped by pattern, and a state machine's page runs it from its initial state through the verified holo, each answer the next state
#[test]
fn gallery_dr_20() {
    builder("DR-20");
}
