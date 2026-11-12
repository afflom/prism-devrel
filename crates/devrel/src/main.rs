//! `devrel-catalog`: build the DevRel catalog of a subject Prism project.
//!
//! ```text
//! devrel-catalog --config devrel/subject.json --subject <checkout>/<path>
//!                [--lean app/src/Catalog.lex.tex] [--check] [--site site]
//! ```
//!
//! `--lean` writes the catalog's LexLean data, or with `--check` compares it
//! with the committed file and fails if they differ: the committed catalog is
//! then not the catalog of the pinned subject. `--site` writes the pages.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use devrel_catalog::tutorial::Tutorial;
use devrel_catalog::{lean, site, Catalog, SubjectConfig};

fn main() -> ExitCode {
    let mut config = PathBuf::from("devrel/subject.json");
    let mut subject: Option<PathBuf> = None;
    let mut lean_out: Option<PathBuf> = None;
    let mut site_out: Option<PathBuf> = None;
    let mut check = false;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--config" => config = args.next().map(PathBuf::from).unwrap_or(config),
            "--subject" => subject = args.next().map(PathBuf::from),
            "--lean" => lean_out = args.next().map(PathBuf::from),
            "--site" => site_out = args.next().map(PathBuf::from),
            "--check" => check = true,
            other => {
                eprintln!("devrel-catalog: unknown argument {other}");
                return ExitCode::from(64);
            }
        }
    }
    let Some(subject) = subject else {
        eprintln!("devrel-catalog: --subject <dir> names the subject's Prism project");
        return ExitCode::from(64);
    };
    match run(&config, &subject, lean_out, site_out, check) {
        Ok(()) => ExitCode::SUCCESS,
        Err(why) => {
            eprintln!("devrel-catalog: {why}");
            ExitCode::FAILURE
        }
    }
}

fn run(
    config: &Path,
    subject: &Path,
    lean_out: Option<PathBuf>,
    site_out: Option<PathBuf>,
    check: bool,
) -> Result<(), String> {
    let text = std::fs::read_to_string(config).map_err(|e| format!("{}: {e}", config.display()))?;
    let config = SubjectConfig::parse(&text).map_err(|e| e.to_string())?;
    let checkout = config.checkout(subject);
    let tutorial =
        Tutorial::build(&config, &config.tutorial, &checkout).map_err(|e| e.to_string())?;
    let catalog = Catalog::build(config, subject).map_err(|e| e.to_string())?;
    if let Some(path) = lean_out {
        let generated = lean::catalog(&catalog);
        if check {
            let committed =
                std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            if committed != generated {
                return Err(format!(
                    "{} is not the catalog of {} at {}: regenerate it with --lean {} (without --check)",
                    path.display(),
                    catalog.subject.repository,
                    catalog.subject.commit,
                    path.display()
                ));
            }
            println!("{} is the catalog of the pinned subject", path.display());
        } else {
            std::fs::write(&path, generated).map_err(|e| format!("{}: {e}", path.display()))?;
        }
    }
    if let Some(dir) = site_out {
        let pages = site::write(&catalog, &tutorial, &dir).map_err(|e| e.to_string())?;
        println!("wrote {pages} catalog pages under {}", dir.display());
    }
    let covered = catalog.covers.iter().filter(|c| !c.is_empty()).count();
    println!(
        "{} records of {} covered by {} resources ({covered}/{} covered)",
        catalog.records.len(),
        catalog.subject.name,
        catalog.resources.len(),
        catalog.records.len()
    );
    Ok(())
}
