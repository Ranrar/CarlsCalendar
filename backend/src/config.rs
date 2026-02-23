use dotenvy::dotenv;
use std::env;
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct Config {
    // Database
    pub db_host:          String,
    pub db_port:          u16,
    pub db_name:          String,
    pub db_user:          String,
    pub db_password:      String,

    // Backend
    pub backend_host:     String,
    pub backend_port:     u16,

    // Session
    #[allow(dead_code)]
    pub session_secret:   String,

    // Email
    pub smtp_host:        String,
    pub smtp_port:        u16,
    pub smtp_user:        String,
    pub smtp_password:    String,
    pub smtp_from:        String,

    // App
    pub app_env:          String,
    pub app_base_url:     String,

    // Compliance / retention
    pub retention_cleanup_enabled: bool,
    pub retention_cleanup_interval_minutes: u64,

    // Pictogram prefetch
    pub pictogram_prefetch_default_enabled: bool,
    pub pictogram_prefetch_idle_minutes: u64,
    pub pictogram_prefetch_batch_size: u64,
    pub pictogram_prefetch_interval_seconds: u64,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Missing environment variable: {0}")]
    MissingVar(String),
    #[error("Invalid value for {0}: {1}")]
    InvalidValue(String, String),
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        dotenv().ok();

        fn require(key: &str) -> Result<String, ConfigError> {
            env::var(key).map_err(|_| ConfigError::MissingVar(key.to_string()))
        }

        fn parse_port(key: &str) -> Result<u16, ConfigError> {
            let raw = require(key)?;
            raw.parse::<u16>()
                .map_err(|_| ConfigError::InvalidValue(key.to_string(), raw))
        }

        fn parse_bool_env(key: &str, default: bool) -> bool {
            match env::var(key) {
                Ok(v) => matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"),
                Err(_) => default,
            }
        }

        Ok(Self {
            db_host:      require("DB_HOST").unwrap_or_else(|_| "db".into()),
            db_port:      parse_port("DB_PORT").unwrap_or(3306),
            db_name:      require("DB_NAME")?,
            db_user:      require("DB_USER")?,
            db_password:  require("DB_PASSWORD")?,

            backend_host: env::var("BACKEND_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            backend_port: parse_port("BACKEND_PORT").unwrap_or(8080),

            session_secret: require("SESSION_SECRET")?,

            smtp_host:     env::var("SMTP_HOST").unwrap_or_default(),
            smtp_port:     env::var("SMTP_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(587),
            smtp_user:     env::var("SMTP_USER").unwrap_or_default(),
            smtp_password: env::var("SMTP_PASSWORD").unwrap_or_default(),
            smtp_from:     env::var("SMTP_FROM").unwrap_or_default(),

            app_env:      env::var("APP_ENV").unwrap_or_else(|_| "development".into()),
            app_base_url: env::var("APP_BASE_URL").unwrap_or_else(|_| "http://localhost".into()),

            retention_cleanup_enabled: parse_bool_env("RETENTION_CLEANUP_ENABLED", true),
            retention_cleanup_interval_minutes: env::var("RETENTION_CLEANUP_INTERVAL_MINUTES")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .filter(|v| *v > 0)
                .unwrap_or(60),

            pictogram_prefetch_default_enabled: parse_bool_env("PICTOGRAM_PREFETCH_DEFAULT_ENABLED", false),
            pictogram_prefetch_idle_minutes: env::var("PICTOGRAM_PREFETCH_IDLE_MINUTES")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .filter(|v| *v > 0)
                .unwrap_or(20),
            pictogram_prefetch_batch_size: env::var("PICTOGRAM_PREFETCH_BATCH_SIZE")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .filter(|v| *v > 0)
                .unwrap_or(50),
            pictogram_prefetch_interval_seconds: env::var("PICTOGRAM_PREFETCH_INTERVAL_SECONDS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .filter(|v| *v > 0)
                .unwrap_or(60),
        })
    }
}
