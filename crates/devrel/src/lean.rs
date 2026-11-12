//! The catalog as LexLean: `app/src/Catalog.lex.tex`, written in the form
//! `lexlean fmt` keeps, so that regenerating it from the pinned subject is a
//! byte comparison.

use crate::frame::{self, ERROR_TEXT, FOUND_TEXT, LOOKUP_PREFIX, OVERFLOW_TEXT, RAW_PREFIX};
use crate::lextex::quote;
use crate::{Catalog, Facet, INVALID};

const MODEL: &str = "Foundation.DevRel.V1.Model";
const V3: &str = "Foundation.View.Text.V3.Model";

/// `Catalog::indexDigits`: the decimal digits of the subject's record count,
/// the longest index the lookup parses. Every record's index has at most that
/// many digits, and so does the first index past the end, which is refused as
/// unknown rather than as invalid.
pub fn index_digits(c: &Catalog) -> usize {
    c.records.len().to_string().len()
}

/// The longest request the guest reads (`requestMaximum` of
/// `app/src/DevRel.lex.tex`): the longer of the two framed forms, a prefix,
/// the separator and an index of `index_digits` digits. A bare index is
/// shorter still.
pub fn request_maximum(c: &Catalog) -> usize {
    request_maximum_for(index_digits(c))
}

/// `request_maximum` for an index of `digits` digits.
pub fn request_maximum_for(digits: usize) -> usize {
    LOOKUP_PREFIX.len().max(RAW_PREFIX.len()) + 1 + digits
}

/// `guestAllocationMaximum`, one byte past the request bound.
pub fn allocation_maximum(c: &Catalog) -> usize {
    request_maximum(c) + 1
}

/// The declaration name of a resource: `resource` and its slug in camel case.
pub fn resource_name(slug: &str) -> String {
    let mut out = String::from("resource");
    for part in slug.split('-') {
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            out.extend(first.to_uppercase());
            out.push_str(chars.as_str());
        }
    }
    out
}

fn list(items: &[String], element: &str) -> String {
    let mut out = format!("(nil {element})");
    for item in items.iter().rev() {
        out = format!("(cons {item} {out})");
    }
    out
}

/// A declaration in the layout `lexlean fmt` keeps: on one line when that
/// line fits in 100 columns, one field per line otherwise.
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

fn definition(name: &str, result: &str, body: &str) -> String {
    declaration(
        "definition",
        &[
            ("name", name.into()),
            ("parameters", "[]".into()),
            ("result", result.into()),
            ("body", body.into()),
        ],
    )
}

fn indexed(name: &str, body: &str) -> String {
    declaration(
        "definition",
        &[
            ("name", name.into()),
            ("parameters", "[position : Nat]".into()),
            ("result", "String".into()),
            ("body", body.into()),
        ],
    )
}

fn theorem(name: &str, statement: &str) -> String {
    declaration(
        "theorem",
        &[
            ("name", name.into()),
            ("parameters", "[]".into()),
            ("statement", statement.into()),
            ("proof", "decide{}".into()),
        ],
    )
}

/// The acceptance vectors of the lookup, replayed in the compiled guest:
/// the first, middle and last record, the first index past the end, two
/// malformed requests, one a digit longer than any index and one exactly as
/// long as the guest allocation bound,
/// then the workbench's framed requests, answered with the page's JSON.
pub fn vectors(c: &Catalog) -> Vec<(Vec<u8>, Vec<u8>)> {
    let n = c.records.len();
    let mut out: Vec<(Vec<u8>, Vec<u8>)> = [0, n / 2, n - 1, n]
        .iter()
        .map(|i| (i.to_string().into_bytes(), c.answer(*i).into_bytes()))
        .collect();
    out.push((b"7x".to_vec(), INVALID.as_bytes().to_vec()));
    out.push((Vec::new(), INVALID.as_bytes().to_vec()));
    out.push((vec![b'1'; index_digits(c) + 1], INVALID.as_bytes().to_vec()));
    out.push((
        vec![b'1'; allocation_maximum(c)],
        INVALID.as_bytes().to_vec(),
    ));
    // Every workbench example is bound to the framed vector of its request,
    // and the raw editor is replayed once.
    for (_, _, _, value, report) in examples(c) {
        out.push((
            frame::framed(LOOKUP_PREFIX, &value),
            frame::wrap("lookup", &value, &report).into_bytes(),
        ));
    }
    let middle = (n / 2).to_string();
    out.push((
        frame::framed(RAW_PREFIX, &middle),
        frame::wrap("raw", &middle, &c.answer(n / 2)).into_bytes(),
    ));
    out
}

