#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:-$PWD}"
INSTALL_DIR="${INSTALL_DIR:-/opt/dc-ticket-bot}"
LOG_DIR="${LOG_DIR:-/var/log/dc-ticket-bot}"

if [[ ! -f "$REPO_DIR/package.json" ]]; then
  echo "Error: package.json not found in $REPO_DIR"
  echo "Run this script from the bot repo or pass repo path as first arg."
  exit 1
fi

if [[ "$EUID" -eq 0 ]]; then
  echo "Run as a normal user (not root). The script uses sudo when needed."
  exit 1
fi

echo "[1/8] Installing system dependencies..."
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates gnupg git rsync unzip build-essential

echo "[2/8] Installing Node.js 20 if missing..."
if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v20\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "[3/8] Installing PM2..."
sudo npm install -g pm2

echo "[4/8] Syncing project to $INSTALL_DIR..."
sudo mkdir -p "$INSTALL_DIR"
sudo mkdir -p "$LOG_DIR"
sudo rsync -a --delete \
  --exclude ".git" \
  --exclude ".github" \
  --exclude "node_modules" \
  --exclude "*.log" \
  --exclude "bot.err.log" \
  --exclude "bot.out.log" \
  "$REPO_DIR"/ "$INSTALL_DIR"/
sudo chown -R "$USER":"$USER" "$INSTALL_DIR"
sudo chown -R "$USER":"$USER" "$LOG_DIR"

cd "$INSTALL_DIR"

if [[ ! -f ".env" ]]; then
  echo "[5/8] .env missing. Creating from .env.example..."
  cp .env.example .env
  echo "Edit $INSTALL_DIR/.env with real values, then rerun this script."
  exit 0
fi

echo "[5/8] Installing node dependencies..."
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

echo "[6/8] Starting bot with PM2..."
pm2 delete dc-ticket-bot >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs --only dc-ticket-bot --update-env
pm2 save

echo "[7/8] Enabling PM2 startup on boot..."
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME"

echo "[8/8] Done."
pm2 status
echo ""
echo "Useful commands:"
echo "  pm2 logs dc-ticket-bot"
echo "  pm2 restart dc-ticket-bot"
echo "  pm2 save"

