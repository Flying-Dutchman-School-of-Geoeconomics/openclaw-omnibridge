# Formal Proof Obligations

## Objective

Provide proof-grade evidence that bridge safety properties hold across implementation changes.

## Obligations

1. `AuthBeforeIngest`:
   - Every processed message is cryptographically verified.

2. `NoReplayAccept`:
   - No two processed messages share the same nonce.

3. `ForwardPolicyBounded`:
   - Any forwarded destination is explicitly authorized by policy.

## Required Evidence

1. TLC run output with invariant checks passed.
2. Trace logs for a representative message lifecycle.
3. Refinement narrative mapping each model transition to code function.

## Failure Handling

If TLC reports counterexample:

1. Preserve trace.
2. Link trace to code path.
3. Patch code or model.
4. Re-run TLC and attach before/after evidence.
