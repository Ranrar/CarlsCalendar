#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/frontend"
echo "Building frontend locally (dist)..."
npm ci
npm run build

cd "$ROOT_DIR"
echo "Rebuilding frontend prebuilt image and restarting frontend service..."
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml build frontend
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml up -d frontend
