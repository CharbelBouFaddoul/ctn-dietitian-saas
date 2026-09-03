#!/bin/sh
# Snapshot the local Docker database + uploaded files into deploy/bootstrap/
# so Coolify can restore an exact copy of this machine.
#
#   ./scripts/export-coolify-clone.sh
#
# Then commit/push deploy/bootstrap and on Coolify API execute:
#   CONFIRM_REPLACE=1 pnpm bootstrap:prod -- --replace --skip-admin
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
OUT_DIR="$ROOT_DIR/deploy/bootstrap"
USER_NAME="${POSTGRES_USER:-nutrition}"
DB_NAME="${POSTGRES_DB:-nutrition}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
API_SERVICE="${API_SERVICE:-api}"

cd "$ROOT_DIR"
mkdir -p "$OUT_DIR"

if ! docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" pg_isready -U "$USER_NAME" -d "$DB_NAME" >/dev/null 2>&1; then
  echo "Local Postgres is not running. Start it with: pnpm dev:docker" >&2
  exit 1
fi

echo "Dumping database $DB_NAME (custom format, all tables, all rows)..."
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump -U "$USER_NAME" -d "$DB_NAME" --format=custom --no-owner --no-acl -f /tmp/nutrition.dump
docker compose -f "$COMPOSE_FILE" cp "$POSTGRES_SERVICE":/tmp/nutrition.dump "$OUT_DIR/database.dump"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" rm -f /tmp/nutrition.dump

echo "Archiving uploaded files from /data/storage..."
if docker compose -f "$COMPOSE_FILE" exec -T "$API_SERVICE" sh -c 'test -d /data/storage' >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" exec -T "$API_SERVICE" \
    sh -c 'mkdir -p /data/storage && tar -C /data -czf /tmp/storage.tar.gz storage'
  docker compose -f "$COMPOSE_FILE" cp "$API_SERVICE":/tmp/storage.tar.gz "$OUT_DIR/storage.tar.gz"
  docker compose -f "$COMPOSE_FILE" exec -T "$API_SERVICE" rm -f /tmp/storage.tar.gz
else
  echo "API container not ready — writing an empty storage archive."
  EMPTY_DIR="$(mktemp -d)"
  mkdir -p "$EMPTY_DIR/storage"
  tar -czf "$OUT_DIR/storage.tar.gz" -C "$EMPTY_DIR" storage
  rm -rf "$EMPTY_DIR"
fi

USER_COUNT="$(docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  psql -U "$USER_NAME" -d "$DB_NAME" -Atqc 'SELECT COUNT(*) FROM "users";' | tr -d '\r')"
DUMP_BYTES="$(wc -c < "$OUT_DIR/database.dump" | tr -d ' ')"
STORAGE_BYTES="$(wc -c < "$OUT_DIR/storage.tar.gz" | tr -d ' ')"
EXPORTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "$OUT_DIR/manifest.txt" <<EOF
source=local-docker $POSTGRES_SERVICE
purpose=coolify-replace-clone
exported=$EXPORTED
users=$USER_COUNT
database_bytes=$DUMP_BYTES
storage_bytes=$STORAGE_BYTES
includes=all tables, all users, platform settings, catalogs, clinic data
note=Restore on Coolify with CONFIRM_REPLACE=1 pnpm bootstrap:prod -- --replace --skip-admin
EOF

echo "Wrote $OUT_DIR/database.dump ($DUMP_BYTES bytes)"
echo "Wrote $OUT_DIR/storage.tar.gz ($STORAGE_BYTES bytes)"
echo "Users in snapshot: $USER_COUNT"
echo
echo "Next:"
echo "  1. Commit and push deploy/bootstrap (Coolify rebuilds the API image with this dump)."
echo "  2. Coolify → API → Execute Command:"
echo "       CONFIRM_REPLACE=1 pnpm bootstrap:prod -- --replace --skip-admin"
echo "  3. Log in on the production site with the same emails and passwords as local."
