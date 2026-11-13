//! The generator's copy of `app/src/Frame.lex.tex`: the JSON the workbench
//! page receives for a framed request. The examples and the framed
//! acceptance vectors in `Catalog.lex.tex` are written from it, and the
//! guest replays those vectors, so a difference between this copy and the
//! model fails `prismpm verify`.

/// The operation prefix of the lookup form.
pub const LOOKUP_PREFIX: &str = "ui-lookup";
/// The operation prefix of the raw editor.
pub const RAW_PREFIX: &str = "ui-raw";
/// The byte between a frame's prefix and its payload.
pub const SEPARATOR: u8 = 0x1f;
/// The largest answer the guest returns; `Frame::bounded` and the
/// application's `responseMaximum`.
pub const RESPONSE_MAXIMUM: usize = 8192;

/// `Catalog::foundText`: the message of a found record.
pub const FOUND_TEXT: &str =
    "Found: the record's identifier, its facet, then every page of its case study that teaches it.";
/// `Catalog::errorText`: the message of a refusal or an invalid request.
pub const ERROR_TEXT: &str = "Not found: the index is past the last record or is not a number. The details name the reason; its fix is listed under refusals and errors.";
/// `Catalog::overflowText`.
pub const OVERFLOW_TEXT: &str =
    "The answer is too large for the page. Look the record up from the command line.";

/// A framed request: prefix, separator, payload.
pub fn framed(prefix: &str, payload: &str) -> Vec<u8> {
    let mut out = prefix.as_bytes().to_vec();
    out.push(SEPARATOR);
    out.extend_from_slice(payload.as_bytes());
    out
}

fn escape(text: &str) -> String {
    let mut out = String::new();
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn string(text: &str) -> String {
    format!("\"{}\"", escape(text))
}

fn array(items: &[&str]) -> String {
    format!(
        "[{}]",
        items
            .iter()
            .map(|i| string(i))
            .collect::<Vec<_>>()
            .join(",")
    )
}

#[allow(clippy::too_many_arguments)]
fn result(
    operation: &str,
    status: &str,
    message: &str,
    rows: usize,
    columns: usize,
    cells: &[&str],
    details: &[&str],
    request: &str,
    response: &str,
    error: &str,
) -> String {
    format!(
        "{{\"version\":1,\"status\":{},\"operation\":{},\"message\":{},\"rows\":{rows},\"columns\":{columns},\"cells\":{},\"details\":{},\"request\":{},\"response\":{},\"error\":{}}}",
        string(status),
        string(operation),
        string(message),
        array(cells),
        array(details),
        string(request),
        string(response),
        string(error)
    )
}

fn overflow(operation: &str) -> String {
    result(
        operation,
        "error",
        ERROR_TEXT,
        0,
        0,
        &[],
        &[OVERFLOW_TEXT],
        "",
        "",
        "too-large",
    )
}

/// `Frame::answer`: the JSON for the answer `report` to `request` under
/// `operation`.
pub fn wrap(operation: &str, request: &str, report: &str) -> String {
    let lines: Vec<&str> = report.split('\n').collect();
    let first = lines[0];
    let json = if first.split(' ').next() == Some("record") {
        result(
            operation,
            "ok",
            FOUND_TEXT,
            lines.len(),
            1,
            &lines,
            &[],
            request,
            report,
            "",
        )
    } else {
        let code = first.split(' ').next_back().unwrap_or("");
        result(
            operation,
            "error",
            ERROR_TEXT,
            0,
            0,
            &[],
            &lines,
            request,
            report,
            code,
        )
    };
    if json.len() > RESPONSE_MAXIMUM {
        overflow(operation)
    } else {
        json
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_found_and_refused_answers() {
        let found = wrap("lookup", "0", "record A::b\nfacet design\npage design");
        assert!(found.starts_with("{\"version\":1,\"status\":\"ok\",\"operation\":\"lookup\""));
        assert!(found.contains(
            "\"rows\":3,\"columns\":1,\"cells\":[\"record A::b\",\"facet design\",\"page design\"]"
        ));
        let refused = wrap("raw", "9", "refused unknown-record");
        assert!(refused.contains("\"details\":[\"refused unknown-record\"]"));
        assert!(refused.ends_with("\"error\":\"unknown-record\"}"));
        assert_eq!(escape("a\u{1f}\"\\"), "a\\u001f\\\"\\\\");
    }
}
