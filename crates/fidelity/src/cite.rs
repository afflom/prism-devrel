//! Citation: derive a record from the primary source that states its text.
//!
//! For every record no other writer derives, find, in the sources the
//! project lists, the smallest span of one file that holds each of the
//! record's text fields verbatim, and record it as a W3C PROV-O
//! `prov:wasDerivedFrom` of that span by this agent. A record whose text no
//! listed source states stays open on the derived axis: the remedy is to
//! state it in its primary source (the README, a manifest, the register), so
//! the model says what the repository says.

use std::fmt::Write as _;
use std::path::Path;

use devrel_catalog::lean::CHUNK;
use devrel_catalog::lextex::quote;

use crate::{score_ignoring, span_kappa, FidelityError, PROV};

/// The module the citations are written to.
pub const MODULE: &str = "Provenance";

/// The sources a project lists, one path or `dir/*suffix` pattern per quoted
/// string of `model/provenance.toml`'s `sources`, in priority order.
pub fn sources(repo: &Path, list: &str) -> Result<Vec<String>, FidelityError> {
    let mut out = Vec::new();
    let body = format!("\n{list}");
    let body = body
        .split_once("\nsources = [")
        .and_then(|(_, b)| b.split_once(']'))
        .map(|(b, _)| b)
        .ok_or_else(|| FidelityError::Register("model/provenance.toml has no sources".into()))?;
    for pattern in body.split('"').skip(1).step_by(2) {
        match pattern.rsplit_once("/*") {
            Some((dir, suffix)) => {
                let mut found: Vec<String> = std::fs::read_dir(repo.join(dir))
                    .map_err(|e| FidelityError::Io(repo.join(dir), e))?
                    .filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .filter(|n| n.ends_with(suffix))
                    .map(|n| format!("{dir}/{n}"))
                    .collect();
                found.sort();
                out.extend(found);
            }
            None => out.push(pattern.to_string()),
        }
    }
    out.dedup();
    Ok(out)
}

/// An agent a project names as the author of some of its sources: a
/// `[[author]]` table of `model/provenance.toml` with `name`, `kind`
/// (`person`, `organization` or `softwareAgent`) and `attributed`, the
/// sources it wrote (W3C PROV-O `prov:wasAttributedTo`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Author {
    /// Its name.
    pub name: String,
    /// Its PROV agent kind.
    pub kind: String,
    /// The sources attributed to it.
    pub attributed: Vec<String>,
}

