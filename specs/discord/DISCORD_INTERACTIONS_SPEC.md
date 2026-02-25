# SPECIFICATION: Discord Interactions Completeness

## Purpose

Complete Discord handling beyond command ingestion baseline.

## Requirements

1. Implement full interaction response flow (PONG, deferred responses, follow-up messages).
2. Support slash command option typing and schema validation.
3. Add replay window checks using interaction ID and timestamp.
4. Add guild + command-level authorization policies.

## Security

1. Reject any interaction failing Ed25519 verification.
2. Enforce max timestamp skew to reduce replay risk.

## Acceptance Criteria

1. Discord validation endpoint passes cryptographic checks.
2. Command interactions route correctly with policy enforcement.
