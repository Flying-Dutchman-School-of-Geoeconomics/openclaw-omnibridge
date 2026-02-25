# Cryptographic Verification Manual

This manual maps each bridge trust boundary to concrete verification logic and proof obligations.

## 1. Verification Order (Mandatory)

For every inbound message:

1. Verify channel authenticity (signature/token/envelope).
2. Validate sender/channel allowlists.
3. Enforce replay protection.
4. Enforce idempotency.
5. Enforce command allowlist.
6. Only then ingest into OpenClaw.

## 2. Cryptographic Primitives in Code

- HMAC SHA-256: `src/crypto/hmac.ts`
- Timing-safe compare: `src/crypto/timing-safe.ts`
- Ed25519 verification: `src/crypto/ed25519.ts`
- Channel verifiers: `src/crypto/verifiers.ts`

## 3. Channel-by-Channel Verification

### Status (Waku)

Mechanism:

- Waku transport ingestion + signed payload verification + scope binding.

Code:

- `verifyStatusEnvelope()`
- `src/channels/status/waku-client.ts`

Status:

- Implemented in code with signed payload verification, topic/community/chat binding, and signature proof propagation.

### WhatsApp

Mechanism:

- `X-Hub-Signature-256 = sha256=<hex(hmac_sha256(app_secret, raw_body))>`

Code:

- `verifyWhatsAppWebhookSignature()`

Validation equation:

`provided_signature == HMAC_SHA256(app_secret, raw_body)`

### Slack

Mechanism:

- `X-Slack-Signature = v0=<hex(hmac_sha256(signing_secret, "v0:timestamp:raw_body"))>`

Code:

- `verifySlackSignature()`

Validation equation:

`provided_signature == HMAC_SHA256(signing_secret, "v0:" + timestamp + ":" + raw_body)`

### Discord

Mechanism:

- Ed25519 verification over `timestamp + rawBody`.

Code:

- `verifyDiscordEd25519Signature()`

Validation equation:

`Ed25519Verify(public_key, timestamp || raw_body, signature)`

### Telegram

Mechanism:

- Secret token header comparison.

Code:

- `verifyTelegramSecretToken()`

Security note:

- Secret token is authentication, not non-repudiation. Prefer TLS + IP controls + replay checks.

### Signal

Mechanism:

- Local trust boundary + trusted peer allowlist.

Code:

- `verifySignalTrustBoundary()`

Status:

- `SPECIFICATION` for daemon attestation and transport hardening.

### Email

Mechanism:

- DKIM result policy + sender allowlist.

Code:

- `verifyEmailPolicyEnvelope()`

Status:

- Full DKIM/SPF/DMARC cryptographic verification is a `SPECIFICATION` task.

## 4. Replay and Idempotency

Replay key:

`sha256(channel + ":" + sender + ":" + nonce)`

Protection location:

- `src/core/bridge-engine.ts`
- `src/core/memory-stores.ts`
- `src/core/redis-stores.ts`

Idempotency key:

- message `id`

## 5. Key Management Standard

1. Never store secrets in repository.
2. Use environment injection from secret manager.
3. Rotate keys quarterly minimum.
4. Keep dual-key overlap window for zero-downtime rotation.
5. Audit every key access and rotation event.

## 6. Failure Semantics

Any verification or policy failure yields:

1. Reject message.
2. Record audit event with reason.
3. Do not call OpenClaw ingest.
4. Do not forward to downstream channels.

## 7. Validation Test Suite

Relevant tests:

- `tests/verifiers.test.ts`
- `tests/policy-engine.test.ts`
- `tests/bridge-engine.test.ts`

## 8. Known Gaps and Formal Handoff

Detailed in:

- `specs/signal/SIGNAL_RPC_ADAPTER_SPEC.md`
- `specs/email/EMAIL_BRIDGE_SPEC.md`
- `specs/crypto/WEBHOOK_AUTH_SPEC.md`
