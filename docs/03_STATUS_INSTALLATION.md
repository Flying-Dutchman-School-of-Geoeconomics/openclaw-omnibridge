# Status (Waku) Installation and Hardening Guide

## Objective

Deploy Status as a first-class OpenClaw channel with cryptographic controls equivalent or superior to centralized platforms.

## 1. Status/Waku Architecture Decisions

1. Status adapter is event-driven and topic-scoped.
2. Inbound messages must be envelope-verified by Waku runtime.
3. Topic binding is required (`STATUS_EXPECTED_TOPIC`).
4. Sender allowlist is enforced in policy.

## 2. Configure Environment

Set in `.env`:

- `STATUS_ENABLED=true`
- `STATUS_WAKU_BOOTSTRAP_NODES=...`
- `STATUS_PRIVATE_KEY_HEX=...`
- `STATUS_EXPECTED_TOPIC=/openclaw/1/chat/proto`
- `STATUS_COMMUNITY_ID=...`
- `STATUS_CHAT_ID=...`
- `STATUS_ALLOWED_SENDERS=...`

## 3. Production Waku Binding

Code entry point: `src/channels/status/waku-client.ts`.

Implemented behavior:

1. Construct Waku node from bootstrap peers.
2. Subscribe to expected topic(s).
3. Sign outbound payloads with service key material.
4. Verify inbound signed payload cryptography before emit.
5. Enforce topic, community, and chat binding before emit.
6. Emit `StatusEnvelope` only after verification.

Reference spec:

- `specs/status/STATUS_WAKU_INTEGRATION_SPEC.md` (implemented)

## 4. Cryptographic Verification Checklist

1. Signed payload signature validity is checked by Waku client.
2. Topic exact-match check passes.
3. Replay nonce check passes.
4. Sender public key matches allowlist.

## 5. Failure Policy

1. Any signature failure: reject + audit.
2. Topic mismatch: reject + audit.
3. Replay: reject + audit.
4. Rate limit exceeded: reject + audit.

## 6. Status-Specific Operational Notes

1. Audio payload handling is normalized and tagged.
2. Live voice/video sessions are not modeled in this bridge.
3. Maintain dedicated service identity per environment.

## 7. Validation Runbook

1. Send known-valid text payload -> expect accept + ingest + configured fanout.
2. Replay same nonce -> expect reject.
3. Send unknown sender -> expect reject.
4. Send wrong topic -> expect reject.

## 8. Official Sources

- Status specs: [https://status.app/specs](https://status.app/specs)
- Waku core standards: [https://rfc.vac.dev/waku/standards/core](https://rfc.vac.dev/waku/standards/core)
- Waku JavaScript docs: [https://docs.waku.org/build/javascript/](https://docs.waku.org/build/javascript/)
