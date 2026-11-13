//! The tutorial and the CLI reference, read from the subject's checkout.
//!
//! The getting-started page runs the subject's tool on the subject's own
//! fixture workspace, so every command, option and number on it is one the
//! subject's gate runs or the subject's committed projection holds:
//!
//! - the commands are the lines of the subject's `Justfile` recipe that name
//!   the fixture workspace, verbatim (the `project` line is the `check` line
//!   with `project` in its place and a fresh output directory);
//! - the projection's facet records are read from the committed projection
//!   with the same reader as the catalog;
//! - the frontier counts come from the projection's `frontier.toml`, and the
//!   worked example is its first lifted row: the Rust function at its span
//!   and the LexLean definition it lifted to;
//! - the subject's own lift register is the file the recipe passes to
//!   `--register`;
//! - the claims are rows of the subject's `model/ids.toml`, quoted;
//! - the CLI reference is the `clap` derive in the subject's binary source.
//!
//! A subject whose checkout no longer holds one of these is refused with
//! [`CatalogError::Tutorial`], so the page cannot outlive what it shows.

use std::collections::BTreeMap;
use std::path::Path;

use crate::{lextex, Catalog, CatalogError, Facet, SubjectConfig};

/// What a subject's `tutorial` member in `devrel/subjects.json` names in the
/// subject.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TutorialConfig {
    /// The `Justfile` recipe that runs the tool on the fixture.
    pub recipe: String,
    /// The fixture workspace, relative to the checkout.
    pub workspace: String,
    /// The binary's source, whose `clap` derive is the CLI.
    pub cli: String,
    /// The register rows the tutorial rests on.
    pub claims: Vec<String>,
}

impl TutorialConfig {
    /// Parse the `tutorial` member.
    pub fn parse(value: &serde_json::Value) -> Result<TutorialConfig, CatalogError> {
        let get = |k: &str| {
            value
                .get(k)
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .ok_or_else(|| CatalogError::Config(format!("tutorial.{k} is not a string")))
        };
        let claims = value
            .get("claims")
            .and_then(|v| v.as_array())
            .ok_or_else(|| CatalogError::Config("tutorial.claims is not a list".into()))?
            .iter()
            .map(|c| {
                c.as_str().map(str::to_string).ok_or_else(|| {
                    CatalogError::Config("tutorial.claims holds a non-string".into())
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        if claims.is_empty() {
            return Err(CatalogError::Config("tutorial.claims is empty".into()));
        }
        Ok(TutorialConfig {
            recipe: get("recipe")?,
            workspace: get("workspace")?,
            cli: get("cli")?,
            claims,
        })
    }
}

/// One row kind of a `frontier.toml` or lift register, and how many rows.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rows {
    /// The table name: `lifted`, `residue`, `effect`, `foreign`, `refusal`.
    pub table: String,
    /// Rows of it.
    pub count: usize,
}

/// A function the projection lifted: its Rust source and its definition.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Lifted {
    /// The Rust path.
    pub function: String,
    /// `file:line` in the fixture workspace.
    pub span: String,
    /// The function's source, from its span to its closing brace.
    pub rust: String,
    /// `Module::name` of the definition.
    pub definition: String,
    /// The definition's LexLean source.
    pub lean: String,
}

/// A command or option of the CLI and its doc comment.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    /// `project`, `<workspace>` or `--out`.
    pub name: String,
    /// Its doc comment, joined.
    pub doc: String,
}

/// The subject's lift register: the file the recipe names, its row counts
/// and its residue by reason.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Register {
    /// Its path in the checkout.
    pub path: String,
    /// Row counts by table, in first-seen order.
    pub rows: Vec<Rows>,
    /// Residue rows by reason, most first, then by name.
    pub reasons: Vec<Rows>,
}

