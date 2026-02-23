# Carls Calendar

> *Calm. Aware. Routine. Learning.*

A visual calendar and routine app designed to help children with structured daily schedules. Parents manage children's profiles and schedules; children view their own calendar through a simple interface or by scanning a QR code.

---

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Rust · Axum 0.8 · sqlx 0.8          |
| Database | MariaDB 11                          |
| Frontend | TypeScript · CSS |
| Proxy    | nginx 1.27                          |
| Runtime  | Docker · Docker Compose             |

---

## Features

- **Parent accounts** — register, log in, manage children and schedules
- **Child profiles** — each child has a calendar with assigned schedules
- **Schedules & items** — create reusable weekly schedules with time-slotted items
- **QR pairing + child device session** — child access is paired from QR and stored in a secure HttpOnly cookie
- **Device management** — parents can list/revoke child devices and revoke all sessions per child
- **Image library** — upload and attach images to schedule items
- **Pictogram library** — local-first ARASAAC search, saved stars, latest feed, and idle prefetch
- **Visual supports (Phase A)** — daily schedule, first/then, choice board, and routine steps with template/document persistence
- **Admin dashboard** — manage users and global schedule templates
- **Multilingual** — English and Danish (DA) built in
- **Email verification & password reset** — SMTP-based, degrades gracefully when unconfigured
- **GDPR support** — parent data export endpoint and account deletion endpoint
- **Cookie consent + policy versions** — consent choices with auditable policy versioning
- **Compliance ops** — retention rules/cleanup, DSR audit logs, breach logs, and subprocessor register (admin)

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2

### 1. Clone & configure

```bash
git clone <repo-url> CarlsCalendar
cd CarlsCalendar
cp .env.example .env
# Edit .env — at minimum change DB_ROOT_PASSWORD, DB_PASSWORD, and SESSION_SECRET
```

### 2. Start

```bash
docker compose up --build
```

The stack starts in order: database → backend → frontend → nginx.

Open **http://localhost** in your browser.

### Pictogram cache persistence (dev + production-style host deploy)

Downloaded pictograms are stored on the host in:

- `backend/assets_seed/pictograms`

This folder is bind-mounted into the backend container, so:

- container rebuilds/restarts keep the downloaded files,
- deleting Docker volumes only removes MariaDB data (if you remove `db_data`),
- cached pictograms remain available for faster startup and offline reuse.

For server deployments, keep this path on persistent host storage (or equivalent shared storage) to retain cache across container lifecycle operations.

### Optional: prebuild frontend + backend locally (faster image packaging)

If you prefer compiling app artifacts on your host machine (instead of inside service Dockerfiles), use:

```bash
./scripts/up-prebuilt.sh
```

This command:

1. runs `frontend/npm ci` and `frontend/npm run build` locally,
2. builds `backend/target/release/carlscalendar-backend` locally,
3. starts compose using `docker-compose.prebuilt.yml`, where frontend/backend images only copy prebuilt artifacts.

You can pass normal `docker compose up` flags as well, e.g. `-d`.

### 3. Default admin account

| Username | Password |
|----------|----------|
| `admin@admin.dk`  | `admin`  |

Change the admin password after first login.

---

## Project Structure

```
CarlsCalendar/
├── backend/          # Rust/Axum API server
│   └── src/
│       ├── auth/     # Auth helpers, password hashing, seeding
│       ├── middleware/  # Auth & role guards
│       ├── models/   # Shared DB types
│       └── routes/   # API route handlers
├── database/
│   └── migrations/   # SQL migrations (run automatically on startup)
├── frontend/         # TypeScript SPA
│   └── src/
│       ├── api/      # API client
│       ├── auth/     # Session store
│       ├── components/  # Reusable UI components
│       ├── i18n/     # EN / DA translations
│       └── pages/    # Page modules (Parent, Child, Admin)
├── nginx/            # Reverse proxy config
├── .env.example      # Environment variable template
└── docker-compose.yml
```

---

## Environment Variables

See [.env.example](.env.example) for all variables. Key ones:

| Variable          | Description                              |
|-------------------|------------------------------------------|
| `DB_PASSWORD`     | MariaDB user password                    |
| `SESSION_SECRET`  | Backend auth secret (required)           |
| `APP_ENV`         | `development` or `production`            |
| `APP_BASE_URL`    | Public URL (used in verification emails) |
| `SMTP_HOST`       | SMTP server (email features optional)    |
| `RETENTION_CLEANUP_ENABLED` | Enable periodic retention cleanup job |
| `RETENTION_CLEANUP_INTERVAL_MINUTES` | Cleanup interval in minutes |
| `PICTOGRAM_PREFETCH_DEFAULT_ENABLED` | Default startup state for idle pictogram prefetch worker |
| `PICTOGRAM_PREFETCH_IDLE_MINUTES` | Required idle time before prefetch runs |
| `PICTOGRAM_PREFETCH_BATCH_SIZE` | Number of IDs processed per prefetch run |
| `PICTOGRAM_PREFETCH_INTERVAL_SECONDS` | Worker tick interval for checking idle/prefetch |

