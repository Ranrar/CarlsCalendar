use std::net::SocketAddr;

use axum::Router;
use tokio::net::TcpListener;
use tower_cookies::CookieManagerLayer;
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod auth;
mod compliance;
mod config;
mod db;
mod errors;
mod middleware;
mod models;
mod routes;
mod services;
mod state;

use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ── Logging ───────────────────────────────────────────────
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // ── Config ────────────────────────────────────────────────
    let config = config::Config::from_env()?;
    tracing::info!(env = %config.app_env, "Starting CarlsCalendar backend");

    // ── Database ──────────────────────────────────────────────
    let pool = db::connect(&config).await?;
    db::run_migrations(&pool).await?;

    // ── Seed admin account ────────────────────────────────────
    auth::seed::seed_accounts(&pool).await?;

    // Ensure seeded/system pictogram files exist on disk (backed by a persistent volume).
    match services::pictograms::ensure_seeded_activity_assets(&pool).await {
        Ok(count) => {
            if count > 0 {
                tracing::info!(hydrated_assets = count, "Hydrated seeded pictogram assets");
            }
        }
        Err(err) => {
            tracing::warn!(error = ?err, "Failed to hydrate seeded pictogram assets");
        }
    }

    let app_state = AppState { pool, config };

    // ── Background jobs ───────────────────────────────────────
    compliance::spawn_retention_cleanup(app_state.clone());
    services::pictograms::spawn_idle_prefetch_worker(app_state.clone());

    // Read address before moving config into state
    let addr: SocketAddr = format!(
        "{}:{}",
        app_state.config.backend_host,
        app_state.config.backend_port
    )
    .parse()?;

    // ── Router ────────────────────────────────────────────────
    let app = Router::new()
        .nest("/api/v1", routes::all_routes(app_state.clone()))
        .nest_service("/uploads", ServeDir::new("uploads"))
        .nest_service("/assets", ServeDir::new("assets"))
        .layer(CookieManagerLayer::new())   // must come before state
        .layer(CorsLayer::permissive())     // tighten in production
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);
    tracing::info!(%addr, "Listening");

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
