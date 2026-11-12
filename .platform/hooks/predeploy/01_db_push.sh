#!/bin/bash
# Runs on every EB deploy, after `npm install` (and its postinstall
# `prisma generate`) but before the app starts serving traffic.
#
# Generate the client without touching the database. Schema/data updates below
# require explicit authorization in the checked-in deployment safety policy.
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

node_modules/.bin/prisma generate --schema=prisma/schema.postgres.prisma

# This release's checked-in policy also covers data synchronization, not just DDL.
if node -e "process.exit(require('./config/deployment-safety.json').databaseUpdatesEnabled === true ? 0 : 1)"; then
  node_modules/.bin/prisma db push \
    --schema=prisma/schema.postgres.prisma \
    --accept-data-loss \
    --skip-generate
  node scripts/sync-integration-db.js
else
  echo "Deployment safety: database schema updates and integration sync skipped."
fi
