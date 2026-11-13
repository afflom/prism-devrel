//! The DevRel catalog generator.
//!
//! A subject is a Prism project: a directory with `src/**/*.lex.tex`. This
//! crate reads every module of it, takes out its facet records (the
//! definitions whose result is a record type of a Prism facet, and the
//! theorems of its own modules), numbers them by identifier, and assigns each
//! to the learning resources that teach it. [`lean::catalog`] writes that as
//! the LexLean data the DevRel extension facet decides coverage over, and
//! [`site::write`] writes the pages that are those resources.
//!
//! Records and pages come out of one function, [`Catalog::build`], so a page
//! cannot teach a record the catalog does not list, and the catalog cannot
//! claim a page covers a record the page does not show.

use std::collections::BTreeMap;
use std::fmt;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

pub mod frame;
pub mod lean;
pub mod lextex;
pub mod site;
pub mod tutorial;

/// Why the catalog could not be built.
#[derive(Debug)]
pub enum CatalogError {
    /// A file could not be read or written.
    Io(PathBuf, std::io::Error),
    /// A module is not canonical LexLean source this reader understands.
    Source(PathBuf, String),
    /// The subject declares no facet record, so there is nothing to teach.
    Empty(PathBuf),
    /// The subjects configuration is not what `devrel/subjects.json` must hold.
    Config(String),
    /// The subject's checkout no longer holds what the tutorial shows.
    Tutorial(String),
}

impl fmt::Display for CatalogError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(path, e) => write!(f, "{}: {e}", path.display()),
            Self::Source(path, why) => write!(f, "{}: {why}", path.display()),
            Self::Empty(path) => write!(
                f,
                "{}: the subject declares no facet record",
                path.display()
            ),
            Self::Config(why) => write!(f, "devrel/subjects.json: {why}"),
            Self::Tutorial(why) => write!(f, "the subject's tutorial: {why}"),
        }
    }
}

impl std::error::Error for CatalogError {}

/// The facet a record belongs to, in the order the DevRel model declares
/// `Foundation.DevRel.V1.Model::Facet`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Facet {
    /// ISO/IEC/IEEE 42010 architecture description.
    Architecture,
    /// OPM and UML design views.
    Design,
    /// Features and user journeys.
    Features,
    /// ISO 27034 and 27005 security records and the threat model rows.
    Security,
    /// ISO/IEC 25010 product quality.
    Quality,
    /// Theorems the Lean kernel checks.
    Behavior,
    /// The production system model and release manifest.
    System,
    /// Records of a use-case extension facet, `Foundation.<Domain>.V1.Model`.
    Extension,
    /// The application record.
    Application,
}

impl Facet {
    /// Every facet, in declaration order.
    pub const ALL: [Facet; 9] = [
        Facet::Architecture,
        Facet::Design,
        Facet::Features,
        Facet::Security,
        Facet::Quality,
        Facet::Behavior,
        Facet::System,
        Facet::Extension,
        Facet::Application,
    ];

    /// The constructor name in `Foundation.DevRel.V1.Model::Facet`.
    pub fn constructor(self) -> &'static str {
        match self {
            Facet::Architecture => "architecture",
            Facet::Design => "design",
            Facet::Features => "features",
            Facet::Security => "security",
            Facet::Quality => "quality",
            Facet::Behavior => "behavior",
            Facet::System => "system",
            Facet::Extension => "extension",
            Facet::Application => "application",
        }
    }

    /// The facet's name in prose.
    pub fn label(self) -> &'static str {
        match self {
            Facet::Architecture => "Architecture",
            Facet::Design => "Design views",
            Facet::Features => "Features and journeys",
            Facet::Security => "Security and threat model",
            Facet::Quality => "Quality",
            Facet::Behavior => "Behavior and proofs",
            Facet::System => "System and release",
            Facet::Extension => "Extension facets",
            Facet::Application => "Application",
        }
    }
}

/// A modality of a learning resource, in the order the DevRel model declares
/// `Foundation.DevRel.V1.Model::Modality`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Modality {
    /// A page read top to bottom.
    Walkthrough,
    /// A page looked things up in.
    Reference,
    /// A page whose content is drawn.
    Diagram,
    /// A page that answers a question the reader asks it.
    InteractiveExplorer,
    /// Slides with a script to read over them.
    VideoScript,
    /// Plain text for an agent: llms.txt and the Markdown twins.
    AgentTwin,
}

