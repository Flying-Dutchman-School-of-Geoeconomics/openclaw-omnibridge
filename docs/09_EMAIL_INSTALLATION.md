# Email Installation and Hardening Guide

## 1. Scope

Email support in this repository includes:

1. Outbound SMTP (minimal implementation over TLS).
2. Inbound adapter interface with IMAP polling placeholder.
3. Auth policy checks using DKIM result signal.

## 2. Configure Environment

- `EMAIL_ENABLED=true`
- `EMAIL_IMAP_HOST=...`
- `EMAIL_IMAP_PORT=993`
- `EMAIL_SMTP_HOST=...`
- `EMAIL_SMTP_PORT=465` (recommended for current minimal SMTP implementation)
- `EMAIL_USERNAME=...`
- `EMAIL_PASSWORD=...`
- `EMAIL_ALLOWED_SENDERS=...`
- `EMAIL_REQUIRE_DKIM_PASS=true`

## 3. Verification Controls

Code path:

- `src/channels/email/adapter.ts`
- `src/crypto/verifiers.ts` (`verifyEmailPolicyEnvelope`)

Current checks:

1. Optional DKIM-pass requirement.
2. Sender allowlist.

Required production upgrade (SPECIFICATION):

1. Full DKIM/SPF/DMARC cryptographic validation in-process.
2. Hardened IMAP IDLE integration with mailbox state management.

See:

- `specs/email/EMAIL_BRIDGE_SPEC.md`

## 4. Send Path

- `src/channels/email/smtp-client.ts`
- Minimal SMTP over implicit TLS.
- For enterprise production, replace with hardened transport library and queue/retry.

## 5. Test Cases

1. DKIM pass + allowlisted sender accepted.
2. DKIM fail rejected when `EMAIL_REQUIRE_DKIM_PASS=true`.
3. Non-allowlisted sender rejected.

## 6. Official Sources

- SMTP: [https://datatracker.ietf.org/doc/html/rfc5321](https://datatracker.ietf.org/doc/html/rfc5321)
- IMAP: [https://datatracker.ietf.org/doc/html/rfc3501](https://datatracker.ietf.org/doc/html/rfc3501)
- DKIM: [https://datatracker.ietf.org/doc/html/rfc6376](https://datatracker.ietf.org/doc/html/rfc6376)
- SPF: [https://datatracker.ietf.org/doc/html/rfc7208](https://datatracker.ietf.org/doc/html/rfc7208)
- DMARC: [https://datatracker.ietf.org/doc/html/rfc7489](https://datatracker.ietf.org/doc/html/rfc7489)
