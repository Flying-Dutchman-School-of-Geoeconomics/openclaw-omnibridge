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
- `src/reliability/runtime-health.ts`

## Reliability Surfaces

OpenClaw OmniBridge now distinguishes several different operational truths:

1. **Process liveness**
   - Exposed via `GET /healthz`
   - Means the primary runtime is alive and serving

2. **Dependency-aware readiness**
   - Exposed via `GET /readyz`
   - Means required dependencies for active channels are currently healthy enough for truthful traffic handling

3. **Route truth**
   - Exposed via `/offers` and `/offers.txt`
   - Means a route is only active when both source and target dependency conditions are healthy enough

This matters because route truth and final-delivery truth are not identical. A bridge can authenticate, normalize, and forward correctly while a downstream dependency remains unavailable. OmniBridge therefore now treats dependency health as a first-class architectural concern rather than inferring it from adapter existence alone.

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
