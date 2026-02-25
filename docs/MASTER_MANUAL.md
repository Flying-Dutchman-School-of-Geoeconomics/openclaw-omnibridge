# OpenClaw OmniBridge Master Manual

This is the single entrypoint manual for deployment, security validation, and formal verification readiness.

## A. Program Scope

The bridge connects Status/Waku, WhatsApp, Telegram, Signal, Discord, Slack, and Email into one normalized OpenClaw ingest pipeline.

## B. Deployment Sequence

1. Read `docs/02_INSTALLATION_MASTER_MANUAL.md`.
2. Configure Status first (`docs/03_STATUS_INSTALLATION.md`).
3. Add centralized channels one by one:
   - WhatsApp
   - Telegram
   - Discord
   - Slack
4. Add Signal and Email with hardening specs.
5. Choose ingress mode and apply raw-body guidance:
   - `docs/16_FASTIFY_NEST_INGRESS_MANUAL.md`
6. If local Node/npm are unavailable, use:
   - `docs/17_NODELESS_DOCKER_TESTING.md`
7. For minimum host exposure, use:
   - `docs/18_SECURE_REMOTE_EXECUTION_DECISION.md`

## C. Cryptographic Validation Sequence

1. Read `docs/10_CRYPTOGRAPHIC_VERIFICATION_MANUAL.md`.
2. Validate each channel’s verifier in non-production test mode.
3. Confirm replay and idempotency tests pass.
4. Confirm audit logs capture reject reasons.

## D. Formal Verification Sequence

1. Read `docs/11_FORMAL_VERIFICATION_MANUAL.md`.
2. Run TLC on `specs/formal/BRIDGE_INVARIANTS.tla`.
3. Confirm invariants hold:
   - Auth-before-ingest
   - No replay acceptance
   - Policy-bounded forwarding

## E. Handoff Management

For any incomplete provider/runtime layer:

1. Open `docs/14_HANDOFF_SPECIFICATIONS_INDEX.md`.
2. Assign relevant `specs/*` file to coding agent.
3. Require acceptance criteria evidence before merge.

## F. Status Excellence Standard

To maintain Status parity or better, releases must not pass unless:

1. Status envelope verification is active.
2. Topic binding is enforced.
3. Sender allowlist is active for privileged commands.
4. Replay and idempotency stores are persistent for clustered deployment.

## G. Release Gate Checklist

1. Build + tests green.
2. Channel verifier regression tests green.
3. Formal model checks green.
4. Secrets rotation plan updated.
5. Runbook updated for any protocol changes.
