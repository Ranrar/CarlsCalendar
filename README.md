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
- **QR code login** — children log in by scanning a QR code, no password needed
- **Image library** — upload and attach images to schedule items
- **Admin dashboard** — manage users and global schedule templates
- **Multilingual** — English and Danish (DA) built in
- **Email verification & password reset** — SMTP-based, degrades gracefully when unconfigured

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

### 3. Default admin account

| Username | Password |
|----------|----------|
| `admin`  | `admin`  |

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
| `SESSION_SECRET`  | Cookie signing secret (min 32 chars)     |
| `APP_ENV`         | `development` or `production`            |
| `APP_BASE_URL`    | Public URL (used in verification emails) |
| `SMTP_HOST`       | SMTP server (email features optional)    |

> **Note:** In `development` mode, password strength requirements are disabled and verification email links are printed to the backend log instead of sent.

---

## API

All endpoints are prefixed with `/api/v1/`.

| Method | Path                        | Description                  |
|--------|-----------------------------|------------------------------|
| POST   | `/auth/register`            | Create parent account        |
| POST   | `/auth/login`               | Log in (username or email)   |
| POST   | `/auth/logout`              | Log out                      |
| GET    | `/auth/me`                  | Current session              |
| GET    | `/children`                 | List children                |
| POST   | `/children`                 | Create child profile         |
| GET    | `/schedules`                | List schedules               |
| GET    | `/calendar/:id/week/:week`  | Week view for a child        |
| POST   | `/images/upload`            | Upload image                 |
| GET    | `/admin/users`              | List all users (admin only)  |

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

---

## License

Private — all rights reserved.