impl Modality {
    /// The constructor name in `Foundation.DevRel.V1.Model::Modality`.
    pub fn constructor(self) -> &'static str {
        match self {
            Modality::Walkthrough => "walkthrough",
            Modality::Reference => "reference",
            Modality::Diagram => "diagram",
            Modality::InteractiveExplorer => "interactiveExplorer",
            Modality::VideoScript => "videoScript",
            Modality::AgentTwin => "agentTwin",
        }
    }

    /// The modality in prose.
    pub fn label(self) -> &'static str {
        match self {
            Modality::Walkthrough => "Walkthrough",
            Modality::Reference => "Reference",
            Modality::Diagram => "Diagrams",
            Modality::InteractiveExplorer => "Interactive",
            Modality::VideoScript => "Slides and script",
            Modality::AgentTwin => "Agent twin",
        }
    }
}

/// What a resource teaches, as a rule over records.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
    /// Every record of one facet.
    Facet(Facet),
    /// The application record and the journeys: where a newcomer starts.
    GettingStarted,
    /// The stakeholders, concerns and application: why the model is shaped so.
    CaseStudy,
    /// The first record of each facet: one slide each.
    FirstOfEachFacet,
    /// An index of every record, kept apart from coverage so that coverage
    /// is earned by the pages that explain a record, not by a list of them.
    Index,
    /// The subject's tool as its source declares it: commands and options,
    /// which are not facet records, so the page covers none.
    Tool,
}

impl Scope {
    /// Whether a resource of this scope teaches facet records, so that its
    /// coverage is a claim the catalog decides.
    pub fn teaches(self) -> bool {
        !matches!(self, Scope::Index | Scope::Tool)
    }

    /// Whether a resource of this scope is read from the subject's tutorial
    /// member, so that a subject without one does not publish it.
    pub fn needs_tutorial(self) -> bool {
        matches!(self, Scope::GettingStarted | Scope::Tool)
    }
}

/// A Diátaxis documentation type (Procida, diataxis.fr): the identifiers
/// `builder/site.mjs` gives its pages, so the whole site is one taxonomy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Diataxis {
    /// Learning-oriented: a lesson the reader follows to a result.
    Tutorial,
    /// Task-oriented: steps to a goal the reader already has.
    HowToGuide,
    /// Information-oriented: a description to look things up in.
    Reference,
    /// Understanding-oriented: why things are as they are.
    Explanation,
}

impl Diataxis {
    /// The identifier, as `<meta name="diataxis">` carries it.
    pub fn id(self) -> &'static str {
        match self {
            Diataxis::Tutorial => "tutorial",
            Diataxis::HowToGuide => "howToGuide",
            Diataxis::Reference => "reference",
            Diataxis::Explanation => "explanation",
        }
    }

    /// The type in prose.
    pub fn label(self) -> &'static str {
        match self {
            Diataxis::Tutorial => "tutorial",
            Diataxis::HowToGuide => "how-to guide",
            Diataxis::Reference => "reference",
            Diataxis::Explanation => "explanation",
        }
    }
}

/// A stage of the developer journey (Lewko and Parton, *Developer
/// Relations*), with `builder/site.mjs`'s identifiers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Journey {
    /// Finding out the product exists and what it is for.
    Discover,
    /// Deciding whether it fits.
    Evaluate,
    /// Getting to a first result.
    Learn,
    /// Making something real with it.
    Build,
    /// Running it at scale and contributing back.
    Scale,
}

impl Journey {
    /// The identifier, as `<meta name="developer-journey">` carries it.
    pub fn id(self) -> &'static str {
        match self {
            Journey::Discover => "discover",
            Journey::Evaluate => "evaluate",
            Journey::Learn => "learn",
            Journey::Build => "build",
            Journey::Scale => "scale",
        }
    }

    /// The stage in prose.
    pub fn label(self) -> &'static str {
        match self {
            Journey::Discover => "Discover",
            Journey::Evaluate => "Evaluate",
            Journey::Learn => "Learn",
            Journey::Build => "Build",
            Journey::Scale => "Scale",
        }
    }
}

