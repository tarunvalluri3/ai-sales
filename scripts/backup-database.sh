#!/usr/bin/env bash
# Nightly logical backup of the production database, for plans with no managed
# backups. Run it from the VPS crontab, never from a developer machine.
#
# Required:
#   BACKUP_DATABASE_URL  Postgres connection string (Supabase: Connect > Session pooler)
#   BACKUP_DIR           Local folder for the dumps, outside the app folder
# Optional:
#   BACKUP_GCS_BUCKET    gs://bucket to copy each dump to, so a lost VPS keeps its backups
#   BACKUP_KEEP_DAYS     Local retention in days (default 14)
#
# Needs a pg_dump at least as new as the server (Supabase runs Postgres 15 or 17).
# Restore into a TEMPORARY project only, with:
#   pg_restore --no-owner --no-privileges --dbname="$TEMP_DATABASE_URL" <file>
set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

umask 077
mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/ai-pilot-$(date -u +%Y%m%dT%H%M%SZ).dump"
partial="$target.partial"
trap 'rm -f "$partial"' EXIT

pg_dump --dbname="$BACKUP_DATABASE_URL" --format=custom --no-owner --no-privileges --file="$partial"
pg_restore --list "$partial" > /dev/null
mv "$partial" "$target"

if [[ -n "${BACKUP_GCS_BUCKET:-}" ]]; then
  gcloud storage cp "$target" "$BACKUP_GCS_BUCKET/"
fi

find "$BACKUP_DIR" -name 'ai-pilot-*.dump' -type f -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $target ($(du -h "$target" | cut -f1))"
