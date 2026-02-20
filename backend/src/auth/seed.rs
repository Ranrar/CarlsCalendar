use uuid::Uuid;

use crate::auth::hash_password;
use crate::config::Config;
use crate::db::Db;

/// Seeds the admin (username: "admin") and, in development, the dev account.
/// Safe to call on every startup — existence is checked before inserting.
pub async fn seed_accounts(pool: &Db, config: &Config) -> anyhow::Result<()> {
    seed_admin(pool).await?;

    if config.is_development() {
        seed_dev(pool, &config.dev_username, &config.dev_password).await?;
    }

    Ok(())
}

async fn seed_admin(pool: &Db) -> anyhow::Result<()> {
    #[derive(sqlx::FromRow)]
    struct AdminRow {
        password_hash: String,
    }

    let row: Option<AdminRow> = sqlx::query_as::<_, AdminRow>(
        "SELECT password_hash FROM users WHERE username = 'admin' AND role = 'admin' LIMIT 1"
    )
    .fetch_optional(pool)
    .await?;

    match row {
        // Admin exists with a real hash — nothing to do.
        Some(r) if !r.password_hash.contains("PLACEHOLDER") => return Ok(()),

        Some(_) => {
            // Admin row has the placeholder hash left from a bare-SQL bootstrap.
            // Overwrite it with a proper argon2id hash.
            let hash = hash_password("admin")?;
            sqlx::query(
                "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE username = 'admin' AND role = 'admin'"
            )
            .bind(hash)
            .execute(pool)
            .await?;
            tracing::info!("Replaced placeholder hash for admin — CHANGE PASSWORD ON FIRST LOGIN");
        }

        None => {
            let hash = hash_password("admin")?;
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO users (id, username, password_hash, role, language, is_verified, is_active, must_change_password)
                 VALUES (?, 'admin', ?, 'admin', 'en', 1, 1, 1)"
            )
            .bind(id)
            .bind(hash)
            .execute(pool)
            .await?;
            tracing::info!("Seeded admin account (username: admin) — CHANGE PASSWORD ON FIRST LOGIN");
        }
    }

    Ok(())
}

async fn seed_dev(pool: &Db, username: &str, password: &str) -> anyhow::Result<()> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE username = ? AND role = 'admin')"
    )
    .bind(username)
    .fetch_one(pool)
    .await?;

    if exists {
        return Ok(());
    }

    let hash = hash_password(password)?;
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, role, language, is_verified, is_active, must_change_password)
         VALUES (?, ?, ?, 'admin', 'en', 1, 1, 0)"
    )
    .bind(id)
    .bind(username)
    .bind(hash)
    .execute(pool)
    .await?;

    tracing::info!(username, "Seeded dev account");
    Ok(())
}
