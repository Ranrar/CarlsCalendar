#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/build-prebuilt.sh"

cd "$ROOT_DIR"
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml up --build "$@"
