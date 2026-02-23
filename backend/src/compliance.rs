use std::time::Duration;

use serde_json::json;
use uuid::Uuid;

use crate::{db::Db, state::AppState};

#[derive(sqlx::FromRow)]
struct RetentionRuleRow {
    id: String,
    name: String,
    table_name: String,
    timestamp_column: String,
    retention_days: i32,
    enabled: bool,
}

pub fn spawn_retention_cleanup(state: AppState) {
    if !state.config.retention_cleanup_enabled {
        tracing::info!("Retention cleanup job disabled");
        return;
    }

    let minutes = state.config.retention_cleanup_interval_minutes;
    tracing::info!(minutes, "Retention cleanup job started");

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(minutes.saturating_mul(60)));
        // First immediate tick consumed so subsequent ticks wait the configured interval.
        ticker.tick().await;

        loop {
            ticker.tick().await;
            if let Err(err) = run_retention_cleanup(&state.pool).await {
                tracing::error!(error = %err, "Retention cleanup failed");
            }
        }
    });
}

pub async fn run_retention_cleanup(pool: &Db) -> anyhow::Result<()> {
    let rules: Vec<RetentionRuleRow> = sqlx::query_as::<_, RetentionRuleRow>(
        "SELECT id, name, table_name, timestamp_column, retention_days, enabled
         FROM retention_rules
         WHERE enabled = 1
         ORDER BY table_name, timestamp_column",
    )
    .fetch_all(pool)
    .await?;

    for rule in rules {
        if !rule.enabled || rule.retention_days <= 0 {
            continue;
        }

        let affected = apply_rule(pool, &rule).await?;
        if affected > 0 {
            sqlx::query(
                "INSERT INTO deletion_logs (id, table_name, record_id, deleted_at, reason, details, actor_user_id)
                 VALUES (?, ?, NULL, NOW(), 'policy', ?, NULL)",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&rule.table_name)
            .bind(serde_json::to_string(&json!({
                "rule_id": rule.id,
                "rule_name": rule.name,
                "timestamp_column": rule.timestamp_column,
                "retention_days": rule.retention_days,
                "affected_rows": affected
            }))?)
            .execute(pool)
            .await?;

            tracing::info!(
                rule = %rule.name,
                table = %rule.table_name,
                affected,
                "Retention cleanup deleted rows"
            );
        }
    }

    Ok(())
}

async fn apply_rule(pool: &Db, rule: &RetentionRuleRow) -> anyhow::Result<u64> {
    let result = match (rule.table_name.as_str(), rule.timestamp_column.as_str()) {
        ("email_tokens", "expires_at") => {
            sqlx::query(
                "DELETE FROM email_tokens
                 WHERE expires_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
            )
            .bind(rule.retention_days)
            .execute(pool)
            .await?
        }
        ("user_sessions", "expires_at") => {
            sqlx::query(
                "DELETE FROM user_sessions
                 WHERE expires_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
            )
            .bind(rule.retention_days)
            .execute(pool)
            .await?
        }
        ("qr_tokens", "created_at") => {
            sqlx::query(
                "DELETE FROM qr_tokens
                 WHERE is_active = 0
                   AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
            )
            .bind(rule.retention_days)
            .execute(pool)
            .await?
        }
        ("child_device_tokens", "revoked_at") => {
            sqlx::query(
                "DELETE FROM child_device_tokens
                 WHERE revoked_at IS NOT NULL
                   AND revoked_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
            )
            .bind(rule.retention_days)
            .execute(pool)
            .await?
        }
        ("users", "deleted_at") => {
            sqlx::query(
                "DELETE FROM users
                 WHERE deleted_at IS NOT NULL
                   AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
            )
            .bind(rule.retention_days)
            .execute(pool)
            .await?
        }
        _ => {
            tracing::warn!(
                table = %rule.table_name,
                column = %rule.timestamp_column,
                rule = %rule.name,
                "Skipping unsupported retention rule target"
            );
            return Ok(0);
        }
    };

    Ok(result.rows_affected())
}
