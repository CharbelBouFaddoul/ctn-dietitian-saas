#!/bin/sh
# Restore PostgreSQL and file storage from a Phase 13 backup artifact directory.
set -eu

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-artifact-dir>" >&2
  exit 1
fi

ARTIFACT_DIR="$1"
ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
FILE_STORAGE_PATH="${FILE_STORAGE_PATH:-$ROOT_DIR/storage}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [ ! -f "$ARTIFACT_DIR/database.dump" ]; then
  echo "Missing $ARTIFACT_DIR/database.dump" >&2
  exit 1
fi

echo "Restoring database..."
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$ARTIFACT_DIR/database.dump"

if [ -f "$ARTIFACT_DIR/storage.tar.gz" ]; then
  echo "Restoring file storage to $FILE_STORAGE_PATH..."
  mkdir -p "$(dirname "$FILE_STORAGE_PATH")"
  tar -xzf "$ARTIFACT_DIR/storage.tar.gz" -C "$(dirname "$FILE_STORAGE_PATH")"
fi

echo "Restore complete from $ARTIFACT_DIR"
