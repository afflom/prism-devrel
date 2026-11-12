//! The brand, design and context-of-use facets (scripts/experience): one test
//! per register row. The Lean kernel proves the facets' theorems in prismpm
//! verify; these hold fixed what they are about: that every brand element kind
//! and every uor.foundation design token is a sourced record, that every
//! contrast is the ratio the token colours give and meets WCAG 2.2, and that
//! the context of use is the model's own journeys, steps and components.

use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/devrel is two below the root")
        .to_path_buf()
}

fn read(path: &str) -> String {
    std::fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))
}

/// The body of the top-level declaration named `name`, up to its closing brace.
fn declaration<'a>(model: &'a str, name: &str) -> &'a str {
    let start = model
        .find(&format!("\n  name: {name},\n"))
        .unwrap_or_else(|| panic!("{name} is not declared"));
    let end = model[start..]
        .find("\n}\n")
        .unwrap_or_else(|| panic!("{name} is not closed"));
    &model[start..start + end]
}

/// Every `definition{ name: N, ..., result: KIND, body: B }` of a module, as (N, B).
fn records_of(module: &str, kind: &str) -> Vec<(String, String)> {
    module
        .split("definition{\n  name: ")
        .skip(1)
        .filter(|d| d.contains(&format!("  result: {kind},\n")))
        .map(|d| {
            let name = d.split(',').next().expect("name").to_string();
            let body = d.split("  body: ").nth(1).expect("body");
            (
                name,
                body.split("\n}\n").next().expect("closed").to_string(),
            )
        })
        .collect()
}

/// Every `field := "text"` value in `body`, in order.
fn texts(body: &str, field: &str) -> Vec<String> {
    let marker = format!("{field} := \"");
    body.split(&marker)
        .skip(1)
        .map(|rest| {
            let mut out = String::new();
            let mut chars = rest.chars();
            while let Some(c) = chars.next() {
                match c {
                    '\\' => out.push(chars.next().expect("escape")),
                    '"' => break,
                    _ => out.push(c),
                }
            }
            out
        })
        .collect()
}

/// Every `field := N` value in `body`, in order.
fn naturals(body: &str, field: &str) -> Vec<u64> {
    let marker = format!("{field} := ");
    body.split(&marker)
        .skip(1)
        .map(|rest| {
            let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
            digits
                .parse()
                .unwrap_or_else(|_| panic!("{field} is not a number"))
        })
        .collect()
}