> **Note:** In `development` mode, password strength requirements are disabled and verification email links are printed to the backend log instead of sent.

---

## API

All endpoints are prefixed with `/api/v1/`.

### Auth (parent)

| Method | Path                    | Description |
|--------|-------------------------|-------------|
| POST   | `/auth/register`        | Create parent account |
| POST   | `/auth/login`           | Parent/admin login by email + password |
| POST   | `/auth/logout`          | End parent session |
| GET    | `/auth/me`              | Current parent/admin session |
| POST   | `/auth/change-password` | Change password |
| POST   | `/auth/forgot-password` | Request password reset |
| POST   | `/auth/reset-password`  | Apply password reset |
| POST   | `/auth/verify-email`    | Verify email token |

> Child username/password login is disabled.

### Child pairing + session

| Method | Path                           | Description |
|--------|--------------------------------|-------------|
| POST   | `/auth/child/pair`             | Exchange active QR token for child device session cookie |
| GET    | `/auth/child/me`               | Validate/read current child device session |
| POST   | `/auth/child/logout`           | Revoke current child device session |
| GET    | `/child/{child_id}/week/{iso_week}` | Read-only child week view (cookie-authenticated child session) |

### Children + device management (parent/admin)

| Method | Path                                    | Description |
|--------|-----------------------------------------|-------------|
| GET    | `/children`                             | List children |
| POST   | `/children`                             | Create child profile |
| GET    | `/children/{id}`                        | Get child profile |
| PUT    | `/children/{id}`                        | Update child profile |
| DELETE | `/children/{id}`                        | Delete child profile |
| GET    | `/children/{id}/qr`                     | Get/generate active QR token |
| POST   | `/children/{id}/qr`                     | Regenerate QR token |
| GET    | `/children/{id}/devices`                | List active child devices |
| DELETE | `/children/{id}/devices/{device_id}`    | Revoke a specific child device |
| DELETE | `/children/{id}/devices`                | Revoke all child devices |

### Schedules + calendar assignment

| Method | Path                                      | Description |
|--------|-------------------------------------------|-------------|
| GET    | `/schedules`                              | List schedules |
| POST   | `/schedules`                              | Create schedule |
| GET    | `/schedules/{id}`                         | Get schedule + items |
| PUT    | `/schedules/{id}`                         | Update schedule |
| DELETE | `/schedules/{id}`                         | Archive schedule |
| PATCH  | `/schedules/{id}/status`                  | Set active/inactive/archived |
| GET    | `/schedules/{id}/items`                   | List schedule items |
| POST   | `/schedules/{id}/items`                   | Add schedule item |
| PATCH  | `/schedules/{id}/items/reorder`           | Reorder items |
| PUT    | `/schedules/{id}/items/{item_id}`         | Update item |
| DELETE | `/schedules/{id}/items/{item_id}`         | Delete item |
| GET    | `/calendar/{child_id}/week/{iso_week}`    | Parent/admin week view for a child |
| POST   | `/calendar/{child_id}/assign`             | Assign schedule to weekday |
| DELETE | `/calendar/{child_id}/assign/{assignment_id}` | Remove weekday assignment |

### User profile + GDPR

| Method | Path                | Description |
|--------|---------------------|-------------|
| GET    | `/users/me`         | Current profile |
| PATCH  | `/users/me`         | Update profile (language) |
| GET    | `/users/me/export`  | Export parent-owned data (GDPR portability) |
| DELETE | `/users/me`         | Delete own parent account and cascade owned data |

### Compliance (admin)

| Method | Path                                       | Description |
|--------|--------------------------------------------|-------------|
| GET    | `/admin/compliance/dsr`                    | List DSR audit events |
| GET    | `/admin/compliance/deletions`              | List deletion logs |
| GET    | `/admin/compliance/retention-rules`        | List retention rules |
| POST   | `/admin/compliance/retention-rules`        | Create retention rule |
| PUT    | `/admin/compliance/retention-rules/{id}`   | Update retention rule |
| POST   | `/admin/compliance/retention/cleanup`      | Trigger cleanup run now |
| GET    | `/admin/compliance/pictogram-prefetch`     | Get pictogram prefetch settings + last run summary |
| PUT    | `/admin/compliance/pictogram-prefetch`     | Update pictogram prefetch enabled/idle/batch settings |
| POST   | `/admin/compliance/pictogram-prefetch/run` | Trigger pictogram prefetch immediately |
| GET    | `/admin/compliance/breach-logs`            | List breach logs |
| POST   | `/admin/compliance/breach-logs`            | Create breach incident entry |
| PUT    | `/admin/compliance/breach-logs/{id}`       | Update breach status/details |
| GET    | `/admin/compliance/subprocessors`          | List subprocessor register |
| POST   | `/admin/compliance/subprocessors`          | Add subprocessor entry |
| PUT    | `/admin/compliance/subprocessors/{id}`     | Update subprocessor entry |
| DELETE | `/admin/compliance/subprocessors/{id}`     | Remove subprocessor entry |

