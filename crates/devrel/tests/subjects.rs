//! The subject pins (DR-53): `scripts/repin.sh` against recorded GitHub API
//! responses, so the rule is checked without the network, and the wiring that
//! regenerates the catalogs from whatever it pins.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::{json, Value};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/devrel is two below the root")
        .to_path_buf()
}

/// A full commit made of one repeated hex digit.
fn sha(digit: char) -> String {
    digit.to_string().repeat(40)
}

fn runs(repo: &str, gate: &str) -> String {
    format!("repos/{repo}/actions/workflows/{gate}/runs?branch=main&status=success&per_page=1")
}

fn green(head: &str) -> Value {
    json!({ "total_count": 1, "workflow_runs": [{ "head_sha": head, "conclusion": "success" }] })
}

/// Writes `subjects` and `fixtures` into a fresh directory, runs repin.sh over
/// them and returns the rewritten subjects file and what it printed.
fn repin(name: &str, subjects: &str, fixtures: &Value) -> (String, String) {
    let dir = Path::new(env!("CARGO_TARGET_TMPDIR")).join(format!("repin-{name}"));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("a scratch directory");
    let file = dir.join("subjects.json");
    fs::write(&file, subjects).expect("subjects written");
    let api = dir.join("api.json");
    fs::write(&api, fixtures.to_string()).expect("fixtures written");
    let out = Command::new("bash")
        .arg("scripts/repin.sh")
        .current_dir(root())
        .env("REPIN_SUBJECTS", &file)
        .env("REPIN_API_FIXTURES", &api)
        .env_remove("GITHUB_ACTIONS")
        .output()
        .expect("bash runs");
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    assert!(
        out.status.success(),
        "repin failed:\n{stdout}\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    (
        fs::read_to_string(&file).expect("subjects read back"),
        stdout,
    )
}

fn subject(slug: &str, commit: &str) -> Value {
    json!({
        "slug": slug,
        "name": slug,
        "repository": format!("https://github.com/example/{slug}"),
        "commit": commit,
        "path": "app",
        "gate": "gate.yml"
    })
}

/// Two-space JSON and a newline, as repin.sh writes it.
fn pretty(value: &Value) -> String {
    format!(
        "{}\n",
        serde_json::to_string_pretty(value).expect("serialisable")
    )
}

