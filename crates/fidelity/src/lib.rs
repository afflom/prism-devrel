//! Fidelity: how deeply a Prism project models what it claims.
//!
//! Every record of a project (a parameterless definition whose body is a
//! record literal, or each record of one whose body is a list of them, outside the standard library and outside the project's own
//! `Fidelity` module) is scored on four properties, each taken from an
//! existing standard rather than invented here:
//!
//! * **Derived** (W3C PROV-O, `prov:wasDerivedFrom`): a
//!   `Foundation.Provenance.V1.Model::Derivation` names the record as its
//!   generated entity, the `SourceEntity` it used is a line span of a file in
//!   the repository whose κ recomputes from the bytes, and every text field of
//!   the record occurs verbatim in that span.
//! * **Meant** (ISO/IEC/IEEE 29148, traceable and verifiable): some theorem
//!   of the project, which the Lean kernel checks, states something about the
//!   record by naming its declaration.
//! * **Measured** (ISO/IEC/IEEE 15939, measurement information model): only
//!   for quality measures and indicators. An `Indicator` is named after the
//!   record and has a `MeasurementResult` whose κ recomputes from the file it
//!   was read from.
//! * **Closed** (15939 decision criteria, applied as a ratchet): every open
//!   question is a residue row keyed by κ in `fidelity.toml`; a κ once closed
//!   never returns as residue.
//!
//! A false claim (a κ that does not recompute, a text field that is not in its
//! span, a derivation of a record that does not exist) is an error, not
//! residue: residue is what the model has not yet said, never what it says
//! wrongly.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{self, Write as _};
use std::path::{Path, PathBuf};

use devrel_catalog::lextex;

pub mod cite;
use sha2::{Digest, Sha256};

/// The register's format.
pub const SPEC: &str = "prism/fidelity/1";
/// The module a project's fidelity data lives in; it is not scored itself.
pub const FIDELITY_MODULE: &str = "Fidelity";
const PROV: &str = "Foundation.Provenance.V1.Model";
const MEAS: &str = "Foundation.Measurement.V1.Model";

/// One of the four properties.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Axis {
    /// W3C PROV-O derivation from a source span.
    Derived,
    /// ISO/IEC/IEEE 29148 verification by a theorem.
    Meant,
    /// ISO/IEC/IEEE 15939 measurement result.
    Measured,
}

impl Axis {
    /// Every axis, in register order.
    pub const ALL: [Axis; 3] = [Axis::Derived, Axis::Meant, Axis::Measured];

    /// The axis's name in the register.
    pub fn name(self) -> &'static str {
        match self {
            Axis::Derived => "derived",
            Axis::Meant => "meant",
            Axis::Measured => "measured",
        }
    }

    fn parse(text: &str) -> Option<Axis> {
        Axis::ALL.into_iter().find(|a| a.name() == text)
    }
}

/// A record of the project.
#[derive(Clone, Debug)]
pub struct Record {
    /// `Module::declaration`, or `Module::declaration#i` for the `i`th
    /// record of a list.
    pub id: String,
    /// Its declaration name.
    pub name: String,
    /// Its result type's short name.
    pub kind: String,
    /// Its text fields, decoded.
    pub texts: Vec<String>,
    /// The declaration's source text, whitespace-normalized: the question's
    /// content, so a changed record is a new question.
    pub normalized: String,
    /// Its source file, relative to the repository root.
    pub source: String,
}

/// What is wrong, as opposed to what is open.
#[derive(Debug)]
pub enum FidelityError {
    /// A file could not be read.
    Io(PathBuf, std::io::Error),
    /// A module could not be read.
    Source(PathBuf, String),
    /// A provenance or measurement row states something false.
    False(String),
    /// The register is malformed, out of date, or reopens a closed κ.
    Register(String),
}

impl fmt::Display for FidelityError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FidelityError::Io(p, e) => write!(f, "{}: {e}", p.display()),
            FidelityError::Source(p, why) => write!(f, "{}: {why}", p.display()),
            FidelityError::False(why) => write!(f, "false claim: {why}"),
            FidelityError::Register(why) => write!(f, "register: {why}"),
        }
    }
}

impl std::error::Error for FidelityError {}

/// One row of the register.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Row {
    /// κ of the question: axis, record identifier and normalized declaration.
    pub kappa: String,
    /// The record.
    pub record: String,
    /// The axis.
    pub axis: Axis,
    /// Why it is open; empty for a closed row.
    pub reason: String,
}

/// A project's score.
#[derive(Clone, Debug, Default)]
pub struct Score {
    /// Every record scored, in identifier order.
    pub records: Vec<Record>,
    /// Questions answered.
    pub closed: Vec<Row>,
    /// Questions open, with the reason.
    pub residue: Vec<Row>,
}