/// Everything the tutorial page shows.
#[derive(Clone, Debug)]
pub struct Tutorial {
    /// The configuration it was read with.
    pub config: TutorialConfig,
    /// The projection directory the recipe checks the fixture against.
    pub projection: String,
    /// `cargo run ... project <workspace> --out <fresh> ...`.
    pub project: String,
    /// The recipe's `check` line for the fixture, verbatim.
    pub check: String,
    /// The recipe's line that runs the SDK in the projection, verbatim.
    pub sdk: String,
    /// The recipe's `check` line with `--register`, verbatim.
    pub ratchet: Option<String>,
    /// The `project` and `check` lines for a reader's own workspace: the
    /// fixture lines with placeholders for the paths, without the pinned
    /// name and instant, and with a lift register beside the workspace.
    pub yours: Vec<String>,
    /// The workspace's members, from its `Cargo.toml`.
    pub members: Vec<String>,
    /// The workspace's files, sorted, relative to it.
    pub files: Vec<String>,
    /// How many files `project` writes: the manifest's lines and itself.
    pub written: usize,
    /// Facet records of the committed projection.
    pub counts: BTreeMap<Facet, usize>,
    /// The projection's `frontier.toml` row counts.
    pub frontier: Vec<Rows>,
    /// The worked example: the first lifted row.
    pub example: Lifted,
    /// The subject's own lift register, when the recipe ratchets one.
    pub register: Option<Register>,
    /// Each claim and its statement, from the subject's register.
    pub claims: Vec<(String, String)>,
    /// The CLI's subcommands.
    pub commands: Vec<Entry>,
    /// The CLI's arguments and options.
    pub options: Vec<Entry>,
}

fn fail(why: String) -> CatalogError {
    CatalogError::Tutorial(why)
}

fn read(path: &Path) -> Result<String, CatalogError> {
    std::fs::read_to_string(path).map_err(|e| CatalogError::Io(path.to_path_buf(), e))
}

/// The body lines of a `Justfile` recipe, trimmed.
pub fn recipe(justfile: &str, name: &str) -> Option<Vec<String>> {
    let head = format!("\n{name}:");
    let start = format!("\n{justfile}").find(&head)?;
    let body = &justfile[start + head.len() - 1..];
    let body = &body[body.find('\n')? + 1..];
    Some(
        body.lines()
            .take_while(|l| l.starts_with(' ') || l.starts_with('\t'))
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
    )
}

/// The value after `flag` in a command line.
fn arg<'a>(line: &'a str, flag: &str) -> Option<&'a str> {
    let mut words = line.split_whitespace();
    words.find(|w| *w == flag)?;
    words.next()
}

/// Row counts of a TOML file of `[[table]]` rows, in first-seen order.
fn rows(text: &str) -> Vec<Rows> {
    let mut out: Vec<Rows> = Vec::new();
    for line in text.lines() {
        if let Some(table) = line.strip_prefix("[[").and_then(|l| l.strip_suffix("]]")) {
            match out.iter_mut().find(|r| r.table == table) {
                Some(r) => r.count += 1,
                None => out.push(Rows {
                    table: table.to_string(),
                    count: 1,
                }),
            }
        }
    }
    out
}

/// The `[[table]]` rows of a TOML file, each as its `key = "value"` pairs.
fn table_rows(text: &str, table: &str) -> Vec<BTreeMap<String, String>> {
    let head = format!("[[{table}]]");
    let mut out = Vec::new();
    let mut current: Option<BTreeMap<String, String>> = None;
    for line in text.lines() {
        if line.starts_with("[[") || line.starts_with('[') {
            if let Some(row) = current.take() {
                out.push(row);
            }
            if line == head {
                current = Some(BTreeMap::new());
            }
            continue;
        }
        if let Some(row) = current.as_mut() {
            if let Some((k, v)) = line.split_once(" = ") {
                if let Some(text) = lextex::unquote(v.trim()) {
                    row.insert(k.trim().to_string(), text);
                }
            }
        }
    }
    if let Some(row) = current {
        out.push(row);
    }
    out
}

/// The source of the item that starts at `line` (1-based): through the line
/// where its braces balance.
fn item_at(text: &str, line: usize) -> Option<String> {
    let lines: Vec<&str> = text.lines().collect();
    let start = line.checked_sub(1)?;
    let mut depth = 0i64;
    let mut opened = false;
    for (i, l) in lines.iter().enumerate().skip(start) {
        for c in l.chars() {
            match c {
                '{' => {
                    depth += 1;
                    opened = true;
                }
                '}' => depth -= 1,
                _ => {}
            }
        }
        if opened && depth == 0 {
            return Some(lines[start..=i].join("\n"));
        }
    }
    None
}

/// The source of the top-level declaration named `name` in a module.
fn declaration_source(text: &str, name: &str) -> Option<String> {
    let at = text.find(&format!("\n  name: {name},\n"))?;
    let start = text[..at].rfind("\n").map_or(0, |n| n + 1);
    let end = at + text[at..].find("\n}\n")? + 2;
    Some(text[start..end].to_string())
}

