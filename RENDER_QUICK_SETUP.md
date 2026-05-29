# Render Quick Setup (Main Bot + Dashboard)

1. Push this repo to GitHub.
2. In Render: New -> Blueprint.
3. Select this repo (Render reads `render.yaml`).
4. In service `dc-ticket-bot`, set these required env vars:
   - `TOKEN`
   - `CLIENT_ID`
   - `BOT_OWNER_ID`
   - `DASHBOARD_SESSION_SECRET`
   - `DASHBOARD_USERNAME`
   - `DASHBOARD_PASSWORD`
5. Optional but recommended:
   - `PUBLIC_BASE_URL` = your Render URL (https://<service>.onrender.com)
   - `DASHBOARD_PUBLIC_URL` = same value
   - `GUILD_ID` (for faster guild command sync)
   - `DATABASE_URL` (if using Postgres)
6. Deploy and open:
   - `/health` for health check
   - `/dashboard` for public dashboard
   - `/owner` for owner dashboard

Notes:
- Free plan can sleep after inactivity.
- If commands don't appear instantly, run `/automodsync` or restart service once.
