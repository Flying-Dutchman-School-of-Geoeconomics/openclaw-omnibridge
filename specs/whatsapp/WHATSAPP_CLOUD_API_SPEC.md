# SPECIFICATION: WhatsApp Cloud API Production Integration

## Purpose

Harden and complete WhatsApp integration beyond baseline send/verify logic.

## In-Scope

- `src/channels/whatsapp/adapter.ts`
- `src/channels/whatsapp/api-client.ts`

## Requirements

1. Support webhook verification endpoint (GET mode/token/challenge).
2. Parse batched webhook payloads and emit one raw message per inbound user message.
3. Support message status callbacks and audit mapping.
4. Add retry/backoff for outbound `sendText` with idempotency key.

## Security

1. Preserve exact raw request body for HMAC verification.
2. Enforce sender allowlist with normalized E.164 formatting.
3. Reject unsupported message types by policy.

## Acceptance Criteria

1. End-to-end tested against WhatsApp sandbox/test number.
2. Signature mismatch never ingested.
3. Duplicate webhook delivery processed once.
