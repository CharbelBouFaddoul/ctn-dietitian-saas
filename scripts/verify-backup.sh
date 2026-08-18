#!/bin/sh
# Verify a backup artifact contains expected files.
set -eu

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-artifact-dir>" >&2
  exit 1
fi

ARTIFACT_DIR="$1"

for file in database.dump manifest.txt; do
  if [ ! -f "$ARTIFACT_DIR/$file" ]; then
    echo "Missing required artifact: $file" >&2
    exit 1
  fi
done

if [ ! -f "$ARTIFACT_DIR/storage.tar.gz" ]; then
  echo "Warning: storage.tar.gz missing (database-only backup)" >&2
fi

echo "Backup artifact $ARTIFACT_DIR looks valid"
