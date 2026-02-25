# SPECIFICATION: Status Waku Integration

Status: Implemented (2026-02-21).

## Purpose

Define and preserve the production-grade Status/Waku integration that cryptographically verifies inbound envelopes before bridge ingestion.

## In-Scope Files

- `src/channels/status/waku-client.ts`
- `src/channels/status/adapter.ts`
- Optional new files under `src/channels/status/`

## Requirements

1. Implement peer discovery/bootstrap from `STATUS_WAKU_BOOTSTRAP_NODES`.
2. Subscribe to configured community/chat/topic.
3. Decode envelopes into `StatusEnvelope`.
4. Verify envelope signature and map verified identity to `senderPublicKey`.
5. Set `signatureVerifiedByWaku=true` only for successful cryptographic checks.
6. Drop and audit malformed/unsigned/unverified envelopes.

## Security Requirements

1. Reject envelopes with invalid signature.
2. Reject envelopes with mismatched topic.
3. Reject envelopes outside allowed community/chat.
4. Log verification failure reason without leaking key material.

## Acceptance Criteria

1. Unit tests with mocked Waku payloads:
   - valid signature -> accepted
   - invalid signature -> rejected
   - topic mismatch -> rejected
   - see `tests/status-waku-client.test.ts` and `tests/status-verifier.test.ts`
2. Integration test on testnet peers demonstrating message receive + send.
3. No unauthenticated message reaches `BridgeEngine.processInbound`.

## Deliverables

1. Updated `StatusWakuClient.connect()` and publish/subscribe logic.
2. Tests and fixtures.
3. Operational README section for Waku peer troubleshooting.
