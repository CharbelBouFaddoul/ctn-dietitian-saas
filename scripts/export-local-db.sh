#!/bin/sh
# Dump the local Docker Postgres database so it can be restored on another environment.
# Does not include uploaded files — pair with scripts/backup.sh when you need storage too.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/local-db-$TIMESTAMP.sql"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
SERVICE="${POSTGRES_SERVICE:-postgres}"
USER_NAME="${POSTGRES_USER:-nutrition}"
DB_NAME="${POSTGRES_DB:-nutrition}"

mkdir -p "$BACKUP_DIR"

echo "Dumping $DB_NAME from $SERVICE..."
docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" \
  pg_dump -U "$USER_NAME" -d "$DB_NAME" --clean --if-exists --no-owner --no-acl \
  > "$OUT"

echo "Wrote $OUT"
echo "Restore on the target (after migrations, as a privileged DB user):"
echo "  psql \"\$DATABASE_URL\" < \"$OUT\""
echo "Or copy the file into the remote Postgres container and run psql there."
