# Windows Local Setup

Two long-running processes, two separate PowerShell windows: backend and
frontend. The single biggest source of errors when running this locally is
pasting setup commands into a window where one of these is already running —
keep them apart.

---

## One-time setup

Only needed the first time, or after `npm run db:reset`.

```powershell
cd C:\gpt\automation
npm install
npm run db:migrate      # creates prisma/migrations + local-data/dev.db
npm run db:seed         # seeds admin + 2 users + sample integrations
```

---

## Window 1 — Backend

Open a PowerShell window and dedicate it to the backend. Leave it running.

```powershell
cd C:\gpt\automation
npm run dev
```

You should see `[scheduler] Started with N active schedule(s).` and no
errors. Backend is now at **http://localhost:3001**.

Do not type or paste anything else into this window while it's running.

---

## Window 2 — Frontend

Open a **second, separate** PowerShell window for this. Leave it running too.

```powershell
cd C:\gpt\automation\frontend\dashboard
npm install              # first time only
npm run dev
```

Dashboard is now at **http://localhost:5173** (proxies `/api` and `/webhooks`
to the backend on :3001 automatically — no `.env` needed here by default).

---

## Optional Window 3 - Public webhook tunnel with ngrok

Use this when an external system needs to call your local webhook URL.
The tunnel targets the backend API port, not the Vite dashboard port.

One time only, add your ngrok auth token to local `.env`:

```powershell
NGROK_AUTHTOKEN=your-ngrok-token
```

Then start the tunnel in a third PowerShell window:

```powershell
cd C:\gpt\automation
npm run dev:tunnel
```

The script prints the public API base URL and writes it to
`local-data/ngrok-public-url.txt`. While the tunnel is running, webhook settings
in the dashboard show full public URLs such as:

```text
https://example.ngrok-free.app/webhooks/user_001/whatsapp-order
```

Keep this window open while testing external webhooks. Stop it with `Ctrl+C`.

Ngrok free endpoints may show a browser warning for manual browser/PowerShell
checks. For API smoke tests, add the header `ngrok-skip-browser-warning: true`.

---

## Log in

| Email | Password | Role |
|---|---|---|
| admin@example.com | Admin123! | admin |
| user1@example.com | User123! | user — owns `whatsapp-order` (webhook) + `stock-sync` (scheduled) |
| user2@example.com | User123! | user — owns `whatsapp-order` (webhook) |

---

## Stopping

`Ctrl+C` in each window.

---

## Troubleshooting

**`Error: listen EADDRINUSE: address already in use :::3001`**

Something is already bound to port 3000 — usually a previous backend
instance still running in another window you forgot about.

```powershell
netstat -ano | findstr :3001
```

Take the number in the last column (the PID) and run:

```powershell
taskkill /PID <that number> /F
```

Re-check with `netstat -ano | findstr :3001` — it should print nothing —
then retry `npm run dev`.

**`EPERM: operation not permitted, rename ...query_engine-windows.dll.node...`**

This happens when `npm install` runs while the backend is still running
*anywhere* (even a different window). Windows locks the Prisma query-engine
DLL while it's loaded into the running `node` process, so `prisma generate`
can't overwrite it. Fix: stop every running backend instance first (see
EADDRINUSE fix above if you're not sure one is still alive), then re-run:

```powershell
npm install
npm run dev
```

**Golden rule:** `npm run dev` (backend and frontend both) is a foreground
process that never returns control. Anything else — `npm install`, `cd`,
`git`, etc. — goes in its own separate window.

---

## Resetting the local database

```powershell
npm run db:reset
npm run db:seed
```

## Running the automated tests

Uses its own throwaway SQLite file — safe to run anytime, won't touch your
dev data:

```powershell
npm test
```
