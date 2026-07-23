@echo off
set NODE_ENV=development
set DATABASE_URL=file:C:/gpt/automation/local-data/dev.db
set INTEGRATIONS_ROOT=src/integrations
set PORT=3001
cd /d C:\gpt\automation
node src/server.js >> C:\gpt\automation\local-backend.log 2>&1
