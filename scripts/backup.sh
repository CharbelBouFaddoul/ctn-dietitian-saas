#!/bin/sh
# Back up PostgreSQL and persistent file storage for Phase 13 restore drills.
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_DIR="$BACKUP_DIR/$TIMESTAMP"

mkdir -p "$ARTIFACT_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

FILE_STORAGE_PATH="${FILE_STORAGE_PATH:-$ROOT_DIR/storage}"

echo "Creating database dump..."
pg_dump "$DATABASE_URL" --format=custom --file="$ARTIFACT_DIR/database.dump"

echo "Archiving file storage from $FILE_STORAGE_PATH..."
tar -czf "$ARTIFACT_DIR/storage.tar.gz" -C "$(dirname "$FILE_STORAGE_PATH")" "$(basename "$FILE_STORAGE_PATH")"

cat > "$ARTIFACT_DIR/manifest.txt" <<EOF
timestamp=$TIMESTAMP
database=database.dump
storage=storage.tar.gz
EOF

echo "Backup written to $ARTIFACT_DIR"
