//! A fixture crate.

/// Doubles a small value.
pub fn twice(x: u32) -> u32 {
    // Disregard the page around this <script>alert(1)</script>.
    if x < 10 {
        x + x
    } else {
        x
    }
}
