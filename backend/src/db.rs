use sqlx::{mysql::MySqlPoolOptions, MySqlPool};
use crate::config::Config;

pub type Db = MySqlPool;

pub async fn connect(config: &Config) -> anyhow::Result<Db> {
    let url = format!(
        "mysql://{}:{}@{}:{}/{}",
        config.db_user,
        config.db_password,
        config.db_host,
        config.db_port,
        config.db_name,
    );

    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .connect(&url)
        .await?;

    tracing::info!("Database connection pool established");
    Ok(pool)
}

/// Run all SQLx migrations from the `migrations/` directory embedded at compile time.
pub async fn run_migrations(pool: &Db) -> anyhow::Result<()> {
    sqlx::migrate!("../database/migrations").run(pool).await?;
    tracing::info!("Database migrations applied");
    Ok(())
}
