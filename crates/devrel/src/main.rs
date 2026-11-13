//! `devrel-catalog`: build the case studies of the subjects
//! `devrel/subjects.json` lists, and the DevRel catalog of the one it names
//! as `catalog`.
//!
//! ```text
//! devrel-catalog --subjects devrel/subjects.json --checkouts <dir>
//!                --self-root <repo root> --self-commit <40-hex>
//!                [--lean app/src/Catalog.lex.tex] [--check] [--site <site dir>]
//! ```
//!
//! `<dir>/<slug>` is the checkout of each subject at its pin; the self
//! subject is `--self-root` at `--self-commit`. `--lean` writes the catalog
//! subject's LexLean data, or with `--check` compares it with the committed
//! file and fails if they differ: the committed catalog is then not the
//! catalog of the pinned subject. `--site` writes every case study, the facet
//! pages and the redirects from the old `learn/` addresses.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use devrel_catalog::site::Study;
use devrel_catalog::tutorial::Tutorial;
use devrel_catalog::{lean, site, Catalog, SubjectConfig, Subjects};

struct Args {
    subjects: PathBuf,
    checkouts: PathBuf,
    self_root: PathBuf,
    self_commit: String,
    lean: Option<PathBuf>,
    site: Option<PathBuf>,
    check: bool,
}

fn parse() -> Result<Args, String> {
    let mut subjects = PathBuf::from("devrel/subjects.json");
    let mut checkouts = None;
    let mut self_root = None;
    let mut self_commit = None;
    let mut lean = None;
    let mut site = None;
    let mut check = false;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut value = || args.next().ok_or_else(|| format!("{arg} needs a value"));
        match arg.as_str() {
            "--subjects" => subjects = PathBuf::from(value()?),
            "--checkouts" => checkouts = Some(PathBuf::from(value()?)),
            "--self-root" => self_root = Some(PathBuf::from(value()?)),
            "--self-commit" => self_commit = Some(value()?),
            "--lean" => lean = Some(PathBuf::from(value()?)),
            "--site" => site = Some(PathBuf::from(value()?)),
            "--check" => check = true,
            other => return Err(format!("unknown argument {other}")),
        }
    }
    Ok(Args {
        subjects,
        checkouts: checkouts.ok_or("--checkouts <dir> names the directory of subject checkouts")?,
        self_root: self_root.ok_or("--self-root <dir> names this repository's root")?,
        self_commit: self_commit.ok_or("--self-commit <40-hex> names the commit being built")?,
        lean,
        site,
        check,
    })
}

fn main() -> ExitCode {
    let args = match parse() {
        Ok(a) => a,
        Err(why) => {
            eprintln!("devrel-catalog: {why}");
            return ExitCode::from(64);
        }
    };
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(why) => {
            eprintln!("devrel-catalog: {why}");
            ExitCode::FAILURE
        }
    }
}

/// The checkout a subject is read from, and its Prism project inside it.
fn locate(args: &Args, s: &SubjectConfig) -> (PathBuf, PathBuf) {
    let checkout = if s.own {
        args.self_root.clone()
    } else {
        args.checkouts.join(&s.slug)
    };
    let project = checkout.join(s.path.trim_matches('/'));
    (checkout, project)
}

fn study(args: &Args, s: &SubjectConfig) -> Result<Study, String> {
    let (checkout, project) = locate(args, s);
    let tutorial = match &s.tutorial {
        Some(config) => {
            Some(Tutorial::build(s, config, &checkout).map_err(|e| format!("{}: {e}", s.slug))?)
        }
        None => None,
    };
    let catalog = Catalog::build(s.clone(), &project).map_err(|e| format!("{}: {e}", s.slug))?;
    Ok(Study { catalog, tutorial })
}

fn lean_out(path: &Path, catalog: &Catalog, check: bool) -> Result<(), String> {
    let generated = lean::catalog(catalog);
    if check {
        let committed =
            std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
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
        std::fs::write(path, generated).map_err(|e| format!("{}: {e}", path.display()))?;
    }
    Ok(())
}

fn run(args: &Args) -> Result<(), String> {
    let text = std::fs::read_to_string(&args.subjects)
        .map_err(|e| format!("{}: {e}", args.subjects.display()))?;
    let subjects = Subjects::parse(&text, &args.self_commit).map_err(|e| e.to_string())?;
    // The catalog subject first: --lean may rewrite app/src/Catalog.lex.tex,
    // which the self subject's case study then reads.
    let primary = study(args, subjects.catalog())?;
    if let Some(path) = &args.lean {
        lean_out(path, &primary.catalog, args.check)?;
    }
    let mut studies = Vec::new();
    let mut primary = Some(primary);
    for s in &subjects.subjects {
        if s.slug == subjects.catalog {
            studies.push(primary.take().expect("the catalog subject is listed once"));
        } else if args.site.is_some() {
            studies.push(study(args, s)?);
        }
    }
    if let Some(dir) = &args.site {
        let pages = site::write(&studies, &subjects.catalog, dir).map_err(|e| e.to_string())?;
        println!("wrote {pages} pages under {}", dir.display());
    }
    for st in &studies {
        let c = &st.catalog;
        let covered = c.covers.iter().filter(|x| !x.is_empty()).count();
        println!(
            "{}: {} records at {} covered by {} pages ({covered}/{} covered)",
            c.subject.slug,
            c.records.len(),
            &c.subject.commit[..12],
            c.published().len(),
            c.records.len()
        );
    }
    Ok(())
}
