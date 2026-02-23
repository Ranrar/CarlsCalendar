#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FORCE="false"
if [[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]]; then
  FORCE="true"
fi

if [[ "$FORCE" != "true" ]]; then
  echo "⚠️  This will DELETE the dev MariaDB data volume and stop the compose stack."
  echo "    Pictogram assets in backend/assets_seed/pictograms are preserved."
  echo "    All local database data will be lost."
  read -r -p "Continue? [y/N]: " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

cd "$ROOT_DIR"
echo "Stopping compose stack (preserving non-DB volumes)..."
docker compose down --remove-orphans

db_volume="$(docker compose config | awk '
  $0 ~ /^volumes:/ {in_volumes=1; next}
  in_volumes && $1 == "db_data:" {in_db=1; next}
  in_db && $1 == "name:" {print $2; exit}
')"

if [[ -z "$db_volume" ]]; then
  project_name="${COMPOSE_PROJECT_NAME:-$(basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]')}"
  project_name="$(printf '%s' "$project_name" | tr -c 'a-z0-9' '_')"
  db_volume="${project_name}_db_data"
fi

echo "Removing DB volume: $db_volume"
docker volume rm "$db_volume" >/dev/null 2>&1 || true

echo "✅ Dev database reset complete."
echo "Start fresh with: docker compose up --build"
