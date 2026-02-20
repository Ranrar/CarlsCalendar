FROM rust:1.93.1-slim AS builder

# Layout mirrors the repo: /app/backend (crate root) + /app/database/migrations
# so sqlx::migrate!("../database/migrations") resolves correctly at compile time.
WORKDIR /app/backend

# Install build deps
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy migrations first (needed at compile time by sqlx::migrate!)
COPY database/migrations ../database/migrations

# Cache dependency compilation
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm src/main.rs

# Build actual app
COPY backend/src ./src
RUN touch src/main.rs && cargo build --release

# ── Runtime image ─────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/backend/target/release/carlscalendar-backend .

EXPOSE 8080
CMD ["./carlscalendar-backend"]
