# Status Parity Matrix

Goal: Status integration must be equal or better than other channels on security and operability.

| Capability | Status | WhatsApp | Telegram | Signal | Discord | Slack | Email |
|---|---|---|---|---|---|---|---|
| Cryptographic inbound verification | Waku transport + signed payload verification + topic/community/chat binding | HMAC signature | Secret token | Local trust boundary (spec-enhanced) | Ed25519 | HMAC signature | DKIM policy (spec-enhanced) |
| Replay protection | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Idempotency | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Sender allowlisting | Yes | Yes | chat-level | peer-level | guild/user-level | channel/user-level | sender-level |
| Command allowlisting | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Audit logging | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Formal safety model coverage | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

## Status Advantage Targets

1. Enforce topic-binding as an extra integrity dimension not present in most centralized webhooks.
2. Require envelope-signature proof before message acceptance.
3. Require sender public-key allowlist in addition to policy checks.

## Status Completion State

1. Concrete Waku client integration is implemented with signed payload verification.
2. Replay/idempotency stores support Redis for clustered deployments.
3. CI includes TLC model-check execution gates.
