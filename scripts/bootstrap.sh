#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from template. Edit it before starting in production."
fi

mkdir -p var

if command -v npm >/dev/null 2>&1; then
  npm install
  npm run build
else
  echo "npm not found. Install Node.js 20+ to build and run this project."
fi
