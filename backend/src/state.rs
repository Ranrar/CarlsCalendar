//! Shared application state — injected into every handler via `axum::extract::State`.

use crate::{config::Config, db::Db};

/// Application-wide state passed via axum `State<AppState>`.
///
/// Both the DB pool and the config are cheaply cloned because `MySqlPool` is
/// already an `Arc`-backed pool, and `Config` contains only `String`/primitive
/// fields (no large allocations).
#[derive(Clone)]
pub struct AppState {
    pub pool:   Db,
    pub config: Config,
}
