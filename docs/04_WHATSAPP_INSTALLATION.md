# WhatsApp Installation and Hardening Guide

## 1. Prerequisites

1. Meta developer account and app.
2. WhatsApp Business Account linked to Cloud API.
3. Phone number ID.
4. Permanent or rotated access token strategy.

## 2. Configure Environment

- `WHATSAPP_ENABLED=true`
- `WHATSAPP_APP_SECRET=...`
- `WHATSAPP_VERIFY_TOKEN=...`
- `WHATSAPP_PHONE_NUMBER_ID=...`
- `WHATSAPP_ACCESS_TOKEN=...`
- `WHATSAPP_ALLOWED_SENDERS=...`

## 3. Webhook Setup

1. Configure webhook callback URL in Meta dashboard.
2. Configure verify token identical to `WHATSAPP_VERIFY_TOKEN`.
3. Subscribe to message events.
4. Ensure HTTPS certificate and stable DNS.

## 4. Verification Controls

Code path:

- `src/channels/whatsapp/adapter.ts`
- `src/crypto/verifiers.ts` (`verifyWhatsAppWebhookSignature`)

Validation required:

1. Verify `X-Hub-Signature-256` HMAC SHA-256 against raw request body.
2. Reject if sender is outside `WHATSAPP_ALLOWED_SENDERS`.
3. Apply replay/idempotency/rate-limit checks.

## 5. Send Path

`src/channels/whatsapp/api-client.ts` uses Graph API message endpoint with bearer token.

## 6. Deployment Checklist

1. Token stored in secrets manager.
2. App secret not present in logs.
3. Webhook endpoint can read raw body before JSON parsing.
4. Alert on signature mismatch bursts.

## 7. Test Cases

1. Valid signed inbound message accepted.
2. Invalid signature rejected.
3. Replay message rejected.
4. Unauthorized sender rejected.

## 8. Official Sources

- Cloud API docs: [https://developers.facebook.com/docs/whatsapp/cloud-api/](https://developers.facebook.com/docs/whatsapp/cloud-api/)
- Cloud API overview: [https://meta-preview.mintlify.app/docs/whatsapp-api/get-started/overview](https://meta-preview.mintlify.app/docs/whatsapp-api/get-started/overview)
