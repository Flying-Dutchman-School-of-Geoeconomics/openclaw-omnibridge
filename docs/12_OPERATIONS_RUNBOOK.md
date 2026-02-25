# Operations Runbook

## 1. Startup Procedure

1. Validate env: `./scripts/check-env.sh`
2. Build: `npm run build`
3. Selfcheck: `npm run selfcheck`
4. Start: `npm start`
5. Confirm audit log writes to `OPENCLAW_AUDIT_LOG_PATH`

## 2. Health Signals

Healthy state indicators:

1. Process running with no unhandled exceptions.
2. Audit log contains periodic accepted/forwarded events.
3. Provider webhooks return expected HTTP status.

## 3. Incident Classes

1. Signature mismatch surge.
2. Replay attack surge.
3. Rate-limit saturation.
4. Provider auth failure (expired tokens).
5. Fanout delivery failures.

## 4. Incident Response

1. Signature mismatch surge:
   - Confirm secret/key rotation status.
   - Validate raw body handling in webhook server.
   - Compare expected and actual signature algorithm.

2. Replay surge:
   - Verify replay-store persistence and TTL.
   - Confirm `STORE_BACKEND=redis` for clustered workloads.
   - Check clock drift.
   - Identify upstream duplicate delivery pattern.

3. Auth failure:
   - Rotate compromised token.
   - Pause affected channel (`*_ENABLED=false`).
   - Keep Status channel isolated if compromise crosses boundary.

## 5. Change Management

1. Policy changes require peer review.
2. Command allowlist expansions require threat review.
3. Key rotations require logged change ticket.

## 6. Backup and Restore

1. Backup policy config and audit logs.
2. Snapshot persistent replay/idempotency stores if externalized.
3. Validate restore quarterly.
