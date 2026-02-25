# Architecture

## High-Level Flow

1. Channel adapter receives inbound event.
2. Adapter builds `RawInboundMessage`.
3. Adapter verifier confirms authenticity and provenance.
4. Bridge engine enforces replay protection, rate limits, idempotency, and policy.
5. Message is normalized to `CanonicalMessage`.
6. OpenClaw gateway ingests message.
7. Policy-driven fanout forwards to enabled target channels.
8. Audit log records accept/reject/forward/error outcomes.

## Components

- `src/core/bridge-engine.ts`
- `src/core/policy-engine.ts`
- `src/core/memory-stores.ts`
- `src/crypto/verifiers.ts`
- `src/channels/*/adapter.ts`

## Security Layers

1. Transport/auth verifier (channel-specific):
   - Status/Waku envelope attestation boundary.
   - WhatsApp `X-Hub-Signature-256`.
   - Slack signed requests.
   - Discord Ed25519 signature.
   - Telegram webhook secret token.
   - Signal trusted local boundary.
   - Email DKIM policy envelope.

2. Protocol abuse defenses:
   - Replay cache (`channel + sender + nonce`).
   - Sliding window per-sender rate limiting.
   - Message idempotency gate.

3. Governance:
   - Allowlists for senders/channels/guilds.
   - Command allowlist.
   - Payload size limits.
   - Controlled fanout targets.

## Normalization Contract

`CanonicalMessage` is the only message shape OpenClaw sees. This decouples agent logic from provider-specific payloads and allows reproducible security reasoning.

## Formal Verification Scope

The model in `specs/formal/BRIDGE_INVARIANTS.tla` covers core safety properties:

- Authentication must hold before dispatch.
- Replay nonce cannot be accepted twice.
- Message id cannot be processed twice.
- Forwarding only occurs to policy-approved targets.
