#!/bin/bash
# Runs on every EB deploy, after `npm install` (and its postinstall
# `prisma generate`) but before the app starts serving traffic.
#
# Uses `prisma db push` rather than `prisma migrate deploy` deliberately:
# this project has no committed migration history for Postgres yet (see
# DEPLOYMENT.md / AWS_SETUP.md for why), and `db push` is safe/idempotent to
# re-run on every deploy. Once the team has a stable Postgres dev workflow,
# switch this to `prisma migrate deploy` against a real migrations/ folder.
set -euo pipefail

# Load the environment properties set via `eb setenv` (DATABASE_URL, etc.)
# into this script's shell — they aren't inherited automatically by hooks.
while IFS='=' read -r key value; do
  export "$key=$value"
done < <(/opt/elasticbeanstalk/bin/get-config environment | jq -r 'to_entries[] | "\(.key)=\(.value)"')

cd /var/app/staging

npm --prefix frontend/dashboard ci --include=dev
npm --prefix frontend/dashboard run build
rm -rf frontend/dashboard/node_modules

node_modules/.bin/prisma db push \
  --schema=prisma/schema.postgres.prisma \
  --accept-data-loss \
  --skip-generate

node scripts/sync-integration-db.js
