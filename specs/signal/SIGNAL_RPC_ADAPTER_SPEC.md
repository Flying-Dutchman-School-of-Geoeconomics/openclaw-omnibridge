# SPECIFICATION: Signal RPC Adapter Hardening

## Purpose

Move Signal integration from trust-boundary baseline to production-grade attested transport.

## Requirements

1. Pin supported signal-cli REST API version.
2. Add mTLS between OmniBridge and signal-cli service.
3. Implement daemon identity verification at startup.
4. Add outbound retries and delivery status classification.
5. Add inbound attachment policy filters.

## Security

1. Run signal-cli in dedicated isolated network namespace.
2. Restrict bridge-to-daemon traffic to loopback/private subnet only.
3. Rotate mTLS certificates on schedule.

## Acceptance Criteria

1. Bridge refuses untrusted daemon certificates.
2. Untrusted sender blocked even if daemon forwards message.
3. Regression tests for trusted/untrusted peers pass.
