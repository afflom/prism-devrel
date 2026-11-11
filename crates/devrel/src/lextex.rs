//! A reader for canonical LexLean source, as `lexlean fmt` writes it: enough
//! to find a module's name, its top-level declarations and their fields, and
//! the fields of a record literal. It does not type-check anything; the SDK
//! does that before a catalog is published.

use crate::Field;

/// A top-level declaration: `definition{...}`, `theorem{...}` and the rest.
#[derive(Clone, Debug)]
pub struct Declaration {
    /// `definition`, `theorem`, `structure`, `inductive`, ...
    pub keyword: String,
    /// The declaration's `name`.
    pub name: String,
    /// Every `key: value` field, values as source text.
    pub fields: Vec<(String, String)>,
}

impl Declaration {
    /// A field's source text.
    pub fn field(&self, key: &str) -> Option<&str> {
        self.fields
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }
}

/// A module.
#[derive(Clone, Debug)]
pub struct Module {
    /// The name in `\begin{lexlean}{...}`.
    pub name: String,
    /// The `\title{...}`.
    pub title: String,
    /// Its top-level declarations, in source order.
    pub declarations: Vec<Declaration>,
    /// The names of the structures it declares.
    pub structures: Vec<String>,
}

const KEYWORDS: [&str; 6] = [
    "definition",
    "theorem",
    "structure",
    "inductive",
    "class",
    "instance",
];

/// Parse one module.
pub fn parse(text: &str) -> Result<Module, String> {
    let name = between(text, "\\begin{lexlean}{", "}").ok_or("no \\begin{lexlean}{...}")?;
    let title = between(text, "\\title{", "}").unwrap_or_default();
    let mut declarations = Vec::new();
    let mut at = 0;
    while at < text.len() {
        let line_end = text[at..].find('\n').map_or(text.len(), |n| at + n);
        let line = &text[at..line_end];
        if let Some(keyword) = KEYWORDS
            .iter()
            .find(|k| line.starts_with(&format!("{k}{{")))
        {
            let open = at + keyword.len();
            let close = matching(text, open)
                .ok_or_else(|| format!("{keyword} at byte {at} is not closed"))?;
            let inner = &text[open + 1..close];
            let fields: Vec<(String, String)> = split_top(inner, ',')
                .into_iter()
                .filter_map(|part| {
                    let part = part.trim();
                    let colon = part.find(':')?;
                    let key = part[..colon].trim();
                    if key.is_empty()
                        || !key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
                    {
                        return None;
                    }
                    Some((key.to_string(), part[colon + 1..].trim().to_string()))
                })
                .collect();
            let name = fields
                .iter()
                .find(|(k, _)| k == "name")
                .map(|(_, v)| v.clone())
                .ok_or_else(|| format!("{keyword} at byte {at} has no name"))?;
            declarations.push(Declaration {
                keyword: (*keyword).to_string(),
                name,
                fields,
            });
            at = close + 1;
            continue;
        }
        at = line_end + 1;
    }
    let structures = declarations
        .iter()
        .filter(|d| d.keyword == "structure")
        .map(|d| d.name.clone())
        .collect();
    Ok(Module {
        name: name.to_string(),
        title: title.to_string(),
        declarations,
        structures,
    })
}

fn between<'a>(text: &'a str, open: &str, close: &str) -> Option<&'a str> {
    let start = text.find(open)? + open.len();
    let end = text[start..].find(close)? + start;
    Some(&text[start..end])
}

/// The index of the bracket closing the one at `open`, skipping string
/// literals.
fn matching(text: &str, open: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut depth = 0usize;
    let mut quoted = false;
    let mut i = open;
    while i < bytes.len() {
        let c = bytes[i];
        if quoted {
            if c == b'\\' {
                i += 2;
                continue;
            }
            if c == b'"' {
                quoted = false;
            }
        } else {
            match c {
                b'"' => quoted = true,
                b'{' | b'(' | b'[' => depth += 1,
                b'}' | b')' | b']' => {
                    depth = depth.checked_sub(1)?;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    None
}

/// Split at `sep` where no bracket is open and no string is.
pub fn split_top(text: &str, sep: char) -> Vec<&str> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut quoted = false;
    let mut escaped = false;
    let mut start = 0;
    for (i, c) in text.char_indices() {
        if quoted {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                quoted = false;
            }
            continue;
        }
        match c {
            '"' => quoted = true,
            '{' | '(' | '[' => depth += 1,
            '}' | ')' | ']' => depth -= 1,
            c if c == sep && depth == 0 => {
                out.push(&text[start..i]);
                start = i + c.len_utf8();
            }
            _ => {}
        }
    }
    out.push(&text[start..]);
    out
}

/// Decode a string literal's contents.
pub fn unquote(literal: &str) -> Option<String> {
    let inner = literal.strip_prefix('"')?.strip_suffix('"')?;
    let mut out = String::new();
    let mut chars = inner.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next()? {
                'n' => out.push('\n'),
                't' => out.push('\t'),
                other => out.push(other),
            }
        } else {
            out.push(c);
        }
    }
    Some(out)
}

/// The fields of `(record T {a := x, b := y})`; empty for any other body.
pub fn record_fields(body: &str) -> Vec<Field> {
    let body = body.trim();
    let Some(rest) = body.strip_prefix("(record ") else {
        return Vec::new();
    };
    let Some(open) = rest.find('{') else {
        return Vec::new();
    };
    let Some(close) = matching(rest, open) else {
        return Vec::new();
    };
    split_top(&rest[open + 1..close], ',')
        .into_iter()
        .filter_map(|part| {
            let (key, value) = part.split_once(":=")?;
            let value = value.trim();
            Some(match unquote(value) {
                Some(text) => Field {
                    name: key.trim().to_string(),
                    value: text,
                    text: true,
                },
                None => Field {
                    name: key.trim().to_string(),
                    value: value.to_string(),
                    text: false,
                },
            })
        })
        .collect()
}

/// A Lean string literal for `text`.
pub fn quote(text: &str) -> String {
    let mut out = String::from("\"");
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_one_line_and_multi_line_declarations() {
        let text = "\\begin{lexlean}{A.B}\n\\title{T}\n\\begin{semanticmodule}\nstructure{name: S, type_parameters: [], parameters: [], fields: [{name: index, type: Nat}]}\n\ndefinition{\n  name: x,\n  parameters: [],\n  result: Foundation.Arch::Concern,\n  body: (record Foundation.Arch::Concern {index := 0, name := \"a, b\", text := \"say \\\"hi\\\"\"})\n}\n\\end{semanticmodule}\n\\end{lexlean}\n";
        let m = parse(text).unwrap();
        assert_eq!(m.name, "A.B");
        assert_eq!(m.structures, vec!["S"]);
        let d = &m.declarations[1];
        assert_eq!(d.name, "x");
        let f = record_fields(d.field("body").unwrap());
        assert_eq!(f[1].value, "a, b");
        assert_eq!(f[2].value, "say \"hi\"");
        assert_eq!(quote("say \"hi\""), "\"say \\\"hi\\\"\"");
    }
}