/// `DR-53`: Every subject pin moves only forward, to the newest main commit whose gate workflow passed, and the catalogs are regenerated from the new pins without anyone editing them
#[test]
fn subjects_dr_53() {
    // Six subjects, one per case; keys are already in serde_json's order, so
    // the file is written exactly as repin.sh writes it.
    let pin = sha('a');
    let cases = ["forward", "same", "behind", "diverged", "red", "offline"];
    let mut list: Vec<Value> = cases.iter().map(|c| subject(c, &pin)).collect();
    list.push(json!({ "name": "Self", "path": "app", "repository": "https://github.com/example/self", "self": true, "slug": "self" }));
    let config = json!({ "about": "test", "learn": "forward", "spec": "prism-devrel/subjects/1", "subjects": list });
    let before = pretty(&config);

    let repo = |c: &str| format!("example/{c}");
    let compare = |c: &str, to: &str| format!("repos/{}/compare/{pin}...{to}", repo(c));
    let mut api = serde_json::Map::new();
    // Forward: the newest green commit descends from the pin.
    api.insert(runs(&repo("forward"), "gate.yml"), green(&sha('b')));
    api.insert(compare("forward", &sha('b')), json!({ "status": "ahead" }));
    // The newest green commit is the pin.
    api.insert(runs(&repo("same"), "gate.yml"), green(&pin));
    // The newest green commit is older than the pin, or on another history.
    api.insert(runs(&repo("behind"), "gate.yml"), green(&sha('c')));
    api.insert(compare("behind", &sha('c')), json!({ "status": "behind" }));
    api.insert(runs(&repo("diverged"), "gate.yml"), green(&sha('d')));
    api.insert(
        compare("diverged", &sha('d')),
        json!({ "status": "diverged" }),
    );
    // No run of the gate on main has passed.
    api.insert(
        runs(&repo("red"), "gate.yml"),
        json!({ "total_count": 0, "workflow_runs": [] }),
    );
    // "offline" has no recorded response: its API call fails.
    let (after, said) = repin("cases", &before, &Value::Object(api));

    // Only the forward subject moved, to exactly the green commit, and nothing
    // else in the file changed, its formatting included.
    let mut want = config.clone();
    want["subjects"][0]["commit"] = json!(sha('b'));
    assert_eq!(after, pretty(&want), "only the forward pin moves:\n{said}");
    let lines: Vec<&str> = said.lines().collect();
    assert_eq!(
        lines.len(),
        cases.len(),
        "one line per pinned subject: {said}"
    );
    for (case, line) in cases.iter().zip(&lines) {
        assert!(line.contains(case), "{case}'s line is {line}");
    }
    assert!(lines[0].contains(&format!("{pin} -> {}", sha('b'))));
    assert!(lines[2].contains("behind") && lines[2].contains("the pin stays"));
    assert!(lines[3].contains("diverged") && lines[3].contains("the pin stays"));
    assert!(lines[4].contains("no green gate.yml run"));
    assert!(lines[5].contains("the GitHub API failed"));

    // The committed subjects file round-trips byte for byte when every
    // subject's newest green commit is its pin: repin keeps its formatting.
    let committed = fs::read_to_string(root().join("devrel/subjects.json")).expect("subjects.json");
    let parsed: Value = serde_json::from_str(&committed).expect("subjects.json is JSON");
    let mut api = serde_json::Map::new();
    let mut pinned = 0;
    for s in parsed["subjects"].as_array().expect("a subjects list") {
        if s["self"] == json!(true) {
            assert!(s.get("commit").is_none(), "the self subject has no pin");
            continue;
        }
        let repo = s["repository"].as_str().expect("a repository");
        let repo = repo.strip_prefix("https://github.com/").expect("on GitHub");
        let gate = s["gate"]
            .as_str()
            .expect("every pinned subject names its gate");
        let commit = s["commit"].as_str().expect("a pin");
        assert!(
            commit.len() == 40 && commit.bytes().all(|b| b.is_ascii_hexdigit()),
            "{repo} is pinned to a full commit"
        );
        api.insert(runs(repo, gate), green(commit));
        pinned += 1;
    }
    let (after, said) = repin("committed", &committed, &Value::Object(api));
    assert_eq!(
        after, committed,
        "repin rewrote devrel/subjects.json:\n{said}"
    );
    assert_eq!(said.lines().count(), pinned);

    // The catalogs follow the pins with no hand in between: generate.yml
    // re-pins every subject, then runs `just generate`, whose writers include
    // the catalog, and pushes the subjects file with what it regenerated.
    let justfile = fs::read_to_string(root().join("Justfile")).expect("Justfile");
    let generate = justfile
        .lines()
        .find(|l| l.starts_with("generate:"))
        .expect("a generate recipe");
    assert!(
        generate.split_whitespace().any(|w| w == "catalog"),
        "{generate}"
    );
    assert!(justfile.contains("catalog:\n    scripts/catalog.sh"));
    let workflow =
        fs::read_to_string(root().join(".github/workflows/generate.yml")).expect("generate.yml");
    let repinned = workflow
        .find("run: scripts/repin.sh")
        .expect("generate.yml re-pins");
    let regenerated = workflow
        .find("'just generate'")
        .expect("generate.yml regenerates");
    assert!(
        repinned < regenerated,
        "the pins move before the catalogs regenerate"
    );
    assert!(
        workflow.contains("cron:"),
        "generate.yml runs on a schedule"
    );
    let pushed = workflow
        .find("scripts/ci/push.sh")
        .expect("generate.yml pushes");
    let list = &workflow[pushed..];
    assert!(list.contains("devrel/subjects.json") && list.contains(" app "));
    let catalog = fs::read_to_string(root().join("scripts/catalog.sh")).expect("catalog.sh");
    assert!(
        catalog.contains("scripts/subjects.sh")
            && catalog.contains("--subjects devrel/subjects.json")
    );
}