impl Score {
    /// Open questions on one axis.
    pub fn open(&self, axis: Axis) -> usize {
        self.residue.iter().filter(|r| r.axis == axis).count()
    }

    /// Questions asked on one axis.
    pub fn asked(&self, axis: Axis) -> usize {
        self.open(axis) + self.closed.iter().filter(|r| r.axis == axis).count()
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().fold(String::new(), |mut s, b| {
        let _ = write!(s, "{b:02x}");
        s
    })
}

/// κ of a question.
pub fn question_kappa(axis: Axis, record: &Record) -> String {
    let mut h = Sha256::new();
    for part in [SPEC, axis.name(), &record.id, &record.normalized] {
        h.update((part.len() as u64).to_be_bytes());
        h.update(part.as_bytes());
    }
    hex(&h.finalize())
}

/// κ of a source span: its location and its lines, `first` to `last`
/// inclusive, counted from 1.
pub fn span_kappa(location: &str, lines: &str) -> String {
    let mut h = Sha256::new();
    for part in ["prism/source-span/1", location, lines] {
        h.update((part.len() as u64).to_be_bytes());
        h.update(part.as_bytes());
    }
    hex(&h.finalize())
}

/// κ of a whole file a record was read from, a source entity at lines 0 to 0.
pub fn whole_file_kappa(location: &str, bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    for part in ["prism/source-file/1".as_bytes(), location.as_bytes(), bytes] {
        h.update((part.len() as u64).to_be_bytes());
        h.update(part);
    }
    hex(&h.finalize())
}

/// κ of a whole file the measurement was read from.
pub fn file_kappa(location: &str, bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    for part in [
        "prism/measurement-source/1".as_bytes(),
        location.as_bytes(),
        bytes,
    ] {
        h.update((part.len() as u64).to_be_bytes());
        h.update(part);
    }
    hex(&h.finalize())
}

/// Lines `first..=last` of `text`, counted from 1, joined by `\n`.
pub fn lines(text: &str, first: usize, last: usize) -> Option<String> {
    if first == 0 || last < first {
        return None;
    }
    let all: Vec<&str> = text.lines().collect();
    if last > all.len() {
        return None;
    }
    Some(all[first - 1..last].join("\n"))
}

/// The standard library's modules, copied into every project, and the
/// extension facets' own definitions: not the project's records.
fn library_module(module: &str) -> bool {
    matches!(
        module,
        "Foundation.Arch"
            | "Foundation.Sec"
            | "Foundation.Qual"
            | "Foundation.Holo"
            | "Foundation.Bytes"
            | "Foundation.Utf8"
            | "Foundation.Codec"
    ) || module.starts_with("Production.")
        || (module.starts_with("Foundation.") && module.ends_with(".Model"))
        || module.starts_with("Foundation.View.")
        || module.starts_with("Foundation.Browser.")
        || module == FIDELITY_MODULE
}

struct Parsed {
    module: lextex::Module,
    source: String,
}

fn collect(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), FidelityError> {
    let entries = std::fs::read_dir(dir).map_err(|e| FidelityError::Io(dir.to_path_buf(), e))?;
    for entry in entries {
        let path = entry
            .map_err(|e| FidelityError::Io(dir.to_path_buf(), e))?
            .path();
        if path.is_dir() {
            collect(&path, out)?;
        } else if path.to_string_lossy().ends_with(".lex.tex") {
            out.push(path);
        }
    }
    Ok(())
}

fn rel(path: &Path, root: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn normalize(decl: &lextex::Declaration) -> String {
    let mut out = String::new();
    for (k, v) in &decl.fields {
        out.push_str(k);
        out.push(':');
        out.push_str(&v.split_whitespace().collect::<Vec<_>>().join(" "));
        out.push(';');
    }
    out
}

fn short(result: &str) -> &str {
    result.rsplit("::").next().unwrap_or(result)
}

/// Every record literal in a value: `(record T {...})` itself, or each item
/// of a `(cons ...)` list of them.
fn record_items(value: &str) -> Vec<String> {
    let value = value.trim();
    if value.starts_with("(record ") {
        return vec![value.to_string()];
    }
    lextex::list_items(value)
        .map(|items| {
            items
                .into_iter()
                .filter(|i| i.trim().starts_with("(record "))
                .collect()
        })
        .unwrap_or_default()
}

fn field<'a>(fields: &'a [devrel_catalog::Field], name: &str) -> Option<&'a str> {
    fields
        .iter()
        .find(|f| f.name == name)
        .map(|f| f.value.as_str())
}

