# Formal Verification Manual

This project includes a formal-method baseline so bridge safety properties can be model-checked, then evolved toward production proof workflows.

## 1. Modeled System

The model abstracts the bridge as a state machine with:

- inbound events
- verification state
- replay/idempotency sets
- policy rules
- forwarding decisions

Artifacts:

- `specs/formal/BRIDGE_INVARIANTS.tla`
- `specs/formal/BRIDGE_INVARIANTS.cfg`
- `specs/formal/PROOF_OBLIGATIONS.md`

## 2. Core Safety Invariants

1. Auth-before-dispatch:
   - No message reaches OpenClaw unless authenticated.

2. No replay acceptance:
   - Same `(channel, sender, nonce)` cannot be accepted twice.

3. At-most-once processing:
   - Same message ID cannot be ingested twice.

4. Policy-constrained forwarding:
   - Forward target must be in policy fanout set.

## 3. How to Run Model Checking (TLA+ TLC)

1. Install Java 17+.
2. Download `tla2tools.jar`.
3. Run:

```bash
java -cp tla2tools.jar tlc2.TLC specs/formal/BRIDGE_INVARIANTS.tla
```

Optional with config:

```bash
java -cp tla2tools.jar tlc2.TLC -config specs/formal/BRIDGE_INVARIANTS.cfg specs/formal/BRIDGE_INVARIANTS.tla
```

## 4. Mapping Model to Code

- Verification gate -> `BridgeEngine.processInbound`
- Replay store -> `ReplayStore`
- Idempotency store -> `IdempotencyStore`
- Policy fanout -> `PolicyEngine.resolveRule` + `BridgeEngine.forward`

## 5. Next Formal Steps (Roadmap)

1. Add liveness properties for eventual forwarding.
2. Add fairness constraints around adapter availability.
3. Add refinement proof notes mapping TLA transitions to code paths.
4. Keep TLC model checks in CI as release gates.

## 6. Handoff Requirements

Follow `specs/formal/PROOF_OBLIGATIONS.md` and produce:

1. Passing TLC report.
2. Counterexample triage docs (if any).
3. Updated refinement map.
