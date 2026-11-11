#!/usr/bin/env bash
set -euo pipefail

echo "Setting up MyDiary storage server on $(hostname)..."
npm install --omit=dev

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env (edit DIARY_STORAGE_TOKEN if you want token authentication)."
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
  echo "PM2 not found. Starting directly with Node..."
  node server.mjs
fi