/// The workbench's examples: a request, its JSON answer, and a sentence.
pub fn examples(c: &Catalog) -> Vec<(String, String, String, String, String)> {
    let n = c.records.len();
    let mut out = Vec::new();
    for (id, label, index) in [
        ("first", "First record", 0),
        ("middle", "Middle record", n / 2),
    ] {
        let r = &c.records[index];
        out.push((
            id.to_string(),
            label.to_string(),
            format!(
                "Record {index} is {}, a {} record.",
                r.id,
                r.facet.constructor()
            ),
            index.to_string(),
            c.answer(index),
        ));
    }
    out.push((
        "past-the-end".into(),
        "Past the last record".into(),
        format!("The subject has {n} records, numbered 0 to {}.", n - 1),
        n.to_string(),
        c.answer(n),
    ));
    out.push((
        "not-a-number".into(),
        "Not a number".into(),
        format!("An index is one to {} decimal digits.", index_digits(c)),
        "x".into(),
        INVALID.into(),
    ));
    out
}

/// The workbench guide's sections, as (id, title, paragraphs).
pub fn sections(c: &Catalog) -> Vec<(String, String, Vec<String>)> {
    let n = c.records.len();
    let mut out = vec![(
        "answers".to_string(),
        "Reading an answer".to_string(),
        vec![
            "record ID: the facet record at that index, by its Module::declaration identifier.".to_string(),
            "facet NAME: the facet the record belongs to.".to_string(),
            "page SLUG: one line per page that teaches the record, at learn/SLUG/.".to_string(),
            format!("refused unknown-record: the index is {n} or more. error invalid-request: the request is not one to {} decimal digits.", index_digits(c)),
        ],
    )];
    out.push((
        "subject".to_string(),
        "The subject".to_string(),
        vec![
            format!(
                "{} at commit {}, project {}.",
                c.subject.name, c.subject.commit, c.subject.path
            ),
            format!("{n} facet records, numbered by identifier from 0 to {}. Every one is taught by at least one page; the Lean kernel checks it (Catalog::catalogCovered).", n - 1),
        ],
    ));
    let counts = c.counts();
    out.push((
        "facets".to_string(),
        "Records by facet".to_string(),
        Facet::ALL
            .iter()
            .filter_map(|f| {
                counts
                    .get(f)
                    .map(|k| format!("{}: {k} records.", f.label()))
            })
            .collect(),
    ));
    out.push((
        "pages".to_string(),
        "Pages".to_string(),
        c.resources
            .iter()
            .map(|r| format!("{} (learn/{}/): {}", r.title, r.slug, r.summary))
            .collect(),
    ));
    out
}

