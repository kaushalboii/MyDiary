#!/usr/bin/env bash
set -euo pipefail

echo "Setting up MyDiary secure storage server on $(hostname)..."
npm install --omit=dev

if [ ! -f .env ]; then
  cp .env.example .env
fi

# Auto-generate a strong 64-char hex secret token if DIARY_STORAGE_TOKEN is empty
CURRENT_TOKEN="$(grep -E '^DIARY_STORAGE_TOKEN=' .env | cut -d '=' -f2- | tr -d '[:space:]' || true)"
GENERATED_TOKEN=""
if [ -z "$CURRENT_TOKEN" ]; then
  if command -v openssl >/dev/null 2>&1; then
    GENERATED_TOKEN="$(openssl rand -hex 32)"
  else
    GENERATED_TOKEN="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
  fi
  if grep -qE '^DIARY_STORAGE_TOKEN=' .env; then
    node -e '
      const fs = require("node:fs");
      const token = process.argv[1];
      const next = fs.readFileSync(".env", "utf8").replace(/^DIARY_STORAGE_TOKEN=.*$/m, "DIARY_STORAGE_TOKEN=" + token);
      fs.writeFileSync(".env", next, "utf8");
    ' "$GENERATED_TOKEN"
  else
    printf '\nDIARY_STORAGE_TOKEN=%s\n' "$GENERATED_TOKEN" >> .env
  fi
fi

mkdir -p data data/uploads
chmod 600 .env
chmod 700 data data/uploads

if [ -n "$GENERATED_TOKEN" ]; then
  echo "Generated private DIARY_STORAGE_TOKEN in .env (chmod 600)."
  echo "Copy this token once into Settings -> Security & Mini Server in your MyDiary web app:"
  echo "  $GENERATED_TOKEN"
fi

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe mydiary-storage >/dev/null 2>&1; then
    pm2 restart mydiary-storage --update-env
  else
    pm2 start ecosystem.config.cjs
  fi
  pm2 save || true
  echo "PM2 process 'mydiary-storage' is running on port 4321."
else
  echo "PM2 not found in PATH. Starting in background with nohup..."
  pkill -f "node server.mjs" || true
  nohup node server.mjs > server.log 2>&1 < /dev/null &
  sleep 1
  echo "Started mydiary-storage in background (PID $!). Logs: $(pwd)/server.log"
fi