fn nat(fields: &[devrel_catalog::Field], name: &str) -> Option<usize> {
    field(fields, name)?.trim().parse().ok()
}

struct Entity {
    module: String,
    index: usize,
    location: String,
    first: usize,
    last: usize,
    kappa: String,
}

/// Read a project and score it.
///
/// `project` is the Prism project's directory (the one holding `src/`);
/// `repo` is the root that provenance and measurement locations are relative
/// to.
pub fn score(project: &Path, repo: &Path) -> Result<Score, FidelityError> {
    score_ignoring(project, repo, &[])
}

/// [`score`], reading no provenance or measurement rows from the modules
/// named in `ignore`: what a writer writes is not an input of its own.
pub fn score_ignoring(
    project: &Path,
    repo: &Path,
    ignore: &[&str],
) -> Result<Score, FidelityError> {
    let mut files = Vec::new();
    collect(&project.join("src"), &mut files)?;
    files.sort();
    let mut parsed = Vec::new();
    for file in &files {
        let text = std::fs::read_to_string(file).map_err(|e| FidelityError::Io(file.clone(), e))?;
        let module =
            lextex::parse(&text).map_err(|why| FidelityError::Source(file.clone(), why))?;
        parsed.push(Parsed {
            module,
            source: rel(file, repo),
        });
    }

    let mut records = Vec::new();
    let mut theorems = Vec::new();
    let mut entities: Vec<Entity> = Vec::new();
    let mut derivations: Vec<(String, usize, String)> = Vec::new();
    let mut indicators: Vec<(String, usize, String)> = Vec::new();
    let mut results: Vec<(String, usize, String, String)> = Vec::new();

    for p in &parsed {
        for decl in &p.module.declarations {
            match decl.keyword.as_str() {
                "theorem" => theorems.push(decl.field("statement").unwrap_or("").to_string()),
                "definition" => {
                    let Some(result) = decl.field("result") else {
                        continue;
                    };
                    let body = decl.field("body").unwrap_or("");
                    let result = result.trim();
                    let element = result
                        .strip_prefix("(List ")
                        .and_then(|r| r.strip_suffix(')'))
                        .unwrap_or(result);
                    if !ignore.contains(&p.module.name.as_str())
                        && (element.starts_with(PROV) || element.starts_with(MEAS))
                    {
                        for item in record_items(body) {
                            let fields = lextex::record_fields(&item);
                            match short(element) {
                                "SourceEntity" => entities.push(Entity {
                                    module: p.module.name.clone(),
                                    index: nat(&fields, "index").unwrap_or(usize::MAX),
                                    location: field(&fields, "location").unwrap_or("").into(),
                                    first: nat(&fields, "firstLine").unwrap_or(0),
                                    last: nat(&fields, "lastLine").unwrap_or(0),
                                    kappa: field(&fields, "kappa").unwrap_or("").into(),
                                }),
                                "Derivation" => derivations.push((
                                    field(&fields, "generatedEntity").unwrap_or("").into(),
                                    nat(&fields, "usedEntityIndex").unwrap_or(usize::MAX),
                                    p.module.name.clone(),
                                )),
                                "Indicator" => indicators.push((
                                    p.module.name.clone(),
                                    nat(&fields, "index").unwrap_or(usize::MAX),
                                    field(&fields, "name").unwrap_or("").into(),
                                )),
                                "MeasurementResult" => results.push((
                                    p.module.name.clone(),
                                    nat(&fields, "indicatorIndex").unwrap_or(usize::MAX),
                                    field(&fields, "source").unwrap_or("").into(),
                                    field(&fields, "kappa").unwrap_or("").into(),
                                )),
                                _ => {}
                            }
                        }
                    }
                    if library_module(&p.module.name)
                        || decl.field("parameters").is_some_and(|x| x.trim() != "[]")
                        || element.starts_with(PROV)
                        || element.starts_with(MEAS)
                    {
                        continue;
                    }
                    let single = body.trim().starts_with("(record ");
                    let items = record_items(body);
                    for (i, item) in items.iter().enumerate() {
                        let fields = lextex::record_fields(item);
                        let id = if single {
                            format!("{}::{}", p.module.name, decl.name)
                        } else {
                            format!("{}::{}#{i}", p.module.name, decl.name)
                        };
                        let normalized = if single {
                            normalize(decl)
                        } else {
                            item.split_whitespace().collect::<Vec<_>>().join(" ")
                        };
                        records.push(Record {
                            id,
                            name: decl.name.clone(),
                            kind: short(element).to_string(),
                            texts: fields
                                .iter()
                                .filter(|f| f.text && !f.value.is_empty())
                                .map(|f| f.value.clone())
                                .collect(),
                            normalized,
                            source: p.source.clone(),
                        });
                    }
                }
                _ => {}
            }
        }
    }
    records.sort_by(|a, b| a.id.cmp(&b.id));
    let ids: BTreeSet<&str> = records.iter().map(|r| r.id.as_str()).collect();

    // Every provenance row must be true before anything is scored.
    let mut file_cache: BTreeMap<String, String> = BTreeMap::new();
    let mut read = |location: &str| -> Result<String, FidelityError> {
        if let Some(t) = file_cache.get(location) {
            return Ok(t.clone());
        }
        let path = repo.join(location);
        let t = std::fs::read_to_string(&path).map_err(|e| FidelityError::Io(path, e))?;
        file_cache.insert(location.to_string(), t.clone());
        Ok(t)
    };
    let mut spans = Vec::new();
    for (i, e) in entities.iter().enumerate() {
        let (k, span) = if e.first == 0 && e.last == 0 {
            let path = repo.join(&e.location);
            let bytes = std::fs::read(&path).map_err(|err| FidelityError::Io(path, err))?;
            (
                whole_file_kappa(&e.location, &bytes),
                String::from_utf8(bytes).unwrap_or_default(),
            )
        } else {
            let text = read(&e.location)?;
            let span = lines(&text, e.first, e.last).ok_or_else(|| {
                FidelityError::False(format!(
                    "source entity {i} spans lines {}..{} of {}, which it does not have",
                    e.first, e.last, e.location
                ))
            })?;
            (span_kappa(&e.location, &span), span)
        };
        if k != e.kappa {
            return Err(FidelityError::False(format!(
                "source entity {i} ({} lines {}..{}) has κ {k}, not {}",
                e.location, e.first, e.last, e.kappa
            )));
        }
        spans.push(span);
    }
    let mut derived_from: BTreeMap<&str, Vec<usize>> = BTreeMap::new();
    for (record, used, module) in &derivations {
        if !ids.contains(record.as_str()) {
            return Err(FidelityError::False(format!(
                "a derivation generates {record}, which is not a record of the project"
            )));
        }
        let Some(global) = entities
            .iter()
            .position(|e| &e.module == module && e.index == *used)
        else {
            return Err(FidelityError::False(format!(
                "the derivation of {record} uses source entity {used} of {module}, which is not declared"
            )));
        };
        derived_from
            .entry(record.as_str())
            .or_default()
            .push(global);
    }
    let mut measured: BTreeSet<&str> = BTreeSet::new();
    for (module, indicator, location, kappa) in &results {
        let Some((_, _, name)) = indicators
            .iter()
            .find(|(m, i, _)| m == module && i == indicator)
        else {
            return Err(FidelityError::False(format!(
                "a measurement result names indicator {indicator} of {module}, which is not declared"
            )));
        };
        if module == FIDELITY_MODULE && name.starts_with("Fidelity::") {
            // The register's own indicators: their κ is the gate's byte check.
            continue;
        }
        let path = repo.join(location);
        let bytes = std::fs::read(&path).map_err(|e| FidelityError::Io(path, e))?;
        let k = file_kappa(location, &bytes);
        if &k != kappa {
            return Err(FidelityError::False(format!(
                "the result of indicator {name} was read from {location}, whose κ is {k}, not {kappa}"
            )));
        }
        measured.insert(name.as_str());
    }

    let mut score = Score::default();
    for r in &records {
        let derived = match derived_from.get(r.id.as_str()) {
            None => Err("no derivation names it (prov:wasDerivedFrom)".to_string()),
            Some(used) => {
                let joined: String = used
                    .iter()
                    .map(|&u| spans[u].as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                match r.texts.iter().find(|t| !joined.contains(t.as_str())) {
                    Some(t) => Err(format!(
                        "derived from spans that do not hold its text {t:?} verbatim"
                    )),
                    None => Ok(()),
                }
            }
        };
        let named = |s: &String| {
            s.match_indices(r.name.as_str()).any(|(at, m)| {
                let before = s[..at].chars().next_back();
                let after = s[at + m.len()..].chars().next();
                !before.is_some_and(|c| c.is_alphanumeric() || c == '_')
                    && !after.is_some_and(|c| c.is_alphanumeric() || c == '_')
            })
        };
        let meant = if theorems.iter().any(named) {
            Ok(())
        } else {
            Err("no theorem states anything about it (ISO/IEC/IEEE 29148 verification)".to_string())
        };
        let mut axes = vec![(Axis::Derived, derived), (Axis::Meant, meant)];
        if r.kind == "QualityMeasure" || r.kind == "Indicator" {
            axes.push((
                Axis::Measured,
                if measured.contains(r.id.as_str()) {
                    Ok(())
                } else {
                    Err(
                        "no indicator named for it has a measurement result (ISO/IEC/IEEE 15939)"
                            .to_string(),
                    )
                },
            ));
        }
        for (axis, outcome) in axes {
            let row = Row {
                kappa: question_kappa(axis, r),
                record: r.id.clone(),
                axis,
                reason: outcome.clone().err().unwrap_or_default(),
            };
            match outcome {
                Ok(()) => score.closed.push(row),
                Err(_) => score.residue.push(row),
            }
        }
    }
    score.records = records;
    Ok(score)
}

/// The register as committed: closed rows (every κ ever closed) and the
/// current residue.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Register {
    /// Every κ ever closed.
    pub closed: Vec<Row>,
    /// What is open now.
    pub residue: Vec<Row>,
}

fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

impl Register {
    /// The register `score` leaves after `previous`: closed rows accumulate.
    pub fn next(previous: &Register, score: &Score) -> Result<Register, FidelityError> {
        let ever: BTreeSet<&str> = previous.closed.iter().map(|r| r.kappa.as_str()).collect();
        if let Some(r) = score
            .residue
            .iter()
            .find(|r| ever.contains(r.kappa.as_str()))
        {
            return Err(FidelityError::Register(format!(
                "{} was closed on the {} axis and is open again: {}",
                r.record,
                r.axis.name(),
                r.reason
            )));
        }
        let mut closed: BTreeMap<String, Row> = previous
            .closed
            .iter()
            .map(|r| (r.kappa.clone(), r.clone()))
            .collect();
        for r in &score.closed {
            closed.insert(r.kappa.clone(), r.clone());
        }
        let mut closed: Vec<Row> = closed.into_values().collect();
        closed.sort_by(|a, b| (&a.record, a.axis, &a.kappa).cmp(&(&b.record, b.axis, &b.kappa)));
        let mut residue = score.residue.clone();
        residue.sort_by(|a, b| (&a.record, a.axis).cmp(&(&b.record, b.axis)));
        Ok(Register { closed, residue })
    }

    /// The register's text.
    pub fn render(&self) -> String {
        let mut out = String::from(
            "# The fidelity register, written by prism-fidelity: every question a record of\n\
             # the model raises (derived, meant, measured) by its κ. A closed κ stays here\n\
             # for good, and a projection that finds it open again is refused.\n\n",
        );
        let _ = writeln!(out, "spec = {}", quote(SPEC));
        for (table, rows) in [("closed", &self.closed), ("residue", &self.residue)] {
            for r in rows {
                let _ = write!(
                    out,
                    "\n[[{table}]]\nkappa = {}\nrecord = {}\naxis = {}\n",
                    quote(&r.kappa),
                    quote(&r.record),
                    quote(r.axis.name())
                );
                if table == "residue" {
                    let _ = writeln!(out, "reason = {}", quote(&r.reason));
                }
            }
        }
        out
    }

