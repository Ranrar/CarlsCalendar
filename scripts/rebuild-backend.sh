#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/backend"
echo "Building Rust backend locally (release)..."
cargo build --release

cd "$ROOT_DIR"
echo "Rebuilding backend prebuilt image and restarting backend service..."
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml build backend
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml up -d backend
