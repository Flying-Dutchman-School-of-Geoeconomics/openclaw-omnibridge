#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TLA_JAR="${TLA2TOOLS_JAR:-$ROOT_DIR/.cache/tla2tools.jar}"
TLA_JAR_DIR="$(dirname "$TLA_JAR")"
TLA_URL="${TLA2TOOLS_URL:-https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar}"

mkdir -p "$TLA_JAR_DIR"

if [[ ! -f "$TLA_JAR" ]]; then
  echo "Downloading tla2tools.jar..."
  curl -fsSL "$TLA_URL" -o "$TLA_JAR"
fi

java -cp "$TLA_JAR" tlc2.TLC \
  -config "$ROOT_DIR/specs/formal/BRIDGE_INVARIANTS.cfg" \
  "$ROOT_DIR/specs/formal/BRIDGE_INVARIANTS.tla"
