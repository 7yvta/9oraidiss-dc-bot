# Discord Ticket + Moderation + MM Bot

This bot includes:

- 3 ticket types in one panel: Support, Middleman, Index
- Extra role-request ticket panel: `/panel1`
- Ticket actions: claim + close buttons
- Ticket member management: `/add`, `/remove` (inside ticket channels)
- Ticket override claim: `/forceclaim` (owner/co-owner roles)
- Role-scoped ticket handling by team
- Moderation: `warn`, `warnings`, `clearwarnings`, `kick`, `ban`, `timeout`, `purge`
- Ban command requires a reason
- Auto-role on member join
- Arcane-style leveling (`/rank`, `/leaderboard`)
- Level reward roles (5, 15, 25, 40, 65, 100)
- Giveaway system (`/giveaway start|end|reroll`)
- Invite tracker (`/invites stats|invitedby|leaderboard`)
- Role manager (`/managerole add|remove`)
- `/middleman` info command with 2 images
- `/rules` server rules command
- Role-based command access control
- Owner-only command mode
- Optional web dashboard to edit runtime config
- Command dashboard supports disable/allow/deny role overrides for every slash command

## Install

```bash
npm install
```

## Render Quick Deploy

Use Render web service deployment:
- https://render.com/docs/your-first-deploy

This repo now includes `render.yaml` at the project root.

Steps:
1. Push this repo to GitHub.
2. In Render: New -> Web Service -> connect the repo.
3. Render reads `render.yaml` automatically.
4. Add required env vars in Render (`TOKEN`, `CLIENT_ID`, `GUILD_ID`, and your role/channel IDs).
5. Deploy.

Important free-tier note:
- Render free web services can spin down after inactivity and are not guaranteed as strict 24/7 production hosting.
- Source: https://render.com/free

## Google Free Tier VM (24/7-style)

Use this script to deploy the bot to a Compute Engine `e2-micro` VM (free-tier eligible when you stay within Google limits):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-gcp-free-vm.ps1 -ProjectId YOUR_PROJECT_ID
```

Optional dashboard (opens port 3000 + sets `PUBLIC_BASE_URL` if empty):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-gcp-free-vm.ps1 -ProjectId YOUR_PROJECT_ID -EnableDashboard
```

Before first run:
- `gcloud auth login`
- `gcloud config set project YOUR_PROJECT_ID`

## Self-Hosting On Old PC

For turning an old PC into your bot server, follow:
- [OLD_PC_SERVER.md](OLD_PC_SERVER.md)

## Configure

Copy `.env.example` to `.env` and fill your values.

Minimum required:

- `TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

Privacy:

- `OWNER_ONLY_MODE=true` keeps slash commands owner-only.
- Set `BOT_OWNER_ID=your_user_id` to hard-lock commands to your account.
- If `BOT_OWNER_ID` is empty, guild owner ID is used.

Leveling options:

- `LEVEL_CURVE=linear|exponential|flat`
- `LEVEL_CURVE_MULTIPLIER=1`
- `MESSAGE_XP_MIN=15`
- `MESSAGE_XP_MAX=40`
- `MESSAGE_XP_COOLDOWN_SECONDS=60`
- `LEVEL_UP_CHANNEL_ID=` (optional; if set, level-ups are announced there)
- `WARN_CONSEQUENCE={"enabled":false,"threshold":3,"action":"timeout","timeoutMinutes":60,"clearWarningsOnAction":true,"reason":"Automatic moderation consequence after warning threshold"}`
- `WARN_CONSEQUENCES=[{"enabled":true,"threshold":3,"action":"timeout","timeoutMinutes":60,"clearWarningsOnAction":false,"reason":"Warn threshold reached"},{"enabled":true,"threshold":5,"action":"kick","timeoutMinutes":60,"clearWarningsOnAction":true,"reason":"Repeated rule violations"}]`

Dashboard (optional):

- `DASHBOARD_ENABLED=true`
- `DASHBOARD_BIND=0.0.0.0`
- `DASHBOARD_PORT=3000`
- `DASHBOARD_USERNAME=admin`
- `DASHBOARD_PASSWORD=change_me`
- `PUBLIC_BASE_URL=` (optional; if empty on Render, bot auto-uses `RENDER_EXTERNAL_URL`)
- URL example: `https://your-service.onrender.com/login`
- Runtime overrides are stored in `data/runtime-config.json`
- `COMMAND_PERMISSIONS={}` (optional JSON; dashboard can manage this automatically)

For full feature set:

- Ticket categories and team role IDs
- `MEMBER_ROLE_ID`
- `GIVEAWAY_HOST_ROLE_ID`
- `GIVEAWAY_EXTRA_ENTRIES_ROLE_IDS`
- `AUTORESPONDER_ENABLED`
- `AUTORESPONDER_RULES`
- `AUTO_MESSAGE_ENABLED`
- `AUTO_MESSAGE_CHANNEL_ID`
- `AUTO_MESSAGE_INTERVAL_MINUTES`
- `AUTO_MESSAGE_CONTENT`
- `FULL_COMMAND_ROLE_IDS`
- `TIMEOUT_ONLY_ROLE_IDS`
- `MOD_LOG_CHANNEL_ID`
- `LEVEL_LOG_CHANNEL_ID`
- `GIVEAWAY_LOG_CHANNEL_ID`
- `WELCOME_CHANNEL_ID`
- `RULES_CHANNEL_ID` (optional, for welcome template)
- `WELCOME_ENABLED=true|false`
- `WELCOME_MESSAGE_TEMPLATE=...`
- `LEVEL_REWARDS`
- `CLEAR_GLOBAL_COMMANDS=true` (recommended to avoid duplicate slash commands)

## Intents

Enable in Discord Developer Portal (Bot tab):

- Server Members Intent
- Message Content Intent

Then in `.env`:

- `GUILD_MEMBERS_INTENT=true`
- `MESSAGE_CONTENT_INTENT=true`

## Deploy Commands

```bash
npm run deploy:commands
```

## Start Bot

```bash
npm start
```

## Main Commands

- `/ticketpanel`
- `/panel1`
- `/add`
- `/remove`
- `/unclaim`
- `/middleman`
- `/rules`
- `/managerole add`
- `/managerole remove`
- `/giveaway start`
- `/giveaway end`
- `/giveaway reroll`
- `/giveaway extraentries`
- `/giveaway participants`
- `/invites stats`
- `/invites invitedby`
- `/invites leaderboard`
- `/rank`
- `/leaderboard`
- `/warn`
- `/warnings`
- `/clearwarnings`
- `/kick`
- `/manageban`
- `/unban`
- `/timeout`
- `/purge`

## Notes

- Warnings: `data/warnings.json`
- Levels: `data/levels.json`
- Giveaways: `data/giveaways.json`
- Middleman images are loaded from `assets/`
- If privileged intents are disabled, the bot auto-starts in safe mode (without auto-role and message leveling).
- Moderation logs also include message edits/deletes, member joins/leaves/kicks, bans/unbans, and timeout updates.
