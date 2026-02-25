#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env file. Copy from .env.example first."
  exit 1
fi

required=(
  "OPENCLAW_ENV"
  "OPENCLAW_AUDIT_LOG_PATH"
  "OPENCLAW_HTTP_PORT"
  "OPENCLAW_REPLAY_TTL_MS"
  "OPENCLAW_IDEMPOTENCY_TTL_MS"
  "OPENCLAW_RATE_LIMIT_PER_MIN"
  "STORE_BACKEND"
)

missing=0
for key in "${required[@]}"; do
  if ! grep -q "^${key}=" .env; then
    echo "Missing required key in .env: ${key}"
    missing=1
  fi
done

store_backend=$(grep "^STORE_BACKEND=" .env | cut -d'=' -f2- || true)
if [[ "${store_backend}" == "redis" ]]; then
  if ! grep -q "^REDIS_URL=" .env; then
    echo "Missing required key in .env: REDIS_URL (required when STORE_BACKEND=redis)"
    missing=1
  fi
fi

if [[ $missing -eq 1 ]]; then
  exit 1
fi

echo "Basic env check passed."