/// A LexLean byte literal.
pub fn hex(bytes: &[u8]) -> String {
    let mut out = String::from("0x");
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// Elements per list literal. The LexLean front end reads a module through a
/// JSON reader with a nesting limit, and every element of a `cons` chain is a
/// level, so a long list is declared in parts joined by an append the model
/// defines.
const CHUNK: usize = 24;

fn chunked(decls: &mut Vec<String>, name: &str, element: &str, append: &str, items: &[String]) {
    let ty = format!("(List {MODEL}::{element})");
    let mut parts = Vec::new();
    for (i, chunk) in items.chunks(CHUNK).enumerate() {
        let part = format!("{name}Part{i}");
        decls.push(definition(
            &part,
            &ty,
            &list(chunk, &format!("{MODEL}::{element}")),
        ));
        parts.push(part);
    }
    let mut body = format!("(nil {MODEL}::{element})");
    for part in parts.iter().rev() {
        body = format!("({MODEL}::{append} ({part}) {body})");
    }
    decls.push(definition(name, &ty, &body));
}

fn tree(decls: &mut Vec<String>, low: usize, high: usize) -> String {
    let name = format!("answerIn{low}x{high}");
    let body = if high - low == 1 {
        format!("(answer{low})")
    } else {
        let mid = low + (high - low) / 2;
        let left = tree(decls, low, mid);
        let right = tree(decls, mid, high);
        format!("(if (position <? {mid}) then ({left} position) else ({right} position))")
    };
    decls.push(indexed(&name, &body));
    name
}

/// `app/src/Catalog.lex.tex` for this catalog.
pub fn catalog(c: &Catalog) -> String {
    let mut decls: Vec<String> = Vec::new();
    decls.push(definition(
        "indexDigits",
        "Nat",
        &index_digits(c).to_string(),
    ));
    decls.push(definition(
        "subject",
        &format!("{MODEL}::Subject"),
        &format!(
            "(record {MODEL}::Subject {{name := {}, repository := {}, commit := {}, sourceDigest := {}, recordCount := {}}})",
            quote(&c.subject.name),
            quote(&c.subject.repository),
            quote(&c.subject.commit),
            quote(&format!("sha256:{}", c.source_digest)),
            c.records.len()
        ),
    ));
    for r in &c.resources {
        decls.push(definition(
            &resource_name(r.slug),
            &format!("{MODEL}::Resource"),
            &format!(
                "(record {MODEL}::Resource {{index := {}, slug := {}, title := {}, modality := (ctor {MODEL}::Modality.{})}})",
                r.index,
                quote(r.slug),
                quote(r.title),
                r.modality.constructor()
            ),
        ));
    }
    let resource_refs: Vec<String> = c
        .resources
        .iter()
        .map(|r| format!("({})", resource_name(r.slug)))
        .collect();
    decls.push(definition(
        "resources",
        &format!("(List {MODEL}::Resource)"),
        &list(&resource_refs, &format!("{MODEL}::Resource")),
    ));
    let records: Vec<String> = c
        .records
        .iter()
        .map(|r| {
            format!(
                "(record {MODEL}::SubjectRecord {{index := {}, id := {}, facet := (ctor {MODEL}::Facet.{})}})",
                r.index,
                quote(&r.id),
                r.facet.constructor()
            )
        })
        .collect();
    chunked(
        &mut decls,
        "records",
        "SubjectRecord",
        "appendRecords",
        &records,
    );
    let rows: Vec<String> = c
        .covers
        .iter()
        .enumerate()
        .map(|(i, rs)| {
            let nats: Vec<String> = rs.iter().map(|n| n.to_string()).collect();
            format!(
                "(record {MODEL}::Covers {{record := {i}, resources := {}}})",
                list(&nats, "Nat")
            )
        })
        .collect();
    chunked(&mut decls, "covers", "Covers", "appendRows", &rows);
    let view = "Foundation.View.Text.V1.Model::AcceptanceVector";
    let vector_items: Vec<String> = vectors(c)
        .iter()
        .map(|(q, a)| {
            format!(
                "(record {view} {{request := {}, response := {}}})",
                hex(q),
                hex(a)
            )
        })
        .collect();
    decls.push(definition(
        "vectors",
        &format!("(List {view})"),
        &list(&vector_items, view),
    ));
    for (name, text) in [
        ("foundText", FOUND_TEXT),
        ("errorText", ERROR_TEXT),
        ("overflowText", OVERFLOW_TEXT),
    ] {
        decls.push(definition(name, "String", &quote(text)));
    }
    let example_items: Vec<String> = examples(c)
        .iter()
        .map(|(id, label, description, value, report)| {
            format!(
                "(record {V3}::Example {{id := {}, label := {}, description := {}, values := (cons {} (nil String)), expectedResponse := {}, explanation := {}}})",
                quote(id),
                quote(label),
                quote(description),
                quote(value),
                quote(&frame::wrap("lookup", value, report)),
                quote(report.split('\n').next().unwrap_or(""))
            )
        })
        .collect();
    decls.push(definition(
        "examples",
        &format!("(List {V3}::Example)"),
        &list(&example_items, &format!("{V3}::Example")),
    ));
    let section_items: Vec<String> = sections(c)
        .iter()
        .map(|(id, title, paragraphs)| {
            let ps: Vec<String> = paragraphs.iter().map(|p| quote(p)).collect();
            format!(
                "(record {V3}::Section {{id := {}, title := {}, paragraphs := {}}})",
                quote(id),
                quote(title),
                list(&ps, "String")
            )
        })
        .collect();
    decls.push(definition(
        "sections",
        &format!("(List {V3}::Section)"),
        &list(&section_items, &format!("{V3}::Section")),
    ));
    // The answers the guest serves. Each record's answer is its own string
    // definition, reached through a balanced tree of comparisons, so the
    // runtime path holds no list and no long chain: the codegen refuses
    // list-valued intermediates and static list constants there.
    for r in &c.records {
        decls.push(definition(
            &format!("answer{}", r.index),
            "String",
            &quote(&c.answer(r.index)),
        ));
    }
    tree(&mut decls, 0, c.records.len());
    let n = c.records.len();
    decls.push(indexed(
        "answerAt",
        &format!(
            "(if (position <? {n}) then (answerIn0x{n} position) else {})",
            quote(crate::UNKNOWN)
        ),
    ));
    for r in c.resources.iter().filter(|r| r.scope.teaches()) {
        let name = resource_name(r.slug);
        decls.push(definition(
            &format!("{name}Teaches"),
            "Bool",
            &format!("({MODEL}::teaches {} (covers))", r.index),
        ));
        // A resource whose rule selects none of the subject's records
        // (facet pages without records are not published) leaves it nothing
        // to teach: the definition still names it, and no theorem claims otherwise.
        if c.covers.iter().any(|rs| rs.contains(&r.index)) {
            decls.push(theorem(
                &format!("{name}TeachesHolds"),
                &format!("(({name}Teaches) = true)"),
            ));
        }
    }
    decls.push(theorem(
        "catalogCovered",
        &format!("(({MODEL}::catalogValid (subject) (records) (resources) (covers)) = true)"),
    ));
    decls.push(theorem(
        "uncoveredRecordRefused",
        &format!("(({MODEL}::catalogValid (subject) (records) (resources) ({MODEL}::withoutFirstCover (covers))) = false)"),
    ));
    decls.push(theorem(
        "undeclaredResourceRefused",
        &format!(
            "(({MODEL}::catalogValid (subject) (records) (resources) ({MODEL}::withUndeclaredCover ({MODEL}::resourceTotal (resources)) (covers))) = false)"
        ),
    ));
    format!(
        "\\begin{{lexlean}}{{Catalog}}\n\\useglossary{{lexlean.std.bool@1.2.0}}\n\\useglossary{{lexlean.std.nat@1.2.0}}\n\\useglossary{{prism.arch@1.0.0}}\n\\importmodule{{{MODEL}}}\n\\importmodule{{Foundation.View.Text.V1.Model}}\n\\importmodule{{Foundation.View.Text.V3.Model}}\n\\title{{DevRel catalog}}\n\\begin{{semanticmodule}}\n{}\\end{{semanticmodule}}\n\\end{{lexlean}}\n",
        decls.join("\n")
    )
}
