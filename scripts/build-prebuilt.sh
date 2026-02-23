#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/frontend"
echo "[1/2] Building frontend locally (dist)..."
npm ci
npm run build

cd "$ROOT_DIR/backend"
echo "[2/2] Building Rust backend locally (release)..."
cargo build --release
