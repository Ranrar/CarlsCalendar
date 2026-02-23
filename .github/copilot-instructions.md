# Copilot instructions for Carls Calendar

## Big picture architecture
- Monorepo with a Docker-first stack: `backend/` (Rust + Axum + sqlx), `frontend/` (TypeScript + Vite SPA), `database/migrations/` (MariaDB schema), and `nginx/` as reverse proxy.
- Runtime request path is `browser -> nginx -> frontend/backend`; API calls are proxied from `/api/*` to backend (`nginx/nginx.conf`).
- Backend mounts all API under `/api/v1` in `backend/src/main.rs` and `backend/src/routes/mod.rs`.
- Auth model is cookie-based (not bearer token): parent/admin uses `session`; child device uses `child_session` (`backend/src/routes/auth.rs`).
- Frontend must send cookies via `credentials: 'include'` (`frontend/src/api/client.ts`); keep this behavior for all authenticated endpoints.

## Backend patterns to follow
- New backend features usually touch: `backend/src/routes/*.rs` (handler/router), optional `services/*.rs`, and SQL migration files in `database/migrations/`.
- Keep public routes separate from protected routes; protected routes are grouped then wrapped with `require_auth` route layer (`backend/src/routes/mod.rs`).
- Use `AppError`/`AppResult` for handlers and return JSON `{ "error": ... }` on failure (`backend/src/errors.rs`).
- Prefer current sqlx runtime-query style (`sqlx::query`, `query_as::<_, RowType>`) with explicit `FromRow` structs, as in `backend/src/routes/auth.rs`.
- Preserve startup sequence in `backend/src/main.rs`: config -> db connect -> migrations -> seed -> background jobs.
- Migrations are embedded via `sqlx::migrate!("../database/migrations")` (`backend/src/db.rs`); schema changes must be migration-first.

## Frontend patterns to follow
- SPA is framework-light TypeScript modules with lazy route loading (`frontend/src/router.ts`); each page module exports `render(container)`.
- Session state is centralized in `frontend/src/auth/session.ts`; fetch auth state from `/auth/me` rather than duplicating user-fetch logic in pages.
- Use API wrapper in `frontend/src/api/client.ts` and throw `ApiError`; do not bypass with ad-hoc `fetch` unless necessary.
- Keep route guard semantics consistent (`requiresAuth`, `requiresRole`) and follow existing parent/admin/child route split in `frontend/src/router.ts`.

## Dev and debugging workflows (project-specific)
- Full stack (default): `docker compose up --build` from repo root.
- Fast prebuilt flow: `scripts/up-prebuilt.sh` (builds frontend `dist` + backend release binary locally, then uses `docker-compose.prebuilt.yml`).
- Backend-only local run against container DB: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db` then `cd backend && cargo run` (DB exposed on `localhost:3307`).
- Rebuild one service in prebuilt mode: `scripts/rebuild-backend.sh` or `scripts/rebuild-frontend.sh`.
- Reset local DB volume safely with `scripts/reset-dev-db.sh`.

## Integration points and constraints
- Keep API compatibility with frontend route usage and `api` client paths (all expect `/api/v1/*`).
- Nginx proxies backend assets for `/uploads/` and `/assets/pictograms/`; frontend static build assets are also under `/assets/` via frontend service (`nginx/nginx.conf`).
- Pictogram cache persistence depends on host bind mount `backend/assets_seed/pictograms` in compose; avoid changes that break that path.
- Configuration is env-driven (`backend/src/config.rs`, `.env.example`); preserve existing variable names and defaults.

## Quality gates visible in repo
- CI currently audits dependencies (not full test matrix): `cargo audit` in `backend/`, and `npm audit --audit-level=high` in root + `frontend/` (`.github/workflows/dependency-audit.yml`).
- Before proposing security/dependency changes, verify they remain compatible with these audit checks.
