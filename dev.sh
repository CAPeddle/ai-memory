#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env.dev ]; then
  echo "ERROR: .env.dev not found. Copy .env.dev.example to .env.dev and fill in the values."
  echo "See docs/wsl2-setup.md for details."
  exit 1
fi

if ! docker compose ps --services --filter status=running 2>/dev/null | grep -q '^db$'; then
  echo "Starting Postgres service..."
  docker compose up -d db --wait
fi

echo "Starting MCP server with hot reload..."
exec deno run --watch --allow-net --allow-env --allow-read --env-file=.env.dev server/index.ts
