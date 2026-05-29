#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <tunnel-name> <hostname> [service-url]"
  echo "Example: $0 dc-ticket-bot dash.example.com http://localhost:3000"
  exit 1
fi

TUNNEL_NAME="$1"
HOSTNAME="$2"
SERVICE_URL="${3:-http://localhost:3000}"
BOT_DIR="${BOT_DIR:-/opt/dc-ticket-bot}"
ENV_FILE="${ENV_FILE:-$BOT_DIR/.env}"

if [[ "$EUID" -eq 0 ]]; then
  echo "Run as a normal user (not root). The script uses sudo when needed."
  exit 1
fi

install_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    return
  fi

  echo "[1/7] Installing cloudflared..."
  ARCH="$(dpkg --print-architecture)"
  TMP_DEB="/tmp/cloudflared-linux-${ARCH}.deb"
  curl -fsSL -o "$TMP_DEB" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  sudo dpkg -i "$TMP_DEB"
  rm -f "$TMP_DEB"
}

find_tunnel_id() {
  cloudflared tunnel list 2>/dev/null \
    | awk -v t="$TUNNEL_NAME" 'NR>1 && $2==t { print $1; exit }'
}

ensure_tunnel_exists() {
  local tunnel_id
  tunnel_id="$(find_tunnel_id || true)"
  if [[ -n "$tunnel_id" ]]; then
    echo "$tunnel_id"
    return
  fi

  local create_output
  create_output="$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)"
  tunnel_id="$(printf '%s\n' "$create_output" | grep -Eo '[0-9a-fA-F-]{36}' | head -n 1 || true)"
  if [[ -z "$tunnel_id" ]]; then
    tunnel_id="$(find_tunnel_id || true)"
  fi

  if [[ -z "$tunnel_id" ]]; then
    echo "Failed to create/find tunnel ID for $TUNNEL_NAME"
    echo "$create_output"
    exit 1
  fi

  echo "$tunnel_id"
}

echo "[1/7] Checking cloudflared..."
install_cloudflared

echo "[2/7] Checking Cloudflare auth..."
if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  echo "No cert found. A browser login will open now."
  cloudflared tunnel login
fi

echo "[3/7] Ensuring tunnel exists..."
TUNNEL_ID="$(ensure_tunnel_exists)"
echo "Tunnel: $TUNNEL_NAME ($TUNNEL_ID)"

echo "[4/7] Routing DNS..."
set +e
ROUTE_OUTPUT="$(cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1)"
ROUTE_CODE=$?
set -e
if [[ $ROUTE_CODE -ne 0 ]]; then
  if printf '%s\n' "$ROUTE_OUTPUT" | grep -qi "already exists"; then
    echo "DNS route already exists, continuing."
  else
    echo "$ROUTE_OUTPUT"
    exit 1
  fi
fi

CRED_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"
if [[ ! -f "$CRED_FILE" ]]; then
  echo "Credentials file not found: $CRED_FILE"
  exit 1
fi

echo "[5/7] Writing cloudflared config..."
mkdir -p "$HOME/.cloudflared"
cat > "$HOME/.cloudflared/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

ingress:
  - hostname: $HOSTNAME
    service: $SERVICE_URL
  - service: http_status:404
EOF

echo "[6/7] Installing/updating cloudflared service..."
sudo cloudflared --config "$HOME/.cloudflared/config.yml" service install
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared

echo "[7/7] Updating bot public URL (optional)..."
if [[ -f "$ENV_FILE" ]]; then
  python3 - "$ENV_FILE" "$HOSTNAME" <<'PY'
import pathlib
import re
import sys

env_path = pathlib.Path(sys.argv[1])
host = sys.argv[2]
text = env_path.read_text(encoding="utf-8")
line = f"PUBLIC_BASE_URL=https://{host}"
if re.search(r"^PUBLIC_BASE_URL=.*$", text, flags=re.M):
    text = re.sub(r"^PUBLIC_BASE_URL=.*$", line, text, flags=re.M)
else:
    if text and not text.endswith("\n"):
        text += "\n"
    text += line + "\n"
env_path.write_text(text, encoding="utf-8")
PY
  echo "Updated: $ENV_FILE -> PUBLIC_BASE_URL=https://$HOSTNAME"
  if command -v pm2 >/dev/null 2>&1; then
    (cd "$BOT_DIR" && pm2 restart dc-ticket-bot --update-env && pm2 save) || true
  fi
fi

echo ""
echo "Done."
echo "Public URL: https://$HOSTNAME"
echo "Check tunnel: sudo systemctl status cloudflared"
