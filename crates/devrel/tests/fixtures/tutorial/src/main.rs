//! A fixture CLI.

use clap::{Parser, Subcommand};

/// What to do.
#[derive(Subcommand)]
enum Command {
    /// Write the projection.
    Project(Args),
    /// Check the projection.
    Check(Args),
    /// Print the table.
    PrintRoutes,
}

#[derive(clap::Args)]
struct Args {
    /// The workspace root.
    workspace: PathBuf,
    /// Where it goes.
    #[arg(long)]
    out: PathBuf,
    /// A lift register,
    /// over two lines.
    #[arg(long)]
    register_file: Option<PathBuf>,
}
