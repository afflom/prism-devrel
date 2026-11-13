//! `prism-fidelity`: score a Prism project and keep its register.
//!
//! ```text
//! prism-fidelity --project app --repo . --register fidelity.toml
//!                [--cite model/provenance.toml app/src/Provenance.lex.tex]
//!                [--lean app/src/Fidelity.lex.tex] [--json scorecard.json] [--check]
//! ```
//!
//! Without `--check` it writes the register (and the LexLean measurement data
//! and the scorecard when asked). With `--check` it writes nothing and fails
//! when a committed file differs from what it would write, or when a closed κ
//! is open again.

use std::path::PathBuf;
use std::process::ExitCode;

use prism_fidelity::{file_kappa, lean, score, scorecard, Register};

fn main() -> ExitCode {
    let mut project = PathBuf::from("app");
    let mut repo = PathBuf::from(".");
    let mut register = PathBuf::from("fidelity.toml");
    let mut lean_out: Option<PathBuf> = None;
    let mut json_out: Option<PathBuf> = None;
    let mut check = false;
    let mut cite: Option<(PathBuf, PathBuf)> = None;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut path = |d: PathBuf| args.next().map(PathBuf::from).unwrap_or(d);
        match arg.as_str() {
            "--project" => project = path(project),
            "--repo" => repo = path(repo),
            "--register" => register = path(register),
            "--lean" => lean_out = Some(path(PathBuf::new())),
            "--json" => json_out = Some(path(PathBuf::new())),
            "--check" => check = true,
            "--cite" => {
                let list = path(PathBuf::new());
                let out = path(PathBuf::new());
                cite = Some((list, out));
            }
            other => {
                eprintln!("prism-fidelity: unknown argument {other}");
                return ExitCode::from(64);
            }
        }
    }
    if let Some((list, out)) = &cite {
        if let Err(why) = run_cite(&project, &repo, list, out, check) {
            eprintln!("prism-fidelity: {why}");
            return ExitCode::FAILURE;
        }
    }
    match run(&project, &repo, &register, lean_out, json_out, check) {
        Ok(summary) => {
            println!("{summary}");
            ExitCode::SUCCESS
        }
        Err(why) => {
            eprintln!("prism-fidelity: {why}");
            ExitCode::FAILURE
        }
    }
}

fn run_cite(
    project: &std::path::Path,
    repo: &std::path::Path,
    list: &std::path::Path,
    out: &std::path::Path,
    check: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let text = std::fs::read_to_string(list).map_err(|e| format!("{}: {e}", list.display()))?;
    let (module, derived) = prism_fidelity::cite::module(project, repo, &text)?;
    if check {
        if std::fs::read_to_string(out).unwrap_or_default() != module {
            return Err(format!(
                "{} is not what the sources cite: run prism-fidelity without --check",
                out.display()
            )
            .into());
        }
    } else {
        std::fs::write(out, module).map_err(|e| format!("{}: {e}", out.display()))?;
    }
    println!("{derived} records cited from their primary sources");
    Ok(())
}

fn run(
    project: &std::path::Path,
    repo: &std::path::Path,
    register: &std::path::Path,
    lean_out: Option<PathBuf>,
    json_out: Option<PathBuf>,
    check: bool,
) -> Result<String, Box<dyn std::error::Error>> {
    let score = score(project, repo)?;
    let previous = match std::fs::read_to_string(register) {
        Ok(text) => Register::parse(&text)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && !check => Register::default(),
        Err(e) => return Err(format!("{}: {e}", register.display()).into()),
    };
    let next = Register::next(&previous, &score)?;
    let text = next.render();
    let location = register
        .strip_prefix(repo)
        .unwrap_or(register)
        .to_string_lossy()
        .replace('\\', "/");
    let kappa = file_kappa(&location, text.as_bytes());
    let mut outputs = vec![(register.to_path_buf(), text)];
    if let Some(p) = lean_out {
        outputs.push((p, lean::module(&score, &location, &kappa)));
    }
    if let Some(p) = json_out {
        outputs.push((p, scorecard(&score)));
    }
    for (path, text) in &outputs {
        if check {
            let committed = std::fs::read_to_string(path).unwrap_or_default();
            if &committed != text {
                return Err(format!(
                    "{} is not what the model scores to: run prism-fidelity without --check",
                    path.display()
                )
                .into());
            }
        } else {
            std::fs::write(path, text).map_err(|e| format!("{}: {e}", path.display()))?;
        }
    }
    Ok(prism_fidelity::summary(&score))
}
