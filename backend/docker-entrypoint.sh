#!/bin/sh
set -eu

ASSETS_DIR="/app/assets"
STORE_DIR="/app/backend/assets_seed/pictograms"
SEED_DIR="/opt/pictogram-seed/pictograms"

mkdir -p "$STORE_DIR" "$ASSETS_DIR"

# Bootstrap assets into the persistent volume only when missing.
if [ -d "$SEED_DIR" ]; then
  cp -an "$SEED_DIR"/. "$STORE_DIR"/ 2>/dev/null || true
fi

# Keep backend static serving path stable: /assets/pictograms -> STORE_DIR
rm -rf "$ASSETS_DIR/pictograms"
ln -s "$STORE_DIR" "$ASSETS_DIR/pictograms"

exec /app/carlscalendar-backend
