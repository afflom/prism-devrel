//! The catalog as LexLean: `app/src/Catalog.lex.tex`, written in the form
//! `lexlean fmt` keeps, so that regenerating it from the pinned subject is a
//! byte comparison.

use crate::lextex::quote;
use crate::{Catalog, Scope};

const MODEL: &str = "Foundation.DevRel.V1.Model";

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
            ("result", "Bytes".into()),
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

/// The acceptance vectors of the lookup, replayed in the compiled guest: the first and last record, the
/// first index past the end, and two malformed requests.
pub fn vectors(c: &Catalog) -> Vec<(Vec<u8>, Vec<u8>)> {
    let last = c.records.len() - 1;
    let middle = c.records.len() / 2;
    let mut out: Vec<(Vec<u8>, Vec<u8>)> = [0, middle, last, c.records.len()]
        .iter()
        .map(|i| (i.to_string().into_bytes(), c.answer(*i).into_bytes()))
        .collect();
    out.push((b"7x".to_vec(), b"invalid request".to_vec()));
    out.push((b"".to_vec(), b"invalid request".to_vec()));
    // The guest allocation bound is 17 bytes; the text profile requires one
    // request exactly that long.
    out.push((b"12345678901234567".to_vec(), b"invalid request".to_vec()));
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
    // The answers the guest serves. Each record's answer is its own small
    // definition, reached through a balanced tree of comparisons, so the
    // compiled guest holds no long list: the production exporter refuses a
    // let-chain as deep as one element per record (PP5008, TooLarge).
    for r in &c.records {
        decls.push(definition(
            &format!("answer{}", r.index),
            "Bytes",
            &hex(c.answer(r.index).as_bytes()),
        ));
    }
    tree(&mut decls, 0, c.records.len());
    let n = c.records.len();
    decls.push(indexed(
        "answerAt",
        &format!("(if (position <? {n}) then (answerIn0x{n} position) else (prim utf8_encode \"unknown record\" : Bytes))"),
    ));
    for r in c.resources.iter().filter(|r| r.scope != Scope::Index) {
        let name = resource_name(r.slug);
        decls.push(definition(
            &format!("{name}Teaches"),
            "Bool",
            &format!("({MODEL}::teaches {} (covers))", r.index),
        ));
        // A subject with no record in a resource's scope (no extension facet,
        // say) leaves that page with nothing to teach: the definition still
        // names it, and no theorem claims otherwise.
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
        "\\begin{{lexlean}}{{Catalog}}\n\\useglossary{{lexlean.std.bool@1.2.0}}\n\\useglossary{{lexlean.std.nat@1.2.0}}\n\\useglossary{{prism.arch@1.0.0}}\n\\importmodule{{{MODEL}}}\n\\importmodule{{Foundation.View.Text.V1.Model}}\n\\title{{DevRel catalog}}\n\\begin{{semanticmodule}}\n{}\\end{{semanticmodule}}\n\\end{{lexlean}}\n",
        decls.join("\n")
    )
}