/// A learning resource: one page of the catalog.
#[derive(Clone, Debug)]
pub struct Resource {
    /// Position in the subject's catalog.
    pub index: usize,
    /// The page's path under the subject's case study, and the stem of its
    /// declaration.
    pub slug: &'static str,
    /// The page's title, `{subject}` standing for the subject's name.
    pub title: &'static str,
    /// How it teaches.
    pub modality: Modality,
    /// What it teaches.
    pub scope: Scope,
    /// Its Diátaxis type.
    pub diataxis: Diataxis,
    /// The journey stage it serves.
    pub journey: Journey,
    /// One sentence on what a reader gets from it, `{subject}` standing for
    /// the subject's name.
    pub summary: &'static str,
}

impl Resource {
    /// The title for the subject named `subject`.
    pub fn title_for(&self, subject: &str) -> String {
        self.title.replace("{subject}", subject)
    }

    /// The summary for the subject named `subject`.
    pub fn summary_for(&self, subject: &str) -> String {
        self.summary.replace("{subject}", subject)
    }
}

macro_rules! resources {
    ($( $slug:literal, $title:literal, $modality:ident, $scope:expr, $diataxis:ident, $journey:ident, $summary:literal; )*) => {
        /// Every resource the catalog publishes, in declaration order.
        pub fn resources() -> Vec<Resource> {
            [$( ($slug, $title, Modality::$modality, $scope, Diataxis::$diataxis, Journey::$journey, $summary) ),*]
                .into_iter()
                .enumerate()
                .map(|(index, (slug, title, modality, scope, diataxis, journey, summary))| Resource { index, slug, title, modality, scope, diataxis, journey, summary })
                .collect()
        }
    };
}

resources! {
    "getting-started", "Turn a Rust project into a Prism model", Walkthrough, Scope::GettingStarted, Tutorial, Learn,
        "Run {subject} on a sample workspace and check what it writes. Then read a Rust function beside the LexLean it became.";
    "case-study", "How {subject} was modeled", Walkthrough, Scope::CaseStudy, Explanation, Evaluate,
        "Who the {subject} model is for and what they care about. Then how those concerns became facets.";
    "architecture", "Architecture walkthrough", Walkthrough, Scope::Facet(Facet::Architecture), Explanation, Learn,
        "Who {subject} is for, what they care about, its parts and how they connect.";
    "design", "Design views in OPM and UML", Diagram, Scope::Facet(Facet::Design), Explanation, Learn,
        "Every design view of {subject}, drawn. It shows things, steps, parts, messages and states.";
    "features", "Features and journeys", Walkthrough, Scope::Facet(Facet::Features), Explanation, Learn,
        "What {subject} does, the calls that do it, the rows that accept it, and the paths people take.";
    "security", "Security and threat model", Walkthrough, Scope::Facet(Facet::Security), Explanation, Evaluate,
        "The assets of {subject}, its threats, risks and controls, and the risks it accepts on purpose.";
    "quality", "Quality model (ISO/IEC 25010)", Reference, Scope::Facet(Facet::Quality), Reference, Evaluate,
        "What good quality means for {subject}, and the numbers that measure it.";
    "behavior", "Behavior and proofs", Reference, Scope::Facet(Facet::Behavior), Reference, Build,
        "Every theorem of {subject}, and how it is proved. The Lean kernel checks each one.";
    "system", "System and release", Walkthrough, Scope::Facet(Facet::System), Explanation, Scale,
        "What {subject} ships, its release manifest, and how its holo goes live.";
    "extensions", "Extension facets", Reference, Scope::Facet(Facet::Extension), Reference, Build,
        "The records {subject} adds of its own. They sit beside the standard facets.";
    "cli", "Command reference", Reference, Scope::Tool, Reference, Build,
        "Every command and option of the {subject} tool, read from its source. Also the commands its gate runs.";
    "slides", "Slides and video script", VideoScript, Scope::FirstOfEachFacet, Explanation, Discover,
        "One slide for each facet of {subject}, with a script to read over it.";
    "explorer", "Record explorer", InteractiveExplorer, Scope::Index, Reference, Build,
        "Search every record of {subject} by name, facet or text. Each result links to the pages that teach it.";
    "agents", "llms.txt and Markdown twins", AgentTwin, Scope::Index, Reference, Build,
        "The {subject} case study as plain text for agents. It has llms.txt, a twin of each page and a feed.";
}