fn docs(lines: &[&str], at: usize) -> String {
    let mut doc = Vec::new();
    let mut i = at;
    while i > 0 {
        i -= 1;
        let l = lines[i].trim();
        if let Some(d) = l.strip_prefix("///") {
            doc.push(d.trim().to_string());
        } else if !l.starts_with("#[") {
            break;
        }
    }
    doc.reverse();
    doc.join(" ")
}

fn kebab(name: &str) -> String {
    let mut out = String::new();
    for (i, c) in name.chars().enumerate() {
        if c.is_ascii_uppercase() {
            if i > 0 {
                out.push('-');
            }
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

/// The subcommands and arguments of a `clap` derive: the variants of the
/// `#[derive(Subcommand)]` enum and the fields of the `#[derive(clap::Args)]`
/// struct, each with its doc comment.
pub fn cli(source: &str) -> Option<(Vec<Entry>, Vec<Entry>)> {
    let lines: Vec<&str> = source.lines().collect();
    let block = |marker: &str| -> Option<(usize, usize)> {
        let derive = lines.iter().position(|l| l.trim() == marker)?;
        let open = (derive..lines.len()).find(|&i| lines[i].trim_end().ends_with('{'))?;
        let close = (open..lines.len()).find(|&i| lines[i] == "}")?;
        Some((open, close))
    };
    let (open, close) = block("#[derive(Subcommand)]")?;
    let mut commands = Vec::new();
    for i in open + 1..close {
        let l = lines[i].trim();
        if l.starts_with("//") || l.starts_with("#[") || l.is_empty() {
            continue;
        }
        let name = l.split(['(', ',', '{']).next()?.trim();
        commands.push(Entry {
            name: kebab(name),
            doc: docs(&lines, i),
        });
    }
    let (open, close) = block("#[derive(clap::Args)]")?;
    let mut options = Vec::new();
    for i in open + 1..close {
        let l = lines[i].trim();
        if l.starts_with("//") || l.starts_with("#[") || l.is_empty() {
            continue;
        }
        let field = l.split(':').next()?.trim();
        let long = lines[..i]
            .iter()
            .rev()
            .take_while(|p| p.trim().starts_with("#[") || p.trim().starts_with("///"))
            .any(|p| p.trim().starts_with("#[arg(") && p.contains("long"));
        let name = if long {
            format!("--{}", field.replace('_', "-"))
        } else {
            format!("<{field}>")
        };
        options.push(Entry {
            name,
            doc: docs(&lines, i),
        });
    }
    (!commands.is_empty() && !options.is_empty()).then_some((commands, options))
}

/// A recipe line rewritten for the reader's workspace.
fn own_workspace(line: &str, workspace: &str) -> String {
    let mut out = Vec::new();
    let mut words = line.split_whitespace();
    while let Some(w) = words.next() {
        match w {
            "--name" | "--last-modified" => {
                words.next();
            }
            "--out" => {
                words.next();
                out.push("--out path/to/prism-project".to_string());
            }
            w if w == workspace => out.push("path/to/workspace".to_string()),
            w => out.push(w.to_string()),
        }
    }
    out.push("--register path/to/workspace/frontier.toml".to_string());
    out.join(" ")
}

fn walk(dir: &Path, root: &Path, out: &mut Vec<String>) -> Result<(), CatalogError> {
    let entries = std::fs::read_dir(dir).map_err(|e| CatalogError::Io(dir.to_path_buf(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| CatalogError::Io(dir.to_path_buf(), e))?;
        let path = entry.path();
        if path.is_dir() {
            walk(&path, root, out)?;
        } else if let Ok(rel) = path.strip_prefix(root) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

impl Tutorial {
    /// Read the tutorial from the subject's checkout.
    pub fn build(
        subject: &SubjectConfig,
        config: &TutorialConfig,
        checkout: &Path,
    ) -> Result<Tutorial, CatalogError> {
        let justfile = read(&checkout.join("Justfile"))?;
        let lines = recipe(&justfile, &config.recipe)
            .ok_or_else(|| fail(format!("the Justfile has no recipe {}", config.recipe)))?;
        let names_workspace = |l: &&String| l.split_whitespace().any(|w| w == config.workspace);
        let check = lines
            .iter()
            .filter(names_workspace)
            .find(|l| l.contains(" check "))
            .cloned()
            .ok_or_else(|| {
                fail(format!(
                    "recipe {} does not check {}",
                    config.recipe, config.workspace
                ))
            })?;
        let projection = arg(&check, "--out")
            .ok_or_else(|| fail("the check line names no --out".into()))?
            .to_string();
        let sdk = lines
            .iter()
            .find(|l| l.starts_with(&format!("cd {projection} ")))
            .cloned()
            .ok_or_else(|| {
                fail(format!(
                    "recipe {} runs nothing in {projection}",
                    config.recipe
                ))
            })?;
        let fresh = projection
            .rsplit('/')
            .next()
            .unwrap_or(&projection)
            .to_string();
        let project = check.replacen(" check ", " project ", 1).replacen(
            &format!("--out {projection}"),
            &format!("--out {fresh}"),
            1,
        );
        let ratchet = lines.iter().find(|l| l.contains(" --register ")).cloned();
        let yours = [&project, &check]
            .iter()
            .map(|line| own_workspace(line, &config.workspace))
            .collect();
        let ws = checkout.join(&config.workspace);
        let cargo = read(&ws.join("Cargo.toml"))?;
        let members = cargo
            .lines()
            .find_map(|l| l.trim().strip_prefix("members = ["))
            .map(|l| {
                l.trim_end_matches(']')
                    .split(',')
                    .filter_map(|m| lextex::unquote(m.trim()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let mut files = Vec::new();
        walk(&ws, &ws, &mut files)?;
        files.sort();
        let proj = checkout.join(&projection);
        let manifest = read(&proj.join("uorust.manifest"))?;
        let written = manifest.lines().count() + 1;
        let catalog = Catalog::build(subject.clone(), &proj)?;
        let counts = catalog.counts();
        let frontier_text = read(&proj.join("frontier.toml"))?;
        let frontier = rows(&frontier_text);
        let first = table_rows(&frontier_text, "lifted")
            .into_iter()
            .next()
            .ok_or_else(|| fail(format!("{projection}/frontier.toml lifts no function")))?;
        let field = |k: &str| {
            first
                .get(k)
                .cloned()
                .ok_or_else(|| fail(format!("the first lifted row has no {k}")))
        };
        let (function, span, definition) =
            (field("function")?, field("span")?, field("definition")?);
        let (file, line) = span
            .rsplit_once(':')
            .and_then(|(f, l)| Some((f, l.parse::<usize>().ok()?)))
            .ok_or_else(|| fail(format!("span {span} is not file:line")))?;
        let rust = item_at(&read(&ws.join(file))?, line)
            .ok_or_else(|| fail(format!("no item at {span}")))?;
        let (module, name) = definition
            .split_once("::")
            .ok_or_else(|| fail(format!("{definition} is not Module::name")))?;
        let lean = declaration_source(&read(&proj.join(format!("src/{module}.lex.tex")))?, name)
            .ok_or_else(|| fail(format!("{projection} does not declare {definition}")))?;
        let example = Lifted {
            function,
            span,
            rust,
            definition,
            lean,
        };
        let register = match ratchet.as_deref().and_then(|l| arg(l, "--register")) {
            Some(path) => {
                let text = read(&checkout.join(path))?;
                let mut reasons: Vec<Rows> = Vec::new();
                for row in table_rows(&text, "residue") {
                    let reason = row.get("reason").cloned().unwrap_or_default();
                    match reasons.iter_mut().find(|r| r.table == reason) {
                        Some(r) => r.count += 1,
                        None => reasons.push(Rows {
                            table: reason,
                            count: 1,
                        }),
                    }
                }
                reasons.sort_by(|a, b| b.count.cmp(&a.count).then(a.table.cmp(&b.table)));
                Some(Register {
                    path: path.to_string(),
                    rows: rows(&text),
                    reasons,
                })
            }
            None => None,
        };
        let ids = read(&checkout.join("model/ids.toml"))?;
        let registered = table_rows(&ids, "id");
        let claims = config
            .claims
            .iter()
            .map(|id| {
                registered
                    .iter()
                    .find(|r| r.get("id") == Some(id))
                    .and_then(|r| r.get("statement"))
                    .map(|s| (id.clone(), s.clone()))
                    .ok_or_else(|| fail(format!("model/ids.toml registers no {id}")))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let (commands, options) = cli(&read(&checkout.join(&config.cli))?).ok_or_else(|| {
            fail(format!(
                "{} has no clap Subcommand and Args derive",
                config.cli
            ))
        })?;
        Ok(Tutorial {
            config: config.clone(),
            projection,
            project,
            check,
            sdk,
            ratchet,
            yours,
            members,
            files,
            written,
            counts,
            frontier,
            example,
            register,
            claims,
            commands,
            options,
        })
    }
}
