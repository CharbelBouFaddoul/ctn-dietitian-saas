#!/bin/sh
# Restore PostgreSQL and file storage from a Phase 13 backup artifact directory.
#
# SAFETY: This uses pg_restore --clean (destructive). It will NOT run unless
# CONFIRM_RESTORE=1. For a second restore over an already-populated DB, also set
# CONFIRM_RESTORE_OVERWRITE=1. Never wire this into deploy/migrate.
set -eu

if [ $# -lt 1 ]; then
  echo "Usage: CONFIRM_RESTORE=1 $0 <backup-artifact-dir>" >&2
  exit 1
fi

ARTIFACT_DIR="$1"
ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
FILE_STORAGE_PATH="${FILE_STORAGE_PATH:-$ROOT_DIR/storage}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [ "${CONFIRM_RESTORE:-}" != "1" ]; then
  echo "Refusing restore: set CONFIRM_RESTORE=1 to confirm a destructive database restore." >&2
  exit 1
fi

if [ ! -f "$ARTIFACT_DIR/database.dump" ]; then
  echo "Missing $ARTIFACT_DIR/database.dump" >&2
  exit 1
fi

# Refuse to wipe a DB that already has users unless explicitly allowed.
USER_COUNT="$(psql "$DATABASE_URL" -Atqc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User';" 2>/dev/null || echo "0")"
if [ "$USER_COUNT" = "1" ]; then
  EXISTING_USERS="$(psql "$DATABASE_URL" -Atqc 'SELECT COUNT(*) FROM "User";' 2>/dev/null || echo "0")"
  if [ "${EXISTING_USERS:-0}" -gt 0 ] && [ "${CONFIRM_RESTORE_OVERWRITE:-}" != "1" ]; then
    echo "Refusing restore: database already has ${EXISTING_USERS} user(s)." >&2
    echo "This protects production data after the first import. Set CONFIRM_RESTORE_OVERWRITE=1 only if you intend to wipe." >&2
    exit 1
  fi
fi

echo "Restoring database..."
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$ARTIFACT_DIR/database.dump"

if [ -f "$ARTIFACT_DIR/storage.tar.gz" ]; then
  echo "Restoring file storage to $FILE_STORAGE_PATH..."
  mkdir -p "$(dirname "$FILE_STORAGE_PATH")"
  tar -xzf "$ARTIFACT_DIR/storage.tar.gz" -C "$(dirname "$FILE_STORAGE_PATH")"
fi

echo "Restore complete from $ARTIFACT_DIR"
echo "Next (optional): create your own admin with bootstrap:admin — not demo:seed."
