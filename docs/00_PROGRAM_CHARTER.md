# Program Charter: OpenClaw OmniBridge

## Mission

Provide a cryptographically defensible, multi-channel communication substrate for OpenClaw agents, with Status/Waku treated as a first-class channel at parity or better with WhatsApp, Telegram, Signal, Discord/Slack, and Email.

## Outcomes

1. Consistent message normalization across all channels.
2. Authentication before any agent ingestion.
3. Policy-based command and fanout control.
4. Replay-safe and idempotent processing.
5. Explicit formal verification path for safety properties.

## Non-Negotiable Security Requirements

1. No inbound command execution without successful channel authentication.
2. No duplicate execution for same logical message.
3. No unauthorized sender or command acceptance.
4. No silent failures: all rejects and errors must be audited.

## Constraints

1. Some providers require out-of-band dashboard setup and credentials.
2. Some channels (Status, Signal, Email) require external runtime components for complete production integration.
3. Formal verification is staged: model + invariants now, CI-grade proof automation in follow-up work.

## Delivery Contract

- Anything fully implementable locally is implemented in `src/`.
- Any external dependency that cannot be fully completed here is documented as `SPECIFICATION` in `specs/` with acceptance criteria and handoff tasks.
