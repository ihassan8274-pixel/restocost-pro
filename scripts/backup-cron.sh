#!/bin/bash
# RestoCost ERP Pro - Automated PostgreSQL Backup Script
# Runs daily via cron. Keeps last 30 days locally, optionally uploads to S3.

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_URL="${DATABASE_URL:-postgresql://restocost:restocost@127.0.0.1:5433/restocost2}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="restocost_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Logging
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "${BACKUP_DIR}"

log "Starting backup: ${BACKUP_FILE}"

# Dump database
if pg_dump "${DB_URL}" | gzip > "${BACKUP_PATH}"; then
  log "Backup completed: ${BACKUP_PATH} ($(du -h "${BACKUP_PATH}" | cut -f1))"
else
  log "ERROR: pg_dump failed"
  exit 1
fi

# Remove old backups
log "Removing backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name "restocost_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete

# Optional: Upload to S3
if [[ -n "${S3_BUCKET}" ]]; then
  if command -v aws &> /dev/null; then
    log "Uploading to S3: s3://${S3_BUCKET}/backups/${BACKUP_FILE}"
    if aws s3 cp "${BACKUP_PATH}" "s3://${S3_BUCKET}/backups/${BACKUP_FILE}"; then
      log "S3 upload successful"
    else
      log "WARNING: S3 upload failed"
    fi
  else
    log "WARNING: aws CLI not installed, skipping S3 upload"
  fi
fi

# Optional: Verify backup integrity
log "Verifying backup integrity..."
if gunzip -t "${BACKUP_PATH}"; then
  log "Backup integrity OK"
else
  log "ERROR: Backup file corrupted!"
  exit 1
fi

log "Backup job finished successfully"