    /// Read a register this crate wrote.
    pub fn parse(text: &str) -> Result<Register, FidelityError> {
        let mut reg = Register::default();
        let mut table: Option<&str> = None;
        let mut row: BTreeMap<String, String> = BTreeMap::new();
        let flush = |table: Option<&str>,
                     row: &mut BTreeMap<String, String>,
                     reg: &mut Register|
         -> Result<(), FidelityError> {
            let Some(t) = table else { return Ok(()) };
            let get = |k: &str| {
                row.get(k)
                    .cloned()
                    .ok_or_else(|| FidelityError::Register(format!("a {t} row has no {k}")))
            };
            let r = Row {
                kappa: get("kappa")?,
                record: get("record")?,
                axis: Axis::parse(&get("axis")?)
                    .ok_or_else(|| FidelityError::Register("unknown axis".into()))?,
                reason: row.get("reason").cloned().unwrap_or_default(),
            };
            if t == "closed" {
                reg.closed.push(r)
            } else {
                reg.residue.push(r)
            }
            row.clear();
            Ok(())
        };
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if line == "[[closed]]" || line == "[[residue]]" {
                flush(table, &mut row, &mut reg)?;
                table = Some(if line == "[[closed]]" {
                    "closed"
                } else {
                    "residue"
                });
                continue;
            }
            let (k, v) = line
                .split_once(" = ")
                .ok_or_else(|| FidelityError::Register(format!("unreadable line {line:?}")))?;
            let v = v
                .strip_prefix('"')
                .and_then(|v| v.strip_suffix('"'))
                .ok_or_else(|| FidelityError::Register(format!("{k} is not a string")))?
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
            if table.is_none() {
                if k == "spec" && v != SPEC {
                    return Err(FidelityError::Register(format!("spec is {v}, not {SPEC}")));
                }
                continue;
            }
            row.insert(k.to_string(), v);
        }
        flush(table, &mut row, &mut reg)?;
        Ok(reg)
    }
}

