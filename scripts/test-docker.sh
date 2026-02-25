#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for this script."
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.docker.example .env
  echo "Created .env from .env.docker.example"
fi

docker compose up --build openclaw-test