### Images + admin

| Method | Path           | Description |
|--------|----------------|-------------|
| GET    | `/images`      | List image library |
| POST   | `/images`      | Upload image |
| DELETE | `/images/{id}` | Delete image |
| GET    | `/admin/users` | List all users (admin only) |

### Pictograms

| Method | Path                                  | Description |
|--------|---------------------------------------|-------------|
| GET    | `/pictograms/search/{language}/{query}` | Search ARASAAC (cached locally first) |
| GET    | `/pictograms/{language}/id/{arasaac_id}` | Get one pictogram by ARASAAC id |
| GET    | `/pictograms/new?lang=&n=`            | Browse latest pictograms |
| GET    | `/pictograms/keywords?lang=`          | Keyword autocomplete list |
| GET    | `/pictograms/saved?lang=`             | List saved pictograms for current user |
| POST   | `/pictograms/saved`                   | Save/star a pictogram |
| GET    | `/pictograms/saved/ids`               | List saved pictogram IDs |
| DELETE | `/pictograms/saved/{id}`              | Unsave/unstar pictogram |
| POST   | `/pictograms/saved/{id}/use`          | Increment usage count |

### Visual supports

| Method | Path                                            | Description |
|--------|-------------------------------------------------|-------------|
| GET    | `/visual-documents/templates`                   | List visual support templates |
| POST   | `/visual-documents/templates`                   | Create template |
| PUT    | `/visual-documents/templates/{id}`              | Update template |
| DELETE | `/visual-documents/templates/{id}`              | Delete template |
| POST   | `/visual-documents/templates/{id}/copy`         | Create a document from template |
| GET    | `/visual-documents/activity-cards`              | List activity cards (system + user) |
| POST   | `/visual-documents/activity-cards`              | Create custom activity card |
| DELETE | `/visual-documents/activity-cards/{id}`         | Delete custom activity card |
| GET    | `/visual-documents`                             | List user visual documents |
| POST   | `/visual-documents`                             | Create visual document |
| GET    | `/visual-documents/{id}`                        | Get visual document |
| PUT    | `/visual-documents/{id}`                        | Update visual document |
| DELETE | `/visual-documents/{id}`                        | Delete visual document |

### Cookie consent (public)

| Method | Path                 | Description |
|--------|----------------------|-------------|
| GET    | `/consent`           | Read current cookie consent choice |
| POST   | `/consent`           | Set consent (`accepted` / `declined`) |
| DELETE | `/consent`           | Withdraw consent choice |
| GET    | `/consent/policies`  | List active policy versions |

---

## Development

To run the backend locally against a local MariaDB:

```bash
# Start DB only
docker compose -f docker-compose.dev.yml up -d db

# Run backend locally
cd backend
cargo run
```

The dev compose override maps the DB to `localhost:3307` to avoid conflicting with any existing MariaDB on port 3306.

### Prebuilt image files

- `backend/Dockerfile.prebuilt` — runtime-only backend image that copies local release binary.
- `frontend/Dockerfile.prebuilt` — runtime-only frontend image that copies local `dist/` output.
- `docker-compose.prebuilt.yml` — compose override that switches backend/frontend to prebuilt Dockerfiles.

### Helper scripts

- `scripts/logs.sh [service]` — follow compose logs (all services or one service).
- `scripts/build-prebuilt.sh` — build frontend `dist/` + backend release binary locally.
- `scripts/up-prebuilt.sh` — run local prebuild, then start compose with prebuilt frontend/backend images.
- `scripts/rebuild-frontend.sh` — rebuild only frontend prebuilt image and restart frontend service.
- `scripts/rebuild-backend.sh` — rebuild only backend prebuilt image and restart backend service.
- `scripts/reset-dev-db.sh` — remove DB volume and reset local development database.

### Reset dev database (fresh start)

To remove the local MariaDB data volume and start over with a clean database:

```bash
./scripts/reset-dev-db.sh
```

Non-interactive mode:

```bash
./scripts/reset-dev-db.sh --yes
```

For production TLS/HSTS hardening, use `nginx/nginx.prod.conf` with valid certs mounted at `nginx/certs/`.

### Additional documentation

- `documents/UI_MANUAL.md` — frontend UI conventions and QA checklist.
- `documents/SECURITY_INCIDENT_RUNBOOK.md` — incident response workflow and breach handling.
- `documents/VISUAL_SUPPORT_TECH_SPEC.md` — visual support technical specification and rollout notes.

---

## License

Private — all rights reserved.
