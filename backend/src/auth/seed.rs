use uuid::Uuid;

use crate::auth::hash_password;
use crate::db::Db;

/// Seeds the admin account (username: "admin").
/// Safe to call on every startup — existence is checked before inserting.
pub async fn seed_accounts(pool: &Db) -> anyhow::Result<()> {
    seed_admin(pool).await?;

    Ok(())
}

async fn seed_admin(pool: &Db) -> anyhow::Result<()> {
    const ADMIN_USERNAME: &str = "admin";
    const ADMIN_EMAIL: &str = "admin@admin.dk";
    const ADMIN_PASSWORD: &str = "admin";

    #[derive(sqlx::FromRow)]
    struct AdminRow {
        id: String,
        email: Option<String>,
        password_hash: String,
    }

    let row: Option<AdminRow> = sqlx::query_as::<_, AdminRow>(
        "SELECT id, email, password_hash FROM users WHERE username = ? AND role = 'admin' LIMIT 1"
    )
    .bind(ADMIN_USERNAME)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(r) => {
            // Ensure seeded credentials are consistent for local/dev access.
            let hash = hash_password(ADMIN_PASSWORD)?;
            sqlx::query("UPDATE users SET email = ?, password_hash = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?")
                .bind(ADMIN_EMAIL)
                .bind(hash)
                .bind(&r.id)
                .execute(pool)
                .await?;

            if r.email.as_deref() != Some(ADMIN_EMAIL) || r.password_hash.contains("PLACEHOLDER") {
                tracing::info!("Updated admin credentials (email + password hash)");
            }
        }

        None => {
            let hash = hash_password(ADMIN_PASSWORD)?;
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                 "INSERT INTO users (id, username, email, password_hash, role, language, is_verified, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'admin', 'en', 1, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())"
            )
            .bind(id)
            .bind(ADMIN_USERNAME)
            .bind(ADMIN_EMAIL)
            .bind(hash)
            .execute(pool)
            .await?;
            tracing::info!("Seeded admin account (email: admin@admin.dk)");
        }
    }

    Ok(())
}
