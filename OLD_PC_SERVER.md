# Old PC -> 24/7 Bot Server (No Card Needed)

This is the most practical zero-subscription hosting route.

## 1) Install Ubuntu Server

Use Ubuntu Server 22.04 LTS or 24.04 LTS on the old PC.

## 2) Copy your bot repo to the old PC

```bash
git clone YOUR_REPO_URL
cd can-u-creat-a-fully-dc
```

Create and fill `.env`:

```bash
cp .env.example .env
nano .env
```

## 3) One-command bot setup

Run this from repo root on the old PC:

```bash
bash ./scripts/setup-old-pc-ubuntu.sh
```

This installs Node 20 + PM2, deploys files to `/opt/dc-ticket-bot`, starts the bot, and enables auto-start on reboot.

## 4) Optional: public dashboard with Cloudflare Tunnel

In Cloudflare Zero Trust, create a tunnel and copy the token command value.

Then run:

```bash
bash ./scripts/setup-cloudflared-token.sh 'YOUR_TUNNEL_TOKEN'
```

After tunnel route is configured in Cloudflare, set your public URL in `/opt/dc-ticket-bot/.env`:

```bash
PUBLIC_BASE_URL=https://your-domain.example.com
DASHBOARD_ENABLED=true
```

Apply env change:

```bash
cd /opt/dc-ticket-bot
pm2 restart dc-ticket-bot --update-env
pm2 save
```

## 5) Keep it stable 24/7

1. Disable OS sleep and hibernate.
2. Enable BIOS/UEFI "Restore on AC Power Loss".
3. Use wired Ethernet.
4. Use a UPS if possible.
5. Keep temps low and clean dust.

## 6) Daily commands

```bash
pm2 status
pm2 logs dc-ticket-bot
pm2 restart dc-ticket-bot --update-env
sudo systemctl status cloudflared
```
