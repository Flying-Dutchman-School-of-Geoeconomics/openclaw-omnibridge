# Operations Runbook

## 1. Startup Procedure

1. Validate env: `./scripts/check-env.sh`
2. Build: `npm run build`
3. Selfcheck: `npm run selfcheck`
4. Start: `npm start`
5. Confirm `GET /healthz` returns `200`
6. Confirm `GET /readyz` reflects dependency truth before accepting traffic
7. Confirm audit log writes to `OPENCLAW_AUDIT_LOG_PATH`

## 2. Health Signals

OpenClaw OmniBridge now distinguishes **liveness** from **readiness**.

1. `GET /healthz`
   - Meaning: the primary runtime process is alive and serving.
   - This endpoint is not a claim that all routes are currently deliverable.

2. `GET /readyz`
   - Meaning: the runtime has refreshed dependency health and is currently ready to accept traffic truthfully.
   - A `503` response here means one or more required dependencies are unavailable or degraded enough that the runtime should not present itself as fully ready.

3. `/offers` and `/offers.txt`
   - Meaning: common-knowledge route truth.
   - These surfaces should now reflect dependency-aware degradation rather than only adapter presence.

Healthy state indicators now include:

1. Process running with no unhandled exceptions.
2. `GET /healthz` returns `200`.
3. `GET /readyz` returns `200` and shows no required dependency failures.
4. Audit log contains periodic accepted/forwarded events.
5. Provider webhooks return expected HTTP status.
6. `/offers.txt` does not overclaim route activity when a downstream dependency is unavailable.

### 2.1 Phase A Dependency Checks

The first dependency-aware readiness slice currently covers:

1. policy bootstrap readability
2. audit-path writability
3. Redis liveliness when `STORE_BACKEND=redis`
4. Signal RPC reachability when `SIGNAL_ENABLED=true`
5. Status/Waku transport state when `STATUS_ENABLED=true`, including recent client warnings that post-date the last healthy Waku event and stale/no-peer degradation after `STATUS_WAKU_HEALTH_STALE_MS`

### 2.2 Important Operator Interpretation

If a route is configured but a downstream service is unavailable, the correct interpretation is:

1. bridge-routing logic may still be correct;
2. the route is still **not fully ready**;
3. and the runtime should degrade that route rather than advertise it as active.

Example:

If Signal RPC is down, `status -> signal` should degrade even if the Signal adapter object exists and the bridge core would otherwise route correctly.

## 3. Incident Classes

1. Signature mismatch surge.
2. Replay attack surge.
3. Rate-limit saturation.
4. Provider auth failure (expired tokens).
5. Fanout delivery failures.
6. Dependency-plane failure.
7. Bootstrap/config mismatch.
8. Readiness truth mismatch.

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

4. Dependency-plane failure:
   - Check `GET /readyz` and identify the failing dependency reason.
   - Confirm whether the failure is:
     - bootstrap/config,
     - contract/path,
     - downstream service availability,
     - persistence availability,
     - or network/Waku availability.
   - Do not treat every delivery failure as a bridge-routing bug.

5. Bootstrap/config mismatch:
   - Confirm the runtime start command loads the expected environment.
   - Confirm `OPENCLAW_POLICY_PATH` points to the intended file.
   - Confirm required channel env vars are present for each enabled channel.
   - Confirm the loaded configuration matches the deployment intention.

6. Readiness truth mismatch:
   - Compare `/readyz` with `/offers.txt`.
   - If a route is shown active while its required dependency is unavailable, treat that as an operational correctness bug.

## 5. Change Management

1. Policy changes require peer review.
2. Command allowlist expansions require threat review.
3. Key rotations require logged change ticket.
4. Any new dependency probe or auto-recovery action requires runbook update.

## 6. Backup and Restore

1. Backup policy config and audit logs.
2. Snapshot persistent replay/idempotency stores if externalized.
3. Validate restore quarterly.