/// A record field, as written in the record literal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Field {
    /// Field name.
    pub name: String,
    /// The value: decoded text for a string literal, source text otherwise.
    pub value: String,
    /// Whether the value was a string literal.
    pub text: bool,
}

/// A facet record of the subject.
#[derive(Clone, Debug)]
pub struct Record {
    /// Position in identifier order, the index the DevRel model gives it.
    pub index: usize,
    /// `Module::declaration`.
    pub id: String,
    /// Its module.
    pub module: String,
    /// Its declaration name.
    pub name: String,
    /// Its facet.
    pub facet: Facet,
    /// Its result type's short name (`Component`, `ModeledThreat`), or
    /// `theorem`.
    pub kind: String,
    /// The fields of its record literal, or a theorem's statement and proof.
    pub fields: Vec<Field>,
    /// The source file, relative to the subject root.
    pub source: String,
}

impl Record {
    /// The value of a field, if the record has it.
    pub fn field(&self, name: &str) -> Option<&str> {
        self.fields
            .iter()
            .find(|f| f.name == name)
            .map(|f| f.value.as_str())
    }

    /// A one-line human name: the record's `name`, `title` or `statement`
    /// field, or its declaration name.
    pub fn display(&self) -> String {
        for key in ["name", "title", "statement"] {
            if let Some(v) = self.fields.iter().find(|f| f.name == key && f.text) {
                return v.value.clone();
            }
        }
        self.name.clone()
    }

    /// A paragraph about the record, when it carries one.
    pub fn prose(&self) -> Option<&str> {
        ["text", "rationale", "statement"]
            .iter()
            .find_map(|k| self.fields.iter().find(|f| f.name == *k && f.text))
            .map(|f| f.value.as_str())
    }
}

/// Where a subject comes from, as one entry of `devrel/subjects.json`
/// states it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SubjectConfig {
    /// The case study's path segment, `case-studies/<slug>/`.
    pub slug: String,
    /// The subject's name in prose.
    pub name: String,
    /// Its repository URL.
    pub repository: String,
    /// The full commit the catalog is read at: the pin, or for the self
    /// subject the commit being built.
    pub commit: String,
    /// The Prism project's directory inside the repository.
    pub path: String,
    /// The subject's gate workflow, whose passing run a pin moves to.
    pub gate: Option<String>,
    /// What the tutorial runs, in the subject's checkout, for a subject that
    /// has one.
    pub tutorial: Option<tutorial::TutorialConfig>,
    /// Whether the subject is this repository, read at the commit being
    /// built rather than at a pin.
    pub own: bool,
}

fn full_commit(commit: &str) -> bool {
    commit.len() == 40 && commit.bytes().all(|b| b.is_ascii_hexdigit())
}

impl SubjectConfig {
    /// Parse one entry of `devrel/subjects.json`. `self_commit` is the
    /// commit being built, which a `self` subject is read at.
    pub fn from_value(
        value: &serde_json::Value,
        self_commit: &str,
    ) -> Result<SubjectConfig, CatalogError> {
        let slug = value
            .get("slug")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let get = |k: &str| {
            value
                .get(k)
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .ok_or_else(|| CatalogError::Config(format!("{slug}: {k} is not a string")))
        };
        if slug.is_empty()
            || !slug
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        {
            return Err(CatalogError::Config(format!(
                "slug {slug:?} is not lowercase letters, digits and hyphens"
            )));
        }
        let own = value.get("self").and_then(|v| v.as_bool()).unwrap_or(false);
        let commit = if own {
            if value.get("commit").is_some() {
                return Err(CatalogError::Config(format!(
                    "{slug}: a self subject is read at the commit being built, so it names no commit"
                )));
            }
            self_commit.to_string()
        } else {
            get("commit")?
        };
        if !full_commit(&commit) {
            return Err(CatalogError::Config(format!(
                "{slug}: commit {commit:?} is not a full 40-hex commit"
            )));
        }
        let repository = get("repository")?;
        if !repository.starts_with("https://github.com/") {
            return Err(CatalogError::Config(format!(
                "{slug}: repository is not a GitHub URL"
            )));
        }
        let tutorial = match value.get("tutorial") {
            Some(t) => Some(tutorial::TutorialConfig::parse(t)?),
            None => None,
        };
        Ok(SubjectConfig {
            name: get("name")?,
            repository,
            commit,
            path: get("path")?,
            gate: value
                .get("gate")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            tutorial,
            own,
            slug,
        })
    }

