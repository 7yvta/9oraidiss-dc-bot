#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <CLOUDFLARE_TUNNEL_TOKEN>"
  exit 1
fi

TOKEN="$1"

if [[ "$EUID" -eq 0 ]]; then
  echo "Run as a normal user (not root). The script uses sudo when needed."
  exit 1
fi

echo "[1/3] Installing cloudflared..."
ARCH="$(dpkg --print-architecture)"
TMP_DEB="/tmp/cloudflared-linux-${ARCH}.deb"
curl -fsSL -o "$TMP_DEB" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
sudo dpkg -i "$TMP_DEB"
rm -f "$TMP_DEB"

echo "[2/3] Installing cloudflared service with tunnel token..."
sudo cloudflared service install "$TOKEN"

echo "[3/3] Enabling and starting cloudflared service..."
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sudo systemctl --no-pager --full status cloudflared | head -n 20

echo ""
echo "cloudflared is installed and running."