/// WCAG 2.2 relative luminance of a `#rrggbb` colour.
fn luminance(hex: &str) -> f64 {
    let channel = |at: usize| {
        let c = f64::from(u8::from_str_radix(&hex[at..at + 2], 16).expect("hex")) / 255.0;
        if c <= 0.040_45 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/// `DR-40`: Prism-DevRel's brand identity and design system are read from uor.foundation: every Wheeler brand element and every W3C design token of the pinned site, each with its source span, and every text and focus colour the site sets on a surface meets its WCAG 2.2 contrast criterion
#[test]
fn experience_dr_40() {
    let model = read("app/src/Foundation/Experience/V1/Model.lex.tex");
    let brand = read("app/src/Brand.lex.tex");
    let kinds: Vec<&str> = declaration(&model, "BrandElementKind")
        .lines()
        .filter_map(|l| l.trim().strip_prefix("{name: ")?.split(',').next())
        .collect();
    assert!(kinds.len() >= 11, "the Wheeler brand elements are declared");
    let elements = declaration(&brand, "elements");
    for kind in &kinds {
        assert!(
            elements.contains(&format!("BrandElementKind.{kind})")),
            "no brand element of kind {kind}"
        );
    }

    // Every custom property the site declares is a token, by name, in order.
    let css = read("brand/foundation/src/index.css");
    let declared: Vec<String> = css
        .lines()
        .filter_map(|l| l.trim().strip_prefix("--fd-"))
        .map(|l| format!("fd-{}", l.split(':').next().expect("name")))
        .collect();
    let tokens = declaration(&brand, "tokens");
    let names = texts(tokens, "name");
    assert!(!declared.is_empty());
    for name in &declared {
        assert!(names.contains(name), "--{name} is not a design token");
    }
    let sources = texts(declaration(&brand, "sources"), "kappa").len() as u64;
    for source in naturals(tokens, "source")
        .into_iter()
        .chain(naturals(elements, "source"))
    {
        assert!(
            source < sources,
            "a record names source {source} of {sources}"
        );
    }

    // The contrasts, recomputed here from the token colours: a planted
    // observation, a lowered criterion or a dropped pair fails.
    let hexes = texts(tokens, "hex");
    let contrasts = declaration(&brand, "contrasts");
    let rows: Vec<&str> = contrasts.split("(record ").skip(1).collect();
    assert!(!rows.is_empty(), "no contrast is measured");
    for row in rows {
        let fg = naturals(row, "foreground")[0] as usize;
        let bg = naturals(row, "background")[0] as usize;
        let alpha = naturals(row, "backgroundAlphaMilli")[0];
        let observed = naturals(row, "observedMilli")[0];
        let required = naturals(row, "requiredMilli")[0];
        let criterion = if row.contains("ContrastCriterion.text)") {
            4500
        } else {
            3000
        };
        assert_eq!(
            required, criterion,
            "a contrast's criterion is not WCAG 2.2's"
        );
        assert!(observed >= required, "a contrast is under its criterion");
        if alpha == 1000 {
            let (a, b) = (luminance(&hexes[fg]), luminance(&hexes[bg]));
            let ratio = (a.max(b) + 0.05) / (a.min(b) + 0.05);
            assert_eq!(
                observed,
                (ratio * 1000.0).floor() as u64,
                "{} on {} is not its measured ratio",
                names[fg],
                names[bg]
            );
        }
    }
    let theorem = declaration(&brand, "everyContrastMeetsItsCriterion");
    assert!(theorem.contains("contrastsMet (contrasts)") && theorem.contains("decide{}"));
}

/// `DR-41`: Prism-DevRel's context of use (ISO 9241-11) is read from its own model: every journey's actor is a user group, every journey a goal whose tasks are its steps in order and each accepted, every user-facing component a technical environment, and every goal's usability measured or recorded open
#[test]
fn experience_dr_41() {
    let features = read("app/src/Features.lex.tex");
    let architecture = read("app/src/Architecture.lex.tex");
    let users = read("app/src/Users.lex.tex");
    let journeys = records_of(&features, "Foundation.Arch::Journey");
    assert!(!journeys.is_empty());
    let groups = declaration(&users, "groups");
    let goals = declaration(&users, "goals");
    let tasks = declaration(&users, "tasks");
    let goal_rows: Vec<&str> = goals.split("(record ").skip(1).collect();
    assert_eq!(goal_rows.len(), journeys.len(), "every journey is one goal");
    for (at, (journey, body)) in journeys.iter().enumerate() {
        let actor = texts(body, "actor")[0].replace("Architecture::", "");
        assert!(
            groups.contains(&format!("(Architecture::{actor})")),
            "{actor} is no user group"
        );
        assert!(goal_rows[at].contains(&format!("(Features::{journey})")));
        let steps: Vec<String> = body
            .split("(cons \"Features::")
            .skip(1)
            .map(|s| s.split('"').next().expect("step").to_string())
            .collect();
        let mine: Vec<String> = tasks
            .split("(record ")
            .skip(1)
            .filter(|t| naturals(t, "goal")[0] == at as u64)
            .map(|t| {
                t.split("(Features::")
                    .nth(1)
                    .and_then(|s| s.split(')').next())
                    .expect("feature")
                    .to_string()
            })
            .collect();
        assert_eq!(mine, steps, "{journey}'s tasks are not its steps in order");
    }
    let environments = declaration(&users, "environments");
    for (component, body) in records_of(&architecture, "Foundation.Arch::Component") {
        let facing = ["releaseBinary", "cliAdapter", "staticSite"]
            .iter()
            .any(|k| body.contains(&format!("ComponentKind.{k})")));
        assert_eq!(
            facing,
            environments.contains(&format!("(Architecture::{component})")),
            "{component}: an environment exactly when it faces a user"
        );
    }
    let measures = declaration(&users, "measures");
    for outcome in ["effectiveness", "efficiency", "satisfaction"] {
        assert_eq!(
            measures
                .matches(&format!("UsabilityOutcome.{outcome})"))
                .count(),
            journeys.len(),
            "every goal has one {outcome} measure"
        );
    }
    for theorem in [
        "everyGoalHasItsUser",
        "everyTaskServesAGoal",
        "everyTaskIsAccepted",
    ] {
        assert!(declaration(&users, theorem).contains("decide{}"));
    }
}