    /// The checkout a subject project at `project` sits in: `project` with
    /// one directory taken off for each component of `path`.
    pub fn checkout(&self, project: &Path) -> PathBuf {
        let mut root = project.to_path_buf();
        for _ in Path::new(self.path.trim_matches('/')).components() {
            root.pop();
        }
        root
    }

    /// A file of the checkout on GitHub, at the pinned commit.
    pub fn repo_blob(&self, path: &str) -> String {
        format!("{}/blob/{}/{}", self.repository, self.commit, path)
    }

    /// The subject's file at `path` on GitHub, at the pinned commit.
    pub fn blob(&self, path: &str) -> String {
        let dir = self.path.trim_matches('/');
        if dir.is_empty() {
            format!("{}/blob/{}/{}", self.repository, self.commit, path)
        } else {
            format!("{}/blob/{}/{}/{}", self.repository, self.commit, dir, path)
        }
    }

    /// The subject's tree on GitHub at the commit it is read at.
    pub fn tree(&self) -> String {
        format!("{}/tree/{}", self.repository, self.commit)
    }
}

/// `devrel/subjects.json`: every subject, and which one the app catalogs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Subjects {
    /// The slug of the subject whose catalog is `app/src/Catalog.lex.tex`.
    pub catalog: String,
    /// Every subject, in the order the file lists them.
    pub subjects: Vec<SubjectConfig>,
}

impl Subjects {
    /// Parse `devrel/subjects.json`; `self_commit` is the commit being built.
    pub fn parse(text: &str, self_commit: &str) -> Result<Subjects, CatalogError> {
        let value: serde_json::Value =
            serde_json::from_str(text).map_err(|e| CatalogError::Config(e.to_string()))?;
        let list = value
            .get("subjects")
            .and_then(|v| v.as_array())
            .ok_or_else(|| CatalogError::Config("subjects is not a list".into()))?;
        let subjects = list
            .iter()
            .map(|v| SubjectConfig::from_value(v, self_commit))
            .collect::<Result<Vec<_>, _>>()?;
        if subjects.is_empty() {
            return Err(CatalogError::Config("subjects is empty".into()));
        }
        for (i, s) in subjects.iter().enumerate() {
            if subjects[..i].iter().any(|t| t.slug == s.slug) {
                return Err(CatalogError::Config(format!("{} is listed twice", s.slug)));
            }
        }
        if subjects.iter().filter(|s| s.own).count() > 1 {
            return Err(CatalogError::Config("more than one subject is self".into()));
        }
        let catalog = value
            .get("catalog")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CatalogError::Config("catalog is not a string".into()))?
            .to_string();
        if !subjects.iter().any(|s| s.slug == catalog) {
            return Err(CatalogError::Config(format!(
                "catalog names {catalog}, which is not a subject"
            )));
        }
        Ok(Subjects { catalog, subjects })
    }

    /// The subject the app catalogs.
    pub fn catalog(&self) -> &SubjectConfig {
        self.subjects
            .iter()
            .find(|s| s.slug == self.catalog)
            .expect("parse checks that catalog names a subject")
    }
}

/// The catalog: the subject's records, the resources, and which resources
/// cover each record.
#[derive(Clone, Debug)]
pub struct Catalog {
    /// The subject.
    pub subject: SubjectConfig,
    /// SHA-256 over the subject's sources, path and bytes, in path order.
    pub source_digest: String,
    /// Every facet record, in identifier order.
    pub records: Vec<Record>,
    /// Every resource.
    pub resources: Vec<Resource>,
    /// For each record, by index, the resources that teach it, ascending.
    pub covers: Vec<Vec<usize>>,
}

