//! The documentation shell's suite: `devrel/test.mjs` checks, one per register
//! row. Each test runs `node devrel/test.mjs <ID>` and requires it to pass and to
//! report how many assertions it made, so a case that checks nothing fails too.

use std::path::PathBuf;
use std::process::Command;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/devrel is two below the root")
        .to_path_buf()
}

fn shell(id: &str) -> usize {
    let out = Command::new("node")
        .arg("devrel/test.mjs")
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

/// `DR-30`: Every documentation page shares one uor.foundation header, Diátaxis tabs and footer, grouped by journey stage, and no link between pages lands nowhere
#[test]
fn shell_dr_30() {
    shell("DR-30");
}

/// `DR-31`: Example apps and case studies are collections with their own tabs: a page that names a collection is listed there, grouped by its collection group, and keeps its Diátaxis type and journey stage as labels
#[test]
fn devrel_dr_31() {
    shell("DR-31");
}