/// A quality measure the model measures itself: the record, the LexLean
/// method that computes its value (the Lean kernel evaluates it), the module
/// the method is written in, and whether the measure's threshold bounds it
/// from above or below.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MeasureSpec {
    /// The `QualityMeasure` record, `Module::declaration`.
    pub record: String,
    /// The method, `Module::declaration` of a `Nat`.
    pub method: String,
    /// The file the method is written in, relative to the repository root.
    pub source: String,
    /// `atMost` or `atLeast`.
    pub direction: String,
}

/// Read `model/measures.toml`: one `[[measure]]` table per measure.
pub fn measures(text: &str) -> Result<Vec<MeasureSpec>, FidelityError> {
    let mut out = Vec::new();
    for table in text.split("[[measure]]").skip(1) {
        let get = |k: &str| {
            table
                .lines()
                .find_map(|l| l.trim().strip_prefix(&format!("{k} = ")))
                .and_then(|v| v.strip_prefix('"').and_then(|v| v.strip_suffix('"')))
                .map(str::to_string)
                .ok_or_else(|| FidelityError::Register(format!("a measure has no {k}")))
        };
        let direction = get("direction")?;
        if direction != "atMost" && direction != "atLeast" {
            return Err(FidelityError::Register(format!(
                "direction {direction} is neither atMost nor atLeast"
            )));
        }
        out.push(MeasureSpec {
            record: get("record")?,
            method: get("method")?,
            source: get("source")?,
            direction,
        });
    }
    Ok(out)
}

/// One line per axis: asked, closed, open.
pub fn summary(score: &Score) -> String {
    let mut out = format!("{} records scored", score.records.len());
    for axis in Axis::ALL {
        let asked = score.asked(axis);
        let _ = write!(
            out,
            "; {} {}/{} closed",
            axis.name(),
            asked - score.open(axis),
            asked
        );
    }
    out
}

/// The scorecard as JSON, for the published reference page.
pub fn scorecard(score: &Score) -> String {
    let axes: Vec<String> = Axis::ALL
        .iter()
        .map(|&a| {
            format!(
                "{{\"axis\":{},\"asked\":{},\"open\":{}}}",
                json(a.name()),
                score.asked(a),
                score.open(a)
            )
        })
        .collect();
    let residue: Vec<String> = score
        .residue
        .iter()
        .map(|r| {
            format!(
                "{{\"record\":{},\"axis\":{},\"reason\":{},\"kappa\":{}}}",
                json(&r.record),
                json(r.axis.name()),
                json(&r.reason),
                json(&r.kappa)
            )
        })
        .collect();
    format!(
        "{{\"spec\":{},\"records\":{},\"axes\":[{}],\"residue\":[{}]}}\n",
        json(SPEC),
        score.records.len(),
        axes.join(","),
        residue.join(",")
    )
}