/// The authors a project's source list names.
pub fn authors(list: &str) -> Result<Vec<Author>, FidelityError> {
    let mut out = Vec::new();
    for table in list.split("\n[[author]]").skip(1) {
        let table = table.split("\n[").next().unwrap_or("");
        let value = |key: &str| {
            table
                .lines()
                .find_map(|l| l.trim().strip_prefix(key)?.trim().strip_prefix('='))
                .map(|v| v.trim().to_string())
        };
        let text = |key: &str| {
            value(key)
                .and_then(|v| v.strip_prefix('"')?.strip_suffix('"').map(str::to_string))
                .ok_or_else(|| FidelityError::Register(format!("an [[author]] has no {key}")))
        };
        let kind = text("kind")?;
        if !["person", "organization", "softwareAgent"].contains(&kind.as_str()) {
            return Err(FidelityError::Register(format!(
                "an [[author]] has kind {kind:?}, not a W3C PROV-O agent kind"
            )));
        }
        let attributed = table
            .split_once("attributed = [")
            .and_then(|(_, b)| b.split_once(']'))
            .map(|(b, _)| {
                b.split('"')
                    .skip(1)
                    .step_by(2)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        out.push(Author {
            name: text("name")?,
            kind,
            attributed,
        });
    }
    Ok(out)
}

fn line_of(text: &str, byte: usize) -> usize {
    text[..byte].matches('\n').count() + 1
}

/// The smallest span `(first, last)` of `text` holding every one of `texts`.
fn smallest(text: &str, texts: &[String]) -> Option<(usize, usize)> {
    let occurrences: Vec<Vec<(usize, usize)>> = texts
        .iter()
        .map(|t| {
            text.match_indices(t.as_str())
                .map(|(at, m)| (line_of(text, at), line_of(text, at + m.len())))
                .collect::<Vec<_>>()
        })
        .collect();
    if occurrences.iter().any(Vec::is_empty) {
        return None;
    }
    let mut best: Option<(usize, usize)> = None;
    for &(first, last) in &occurrences[0] {
        let (mut lo, mut hi) = (first, last);
        for others in &occurrences[1..] {
            let nearest = others
                .iter()
                .min_by_key(|(a, b)| {
                    let lo2 = lo.min(*a);
                    let hi2 = hi.max(*b);
                    (hi2 - lo2, *a)
                })
                .copied()?;
            lo = lo.min(nearest.0);
            hi = hi.max(nearest.1);
        }
        if best.is_none_or(|(a, b)| hi - lo < b - a) {
            best = Some((lo, hi));
        }
    }
    best
}

/// The citation module's text, in the layout `lexlean fmt` keeps, and the
/// number of records it derives.
pub fn module(project: &Path, repo: &Path, list: &str) -> Result<(String, usize), FidelityError> {
    let score = score_ignoring(project, repo, &[MODULE, crate::FIDELITY_MODULE])?;
    let files = sources(repo, list)?;
    let mut texts = Vec::new();
    for f in &files {
        let path = repo.join(f);
        texts.push(std::fs::read_to_string(&path).map_err(|e| FidelityError::Io(path, e))?);
    }
    let open: std::collections::BTreeSet<&str> = score
        .residue
        .iter()
        .filter(|r| r.axis == crate::Axis::Derived)
        .map(|r| r.record.as_str())
        .collect();
    let mut entities: Vec<(String, usize, usize)> = Vec::new();
    let mut derivations: Vec<(String, usize)> = Vec::new();
    for record in &score.records {
        if !open.contains(record.id.as_str()) || record.texts.is_empty() {
            continue;
        }
        let mut best: Option<(usize, usize, usize)> = None;
        for (i, text) in texts.iter().enumerate() {
            if let Some((a, b)) = smallest(text, &record.texts) {
                if best.is_none_or(|(_, x, y)| b - a < y - x) {
                    best = Some((i, a, b));
                }
            }
        }
        if let Some((i, a, b)) = best {
            let entity = (files[i].clone(), a, b);
            let index = match entities.iter().position(|e| *e == entity) {
                Some(index) => index,
                None => {
                    entities.push(entity);
                    entities.len() - 1
                }
            };
            derivations.push((record.id.clone(), index));
        }
    }
    // A record no source states is derived from the records it references,
    // when those, or the records they reference in turn, hold its text.
    let ids: std::collections::BTreeSet<&str> =
        score.records.iter().map(|r| r.id.as_str()).collect();
    let by_id: std::collections::BTreeMap<&str, &crate::Record> =
        score.records.iter().map(|r| (r.id.as_str(), r)).collect();
    let cited: std::collections::BTreeSet<&str> =
        derivations.iter().map(|(r, _)| r.as_str()).collect();
    let mut record_derivations: Vec<(String, String)> = Vec::new();
    for record in &score.records {
        if !open.contains(record.id.as_str()) || cited.contains(record.id.as_str()) {
            continue;
        }
        let direct = crate::references(record, &ids);
        if direct.is_empty() {
            continue;
        }
        let mut reach: Vec<String> = direct.clone();
        let mut at = 0;
        while at < reach.len() {
            if let Some(r) = by_id.get(reach[at].as_str()) {
                for next in crate::references(r, &ids) {
                    if next != record.id && !reach.contains(&next) {
                        reach.push(next);
                    }
                }
            }
            at += 1;
        }
        let mut used = direct;
        let mut stated = true;
        for t in record.texts.iter().filter(|t| !ids.contains(t.as_str())) {
            let holder = reach.iter().find(|u| {
                by_id
                    .get(u.as_str())
                    .is_some_and(|r| r.texts.iter().any(|x| x.contains(t.as_str())))
            });
            match holder {
                Some(u) if !used.contains(u) => used.push(u.clone()),
                Some(_) => {}
                None => stated = false,
            }
        }
        if stated {
            record_derivations.extend(used.into_iter().map(|u| (record.id.clone(), u)));
        }
    }
    let authors = authors(list)?;
    let mut attributions: Vec<(usize, usize)> = Vec::new();
    for (i, (f, _, _)) in entities.iter().enumerate() {
        if let Some(a) = authors.iter().position(|a| a.attributed.contains(f)) {
            attributions.push((i, a + 1));
        }
    }
    let mut out = String::new();
    let _ = write!(
        out,
        "\\begin{{lexlean}}{{{MODULE}}}\n\\useglossary{{lexlean.std.bool@1.2.0}}\n\\useglossary{{lexlean.std.nat@1.2.0}}\n\\useglossary{{prism.arch@1.0.0}}\n\\importmodule{{{PROV}}}\n\\title{{Provenance of the model}}\n\\begin{{semanticmodule}}\n"
    );
    let mut agents = vec![format!(
        "(record {PROV}::Agent {{index := 0, name := \"prism-fidelity\", kind := (ctor {PROV}::AgentKind.softwareAgent)}})"
    )];
    for (i, a) in authors.iter().enumerate() {
        agents.push(format!(
            "(record {PROV}::Agent {{index := {}, name := {}, kind := (ctor {PROV}::AgentKind.{})}})",
            i + 1,
            quote(&a.name),
            a.kind
        ));
    }
    let agent_count = agents.len();
    // A long list is declared in parts joined by the model's append, as the
    // catalog does: the LexLean reader bounds how deep a `cons` chain nests.
    let mut list_of = |name: &str, ty: &str, items: Vec<String>| {
        let literal = |items: &[String]| {
            let mut body = format!("(nil {PROV}::{ty})");
            for item in items.iter().rev() {
                body = format!("(cons {item} {body})");
            }
            body
        };
        let mut define = |name: &str, body: &str| {
            let _ = writeln!(
                out,
                "definition{{\n  name: {name},\n  parameters: [],\n  result: (List {PROV}::{ty}),\n  body: {body}\n}}\n"
            );
        };
        if items.len() <= CHUNK {
            define(name, &literal(&items));
            return;
        }
        let append = format!("append{}s", ty.replace("Entity", ""));
        let mut body = format!("(nil {PROV}::{ty})");
        let parts: Vec<String> = items
            .chunks(CHUNK)
            .enumerate()
            .map(|(i, chunk)| {
                let part = format!("{name}Part{i}");
                define(&part, &literal(chunk));
                part
            })
            .collect();
        for part in parts.iter().rev() {
            body = format!("({PROV}::{append} ({part}) {body})");
        }
        define(name, &body);
    };
    list_of("agents", "Agent", agents);
    list_of(
        "activities",
        "Activity",
        vec![
            format!("(record {PROV}::Activity {{index := 0, name := \"cite each record's text from its primary source\", agentIndex := 0}})"),
            format!("(record {PROV}::Activity {{index := 1, name := \"derive each record from the records it references or quotes\", agentIndex := 0}})"),
        ],
    );
    list_of(
        "sources",
        "SourceEntity",
        entities
            .iter()
            .enumerate()
            .map(|(i, (f, a, b))| {
                let text = &texts[files.iter().position(|x| x == f).unwrap_or(0)];
                let span = crate::lines(text, *a, *b).unwrap_or_default();
                format!(
                    "(record {PROV}::SourceEntity {{index := {i}, location := {}, firstLine := {a}, lastLine := {b}, kappa := {}}})",
                    quote(f),
                    quote(&span_kappa(f, &span))
                )
            })
            .collect(),
    );
    list_of(
        "derivations",
        "Derivation",
        derivations
            .iter()
            .map(|(r, i)| {
                format!(
                    "(record {PROV}::Derivation {{generatedEntity := {}, usedEntityIndex := {i}, activityIndex := 0}})",
                    quote(r)
                )
            })
            .collect(),
    );
    list_of(
        "recordDerivations",
        "RecordDerivation",
        record_derivations
            .iter()
            .map(|(g, u)| {
                format!(
                    "(record {PROV}::RecordDerivation {{generatedEntity := {}, usedEntity := {}, activityIndex := 1}})",
                    quote(g),
                    quote(u)
                )
            })
            .collect(),
    );
    list_of(
        "attributions",
        "Attribution",
        attributions
            .iter()
            .map(|(e, a)| {
                format!("(record {PROV}::Attribution {{entityIndex := {e}, agentIndex := {a}}})")
            })
            .collect(),
    );
    let _ = write!(
        out,
        "theorem{{\n  name: everyCitationKnown,\n  parameters: [],\n  statement: (((({PROV}::activitiesKnown {agent_count} (activities)) && ({PROV}::derivationsKnown {} 2 (derivations))) && (({PROV}::recordDerivationsKnown 2 (recordDerivations)) && ({PROV}::attributionsKnown {} {agent_count} (attributions)))) = true),\n  proof: decide{{}}\n}}\n\\end{{semanticmodule}}\n\\end{{lexlean}}\n",
        entities.len(),
        entities.len()
    );
    let generated: std::collections::BTreeSet<&str> =
        record_derivations.iter().map(|(g, _)| g.as_str()).collect();
    Ok((out, derivations.len() + generated.len()))
}