impl Catalog {
    /// Read the subject project at `root` and build its catalog.
    pub fn build(subject: SubjectConfig, root: &Path) -> Result<Catalog, CatalogError> {
        let src = root.join("src");
        let mut files = Vec::new();
        collect(&src, &mut files)?;
        files.sort();
        let mut hasher = Sha256::new();
        let mut records = Vec::new();
        for file in &files {
            let text =
                std::fs::read_to_string(file).map_err(|e| CatalogError::Io(file.clone(), e))?;
            let rel = file
                .strip_prefix(root)
                .unwrap_or(file)
                .to_string_lossy()
                .replace('\\', "/");
            hasher.update((rel.len() as u64).to_be_bytes());
            hasher.update(rel.as_bytes());
            hasher.update((text.len() as u64).to_be_bytes());
            hasher.update(text.as_bytes());
            let module =
                lextex::parse(&text).map_err(|why| CatalogError::Source(file.clone(), why))?;
            records.extend(facet_records(&module, &rel));
        }
        if records.is_empty() {
            return Err(CatalogError::Empty(root.to_path_buf()));
        }
        records.sort_by(|a, b| a.id.as_bytes().cmp(b.id.as_bytes()));
        for (i, r) in records.iter_mut().enumerate() {
            r.index = i;
        }
        let resources = resources();
        let tutorial = subject.tutorial.is_some();
        let covers = records
            .iter()
            .map(|r| {
                resources
                    .iter()
                    .filter(|res| tutorial || !res.scope.needs_tutorial())
                    .filter(|res| covers(res.scope, r, &records))
                    .map(|res| res.index)
                    .collect()
            })
            .collect();
        let source_digest = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        Ok(Catalog {
            subject,
            source_digest,
            records,
            resources,
            covers,
        })
    }

    /// The resources published as pages for this subject: every one, except
    /// a facet page for a facet the subject has no record of, which would
    /// teach nothing, and the tutorial and command reference of a subject
    /// with no tutorial member. The catalog still declares them, as the
    /// program's capability, and claims nothing for them.
    pub fn published(&self) -> Vec<&Resource> {
        self.resources
            .iter()
            .filter(|r| !matches!(r.scope, Scope::Facet(f) if self.facet(f).is_empty()))
            .filter(|r| self.subject.tutorial.is_some() || !r.scope.needs_tutorial())
            .collect()
    }

    /// The records a resource teaches, in index order.
    pub fn covered_by(&self, resource: usize) -> Vec<&Record> {
        self.records
            .iter()
            .filter(|r| self.covers[r.index].contains(&resource))
            .collect()
    }

    /// The records of one facet, in index order.
    pub fn facet(&self, facet: Facet) -> Vec<&Record> {
        self.records.iter().filter(|r| r.facet == facet).collect()
    }

    /// The record with this identifier.
    pub fn record(&self, id: &str) -> Option<&Record> {
        self.records.iter().find(|r| r.id == id)
    }

    /// Records per facet, for every facet with at least one.
    pub fn counts(&self) -> BTreeMap<Facet, usize> {
        let mut out = BTreeMap::new();
        for r in &self.records {
            *out.entry(r.facet).or_insert(0) += 1;
        }
        out
    }

    /// The answer the DevRel application gives for a record index, the
    /// generator's copy of `Foundation.DevRel.V1.Model::answerFor` so the
    /// page, the guest's answers and the tests can state it: the record's
    /// identifier, its facet, then one line per page that covers it.
    pub fn answer(&self, index: usize) -> String {
        match self.records.get(index) {
            Some(r) => {
                let mut out = format!("record {}\nfacet {}", r.id, r.facet.constructor());
                for &i in &self.covers[index] {
                    out.push_str("\npage ");
                    out.push_str(self.resources[i].slug);
                }
                out
            }
            None => UNKNOWN.to_string(),
        }
    }
}

/// The answer past the last record.
pub const UNKNOWN: &str = "refused unknown-record";
/// The answer to a request that is not one to `lean::index_digits` decimal
/// digits.
pub const INVALID: &str = "error invalid-request";

