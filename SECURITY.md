# Security Policy

## Reporting

Report vulnerabilities through your internal security channel before public disclosure.

## Security Posture

OmniBridge follows a default-deny ingestion policy:

1. Authenticate inbound requests/envelopes.
2. Apply policy allowlists.
3. Enforce replay/idempotency/rate limits.
4. Audit every decision.

## Known Security Boundaries

1. Status and Signal rely on external runtime trust and require production hardening per `specs/`.
2. Email cryptographic verification is policy-based by default and requires deeper DKIM/SPF/DMARC implementation per spec.

## Production Minimums

1. Secrets in dedicated manager.
2. TLS termination with strict cipher policy.
3. Persistent replay/idempotency storage.
4. SIEM integration for reject spikes.
