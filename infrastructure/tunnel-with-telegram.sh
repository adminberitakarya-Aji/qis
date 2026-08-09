#!/usr/bin/env bash
#
# Runs a Cloudflare Quick Tunnel (no domain required) in front of the Qis
# API, and sends the resulting https://xxxx.trycloudflare.com URL straight
# to your Telegram bot every time cloudflared (re)starts.
#
# Why this exists: Quick Tunnel URLs are random and change on every
# restart (server reboot, PM2 auto-restart after a crash, etc). Without
# this, you'd have to SSH in and grep the PM2 logs to find the new URL.
# This script watches cloudflared's own log output and pushes the URL to
# you the moment it's assigned, so you can update NEXT_PUBLIC_API_URL /
# NEXT_PUBLIC_WS_URL on Vercel right away.
#
# Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to already be set in
# the environment (PM2 injects these — see ecosystem.config.cjs).

set -uo pipefail

LOCAL_PORT="${TUNNEL_LOCAL_PORT:-3001}"
LOG_FILE="/tmp/qis-cloudflared.log"

send_telegram() {
  local message="$1"
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    echo "[tunnel] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — skipping notification" >&2
    return
  fi
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "parse_mode=Markdown" \
    -d "text=${message}" > /dev/null
}

echo "[tunnel] Starting Cloudflare Quick Tunnel -> http://localhost:${LOCAL_PORT}"
send_telegram "🔌 *Qis Tunnel* starting up, waiting for a public URL..."

# Run cloudflared, tee output to a log file so we can grep it, and stream
# to stdout too (so `pm2 logs qis-tunnel` still shows everything live).
cloudflared tunnel --url "http://localhost:${LOCAL_PORT}" --no-autoupdate 2>&1 | tee "$LOG_FILE" &
CF_PID=$!

# Watch the log for the assigned trycloudflare.com URL and notify once.
FOUND=""
for _ in $(seq 1 60); do
  URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_FILE" | head -n1 || true)
  if [[ -n "$URL" && "$URL" != "$FOUND" ]]; then
    FOUND="$URL"
    echo "[tunnel] Public URL: $URL"
    send_telegram "✅ *Qis backend is live*
URL: \`${URL}\`

Update di Vercel:
\`NEXT_PUBLIC_API_URL=${URL}/api/v1\`
\`NEXT_PUBLIC_WS_URL=${URL/https/wss}/realtime\`"
    break
  fi
  sleep 1
done

if [[ -z "$FOUND" ]]; then
  echo "[tunnel] WARNING: could not detect tunnel URL after 60s — check $LOG_FILE" >&2
  send_telegram "⚠️ *Qis Tunnel* started but no URL was detected after 60s. Cek log server."
fi

# Keep the script alive as long as cloudflared is running — PM2 tracks
# this process, so if cloudflared dies, PM2 restarts this whole script
# and the cycle (start -> detect URL -> notify) repeats automatically.
wait "$CF_PID"
EXIT_CODE=$?
send_telegram "🔴 *Qis Tunnel* process stopped (exit code ${EXIT_CODE}). PM2 akan restart otomatis."
exit "$EXIT_CODE"