fn json(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// The project's fidelity as ISO/IEC/IEEE 15939 measurement data:
/// `app/src/Fidelity.lex.tex`.
pub mod lean {
    use super::{Axis, Score, MEAS};
    use devrel_catalog::lextex::quote;

    fn declaration(keyword: &str, fields: &[(&str, String)]) -> String {
        let one = format!(
            "{keyword}{{{}}}\n",
            fields
                .iter()
                .map(|(k, v)| format!("{k}: {v}"))
                .collect::<Vec<_>>()
                .join(", ")
        );
        if one.len() <= 101 {
            return one;
        }
        format!(
            "{keyword}{{\n{}\n}}\n",
            fields
                .iter()
                .map(|(k, v)| format!("  {k}: {v}"))
                .collect::<Vec<_>>()
                .join(",\n")
        )
    }

    fn definition(name: &str, result: &str, body: String) -> String {
        declaration(
            "definition",
            &[
                ("name", name.into()),
                ("parameters", "[]".into()),
                ("result", result.into()),
                ("body", body),
            ],
        )
    }

    fn list(element: &str, items: &[String]) -> String {
        let mut out = format!("(nil {element})");
        for item in items.iter().rev() {
            out = format!("(cons {item} {out})");
        }
        out
    }

    fn rec(ty: &str, fields: &[(&str, String)]) -> String {
        format!(
            "(record {MEAS}::{ty} {{{}}})",
            fields
                .iter()
                .map(|(k, v)| format!("{k} := {v}"))
                .collect::<Vec<_>>()
                .join(", ")
        )
    }

    fn capital(name: &str) -> String {
        let mut c = name.chars();
        c.next()
            .map(|f| f.to_uppercase().chain(c).collect())
            .unwrap_or_default()
    }

    fn title(axis: Axis) -> &'static str {
        match axis {
            Axis::Derived => "Derived",
            Axis::Meant => "Meant",
            Axis::Measured => "Measured",
        }
    }

    fn method(axis: Axis) -> &'static str {
        match axis {
            Axis::Derived => "count the residue rows on the derived axis: records no W3C PROV-O derivation from a source span names",
            Axis::Meant => "count the residue rows on the meant axis: records no theorem states anything about (ISO/IEC/IEEE 29148)",
            Axis::Measured => "count the residue rows on the measured axis: quality measures with no ISO/IEC/IEEE 15939 measurement result",
        }
    }

    /// The module's text, in the layout `lexlean fmt` keeps.
    pub fn module(
        score: &Score,
        register: &str,
        kappa: &str,
        measures: &[(super::MeasureSpec, String)],
    ) -> String {
        let t = |ty: &str| format!("{MEAS}::{ty}");
        let mut decls = Vec::new();
        decls.push(definition(
            "informationNeed",
            &t("InformationNeed"),
            rec(
                "InformationNeed",
                &[
                    ("index", "0".into()),
                    ("name", quote("Fidelity of the model")),
                    ("text", quote("How much of what the model claims is derived from its sources, verified by a theorem and measured, and how much is still open.")),
                ],
            ),
        ));
        decls.push(definition(
            "conceptOpenQuestions",
            &t("MeasurableConcept"),
            rec(
                "MeasurableConcept",
                &[
                    ("index", "0".into()),
                    ("informationNeedIndex", "0".into()),
                    ("name", quote("Open questions per property")),
                ],
            ),
        ));
        decls.push(definition(
            "entityRecord",
            &t("Entity"),
            rec(
                "Entity",
                &[
                    ("index", "0".into()),
                    ("name", quote("record of the model")),
                ],
            ),
        ));
        decls.push(definition(
            "criteriaNoneOpen",
            &t("DecisionCriteria"),
            rec(
                "DecisionCriteria",
                &[
                    ("index", "0".into()),
                    ("direction", format!("(ctor {MEAS}::Direction.atMost)")),
                    ("bound", "0".into()),
                    ("basis", quote("closed: every question the model raises is answered, and the register never reopens one")),
                ],
            ),
        ));
        let mut attributes = Vec::new();
        let mut bases = Vec::new();
        let mut derived = Vec::new();
        let mut indicators = Vec::new();
        let mut results = Vec::new();
        for (i, axis) in Axis::ALL.into_iter().enumerate() {
            let n = title(axis);
            attributes.push(definition(
                &format!("attribute{n}"),
                &t("Attribute"),
                rec(
                    "Attribute",
                    &[
                        ("index", i.to_string()),
                        ("entityIndex", "0".into()),
                        ("name", quote(axis.name())),
                    ],
                ),
            ));
            bases.push(definition(
                &format!("baseMeasure{n}Open"),
                &t("BaseMeasure"),
                rec(
                    "BaseMeasure",
                    &[
                        ("index", i.to_string()),
                        ("attributeIndex", i.to_string()),
                        ("name", quote(&format!("open {} questions", axis.name()))),
                        ("method", quote(method(axis))),
                        ("scale", format!("(ctor {MEAS}::Scale.ratio)")),
                        ("unit", quote("question")),
                    ],
                ),
            ));
            derived.push(definition(
                &format!("derivedMeasure{n}Open"),
                &t("DerivedMeasure"),
                rec(
                    "DerivedMeasure",
                    &[
                        ("index", i.to_string()),
                        ("name", quote(&format!("open {} questions", axis.name()))),
                        ("function", quote("identity of the base measure")),
                        ("baseMeasureIndices", list("Nat", &[i.to_string()])),
                    ],
                ),
            ));
            indicators.push(rec(
                "Indicator",
                &[
                    ("index", i.to_string()),
                    ("name", quote(&format!("Fidelity::indicator{n}"))),
                    ("conceptIndex", "0".into()),
                    ("derivedMeasureIndex", i.to_string()),
                    (
                        "analysisModel",
                        quote("excess of the open count over the criteria's bound"),
                    ),
                    ("criteriaIndex", "0".into()),
                ],
            ));
            results.push(rec(
                "MeasurementResult",
                &[
                    ("indicatorIndex", i.to_string()),
                    ("value", score.open(axis).to_string()),
                    ("source", quote(register)),
                    ("kappa", quote(kappa)),
                ],
            ));
        }
        let mut criteria = Vec::new();
        for (j, (m, method_kappa)) in measures.iter().enumerate() {
            let i = Axis::ALL.len() + j;
            let c = 1 + j;
            let short = m.record.rsplit("::").next().unwrap_or(&m.record);
            derived.push(definition(
                &format!("derivedMeasure{}", capital(short)),
                &t("DerivedMeasure"),
                rec(
                    "DerivedMeasure",
                    &[
                        ("index", i.to_string()),
                        ("name", quote(&m.record)),
                        ("function", quote(&m.method)),
                        ("baseMeasureIndices", list("Nat", &[])),
                    ],
                ),
            ));
            criteria.push(definition(
                &format!("criteria{}", capital(short)),
                &t("DecisionCriteria"),
                rec(
                    "DecisionCriteria",
                    &[
                        ("index", c.to_string()),
                        (
                            "direction",
                            format!("(ctor {MEAS}::Direction.{})", m.direction),
                        ),
                        ("bound", format!("(project ({}) threshold)", m.record)),
                        ("basis", quote(&format!("the threshold of {}", m.record))),
                    ],
                ),
            ));
            indicators.push(rec(
                "Indicator",
                &[
                    ("index", i.to_string()),
                    ("name", quote(&m.record)),
                    ("conceptIndex", "0".into()),
                    ("derivedMeasureIndex", i.to_string()),
                    (
                        "analysisModel",
                        quote("excess of the measured value over the threshold"),
                    ),
                    ("criteriaIndex", c.to_string()),
                ],
            ));
            results.push(rec(
                "MeasurementResult",
                &[
                    ("indicatorIndex", i.to_string()),
                    ("value", format!("({})", m.method)),
                    ("source", quote(&m.source)),
                    ("kappa", quote(method_kappa)),
                ],
            ));
        }
        decls.extend(attributes);
        decls.extend(bases);
        decls.extend(derived);
        decls.extend(criteria);
        decls.push(definition(
            "indicators",
            &format!("(List {})", t("Indicator")),
            list(&t("Indicator"), &indicators),
        ));
        decls.push(definition(
            "results",
            &format!("(List {})", t("MeasurementResult")),
            list(&t("MeasurementResult"), &results),
        ));
        decls.push(declaration(
            "theorem",
            &[
                ("name", "indicatorsKnown".into()),
                ("parameters", "[]".into()),
                (
                    "statement",
                    format!(
                        "(({MEAS}::indicatorsKnown 1 {} {} (indicators)) = true)",
                        Axis::ALL.len() + measures.len(),
                        1 + measures.len()
                    ),
                ),
                ("proof", "decide{}".into()),
            ],
        ));
        for (m, _) in measures {
            let short = m.record.rsplit("::").next().unwrap_or(&m.record);
            decls.push(declaration(
                "theorem",
                &[
                    ("name", format!("{short}Holds")),
                    ("parameters", "[]".into()),
                    (
                        "statement",
                        format!(
                            "(({MEAS}::satisfies (criteria{}) ({})) = true)",
                            capital(short),
                            m.method
                        ),
                    ),
                    ("proof", "decide{}".into()),
                ],
            ));
        }
        decls.push(declaration(
            "theorem",
            &[
                ("name", "everyIndicatorMeasured".into()),
                ("parameters", "[]".into()),
                (
                    "statement",
                    format!("(({MEAS}::everyIndicatorMeasured (indicators) (results)) = true)"),
                ),
                ("proof", "decide{}".into()),
            ],
        ));
        let mut modules: Vec<&str> = measures
            .iter()
            .flat_map(|(m, _)| [m.record.as_str(), m.method.as_str()])
            .filter_map(|id| id.rsplit_once("::").map(|(module, _)| module))
            .chain([MEAS])
            .chain(measures.first().map(|_| "Foundation.Qual"))
            .collect();
        modules.sort_unstable();
        modules.dedup();
        let imports: String = modules
            .iter()
            .map(|m| format!("\\importmodule{{{m}}}\n"))
            .collect();
        format!(
            "\\begin{{lexlean}}{{Fidelity}}\n\\useglossary{{lexlean.std.bool@1.2.0}}\n\\useglossary{{lexlean.std.nat@1.2.0}}\n\\useglossary{{prism.arch@1.0.0}}\n{}\\title{{Fidelity of the model}}\n\\begin{{semanticmodule}}\n{}\\end{{semanticmodule}}\n\\end{{lexlean}}\n",
            imports,
            decls.join("\n")
        )
    }
}
