# SPECIFICATION: Email Bridge Production Completion

## Purpose

Upgrade email integration from baseline to enterprise-grade security and reliability.

## Requirements

1. Implement full IMAP IDLE/polling with UID tracking and reconnection logic.
2. Implement STARTTLS-capable SMTP client with robust MIME composition.
3. Add queue + retry for outbound email with dead-letter handling.
4. Support threading via `In-Reply-To` and `References` headers.

## Security

1. Perform cryptographic DKIM verification in-process.
2. Validate SPF/DMARC results and enforce policy.
3. Add MIME sanitization and attachment scanning hooks.

## Acceptance Criteria

1. Inbound mail processing survives reconnects without duplication.
2. DKIM/SPF/DMARC failures rejected per policy.
3. Outbound retries succeed or dead-letter with full audit trace.
