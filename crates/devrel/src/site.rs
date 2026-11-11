//! The catalog pages.

use std::path::Path;

use crate::{Catalog, CatalogError};

/// Write every page under `dir`; returns the number of pages.
pub fn write(_c: &Catalog, _dir: &Path) -> Result<usize, CatalogError> {
    Ok(0)
}