fn covers(scope: Scope, record: &Record, all: &[Record]) -> bool {
    match scope {
        Scope::Facet(f) => record.facet == f,
        Scope::GettingStarted => record.facet == Facet::Application || record.kind == "Journey",
        Scope::CaseStudy => {
            record.facet == Facet::Application
                || record.kind == "Stakeholder"
                || record.kind == "Concern"
        }
        Scope::FirstOfEachFacet => all
            .iter()
            .find(|r| r.facet == record.facet)
            .is_some_and(|first| first.id == record.id),
        Scope::Index | Scope::Tool => false,
    }
}

fn collect(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), CatalogError> {
    let entries = std::fs::read_dir(dir).map_err(|e| CatalogError::Io(dir.to_path_buf(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| CatalogError::Io(dir.to_path_buf(), e))?;
        let path = entry.path();
        if path.is_dir() {
            collect(&path, out)?;
        } else if path.to_string_lossy().ends_with(".lex.tex") {
            out.push(path);
        }
    }
    Ok(())
}

/// The modules whose records are the standard library's, copied into every
/// project: their sample records are not the subject's.
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
        || module.starts_with("Foundation.View.")
        || module.starts_with("Foundation.Browser.")
}

/// `Foundation.<Domain>.V1.Model`, outside the library.
fn extension_module(module: &str) -> bool {
    let parts: Vec<&str> = module.split('.').collect();
    parts.len() == 4
        && parts[0] == "Foundation"
        && parts[2] == "V1"
        && parts[3] == "Model"
        && !library_module(module)
}

fn classify(result: &str, module: &lextex::Module) -> Option<(Facet, String)> {
    let (owner, short) = match result.rsplit_once("::") {
        Some((o, s)) => (o, s),
        None => {
            if extension_module(&module.name) && module.structures.iter().any(|s| s == result) {
                return Some((Facet::Extension, result.to_string()));
            }
            return None;
        }
    };
    let facet = match owner {
        "Foundation.Arch" => match short {
            "Component" | "Edge" | "Stakeholder" | "Concern" | "Viewpoint" | "View"
            | "StandardReference" => Facet::Architecture,
            "Feature" | "Journey" => Facet::Features,
            "DesignView" | "SystemProcess" | "SystemState" => Facet::Design,
            s if s.starts_with("Opm") || s.starts_with("Uml") => Facet::Design,
            _ => return None,
        },
        "Foundation.Sec" | "Production.ThreatModel" => Facet::Security,
        "Foundation.Qual" => Facet::Quality,
        o if o.starts_with("Production.") => match short {
            "SystemModel" | "SystemManifest" => Facet::System,
            _ => return None,
        },
        o if short == "TextApplication"
            || short == "Application"
            || o.starts_with("Foundation.Browser.Application") =>
        {
            Facet::Application
        }
        o if extension_module(o) => Facet::Extension,
        _ => return None,
    };
    Some((facet, short.to_string()))
}

fn facet_records(module: &lextex::Module, source: &str) -> Vec<Record> {
    if library_module(&module.name) {
        return Vec::new();
    }
    let mut out = Vec::new();
    for decl in &module.declarations {
        let (facet, kind, fields) = match decl.keyword.as_str() {
            "definition" => {
                let Some(result) = decl.field("result") else {
                    continue;
                };
                if decl.field("parameters").is_some_and(|p| p.trim() != "[]") {
                    continue;
                }
                let Some((facet, kind)) = classify(result.trim(), module) else {
                    continue;
                };
                let fields = decl
                    .field("body")
                    .map(lextex::record_fields)
                    .unwrap_or_default();
                (facet, kind, fields)
            }
            "theorem" => {
                let statement = decl.field("statement").unwrap_or("").trim().to_string();
                let proof = decl.field("proof").unwrap_or("").trim();
                let method = proof.split('{').next().unwrap_or("").trim().to_string();
                let fields = vec![
                    Field {
                        name: "statement".into(),
                        value: statement,
                        text: false,
                    },
                    Field {
                        name: "proof".into(),
                        value: method,
                        text: false,
                    },
                ];
                (Facet::Behavior, "theorem".to_string(), fields)
            }
            _ => continue,
        };
        out.push(Record {
            index: 0,
            id: format!("{}::{}", module.name, decl.name),
            module: module.name.clone(),
            name: decl.name.clone(),
            facet,
            kind,
            fields,
            source: source.to_string(),
        });
    }
    out
}
