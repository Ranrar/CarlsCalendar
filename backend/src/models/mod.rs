#![allow(dead_code)]

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ── Users ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id:                   Uuid,
    pub email:                Option<String>,
    pub username:             Option<String>,
    pub password_hash:        String,
    pub role:                 UserRole,
    pub language:             String,
    pub parent_id:            Option<Uuid>,
    pub is_verified:          bool,
    pub is_active:            bool,
    pub created_at:           NaiveDateTime,
    pub updated_at:           NaiveDateTime,
    pub deleted_at:           Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "VARCHAR", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Admin,
    Parent,
    Child,
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self { UserRole::Admin => "admin", UserRole::Parent => "parent", UserRole::Child => "child" };
        write!(f, "{s}")
    }
}

// ── Sessions ─────────────────────────────────────────────────

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserSession {
    pub id:         Uuid,
    pub user_id:    Uuid,
    pub token:      String,
    pub expires_at: NaiveDateTime,
    pub created_at: NaiveDateTime,
}

// ── Email tokens ─────────────────────────────────────────────

#[derive(Debug, Clone, sqlx::Type, PartialEq)]
#[sqlx(type_name = "VARCHAR", rename_all = "snake_case")]
pub enum EmailTokenKind {
    VerifyEmail,
    ResetPassword,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EmailToken {
    pub id:         Uuid,
    pub user_id:    Uuid,
    pub token:      String,
    pub kind:       EmailTokenKind,
    pub expires_at: NaiveDateTime,
    pub created_at: NaiveDateTime,
}

// ── Child profiles ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChildProfile {
    pub id:           Uuid,
    pub user_id:      Uuid,
    pub display_name: String,
    pub avatar_path:  Option<String>,
    pub created_at:   NaiveDateTime,
}

// ── Schedules ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Schedule {
    pub id:                 Uuid,
    pub owner_id:           Uuid,
    pub child_id:           Option<Uuid>,
    pub name:               String,
    pub status:             ScheduleStatus,
    pub is_template:        bool,
    pub source_template_id: Option<Uuid>,
    pub created_at:         NaiveDateTime,
    pub updated_at:         NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "VARCHAR", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ScheduleStatus {
    Active,
    Inactive,
    Archived,
}

// ── Schedule items ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ScheduleItem {
    pub id:           Uuid,
    pub schedule_id:  Uuid,
    pub title:        String,
    pub description:  Option<String>,
    pub picture_path: Option<String>,
    pub start_time:   String, // "HH:MM"
    pub end_time:     Option<String>,
    pub sort_order:   i32,
    pub created_at:   NaiveDateTime,
}

// ── Schedule day assignments ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ScheduleDayAssignment {
    pub id:          Uuid,
    pub schedule_id: Uuid,
    pub child_id:    Uuid,
    pub day_of_week: u8, // 1=Mon … 7=Sun
    pub created_at:  NaiveDateTime,
}

// ── QR tokens ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct QrToken {
    pub id:            Uuid,
    pub child_user_id: Uuid,
    pub token:         String,
    pub created_at:    NaiveDateTime,
    pub is_active:     bool,
}
