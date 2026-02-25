# Slack Installation and Hardening Guide

## 1. Prerequisites

1. Slack app created.
2. Events API enabled.
3. Bot token with required scopes.
4. Signing secret from app credentials.

## 2. Configure Environment

- `SLACK_ENABLED=true`
- `SLACK_SIGNING_SECRET=...`
- `SLACK_BOT_TOKEN=xoxb-...`
- `SLACK_ALLOWED_CHANNELS=C...`

## 3. Verification Controls

Code path:

- `src/channels/slack/adapter.ts`
- `src/crypto/verifiers.ts` (`verifySlackSignature`)

Checks:

1. Build base string `v0:timestamp:rawBody`.
2. Compute HMAC SHA-256 with signing secret.
3. Compare against `X-Slack-Signature` in timing-safe mode.
4. Restrict channels by allowlist.

## 4. URL Verification

When Slack sends `url_verification`, respond with `challenge` exactly.

## 5. Send Path

- `src/channels/slack/api-client.ts`
- Uses `chat.postMessage`.

## 6. Test Cases

1. Valid signed message accepted.
2. Invalid signature rejected.
3. Message from non-allowlisted channel rejected.

## 7. Official Sources

- Request verification: [https://api.slack.com/authentication/verifying-requests-from-slack](https://api.slack.com/authentication/verifying-requests-from-slack)
- Events API: [https://api.slack.com/apis/connections/events-api](https://api.slack.com/apis/connections/events-api)
