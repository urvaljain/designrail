#!/usr/bin/env sh
# Apply migrations (non-destructive), sync the synthetic demo board, then start the production server.
# Tests create unique users per run, so the database never needs to be wiped.
set -e
npx prisma migrate deploy >/dev/null
npx tsx src/worker/sync-cli.ts >/dev/null
exec npx next start -p "$PORT"
