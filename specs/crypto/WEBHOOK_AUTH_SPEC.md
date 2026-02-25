# SPECIFICATION: Unified Webhook Authentication Framework

## Objective

Standardize webhook verification behavior across WhatsApp, Slack, Discord, Telegram, and any future channels.

## Requirements

1. Preserve raw HTTP body bytes before parsing.
2. Verify channel-specific signatures/tokens in constant-time comparison where applicable.
3. Enforce timestamp skew checks for signed protocols.
4. Return normalized `VerificationResult` with explicit reason codes.

## Reason Codes

- `MISSING_HEADER`
- `BAD_FORMAT`
- `BAD_SIGNATURE`
- `TIMESTAMP_SKEW`
- `NOT_ALLOWLISTED`
- `UNSUPPORTED_TYPE`

## Acceptance Criteria

1. Shared conformance tests for all verifiers.
2. Zero acceptance of intentionally corrupted signatures.
