# SPECIFICATION: Webhook Ingress Service Integration

## Purpose

Integrate HTTP ingress with production framework (Fastify/Express/Nest) while preserving raw-body verification requirements.

## Requirements

1. Keep unmodified raw body bytes for Slack/WhatsApp/Discord signature verification.
2. Route provider endpoints to corresponding adapter `ingest*` methods.
3. Return provider-specific handshake responses:
   - Slack URL challenge
   - Discord PING/PONG
   - WhatsApp hub challenge
4. Enforce request body size limits and timeout thresholds.

## Acceptance Criteria

1. All provider verification handshakes pass.
2. Signature validation functions receive exact raw payload bytes.
3. Load test at expected peak throughput without dropped requests.
