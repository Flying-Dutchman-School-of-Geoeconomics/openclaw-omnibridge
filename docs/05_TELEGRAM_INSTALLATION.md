# Telegram Installation and Hardening Guide

## 1. Prerequisites

1. Create bot with BotFather.
2. Obtain bot token.
3. Choose webhook endpoint and secret token.

## 2. Configure Environment

- `TELEGRAM_ENABLED=true`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_WEBHOOK_SECRET_TOKEN=...`
- `TELEGRAM_ALLOWED_CHAT_IDS=...`

## 3. Register Webhook

Use Telegram Bot API `setWebhook` with:

1. `url=https://your-domain/webhooks/telegram`
2. `secret_token=<TELEGRAM_WEBHOOK_SECRET_TOKEN>`

## 4. Verification Controls

Code path:

- `src/channels/telegram/adapter.ts`
- `src/crypto/verifiers.ts` (`verifyTelegramSecretToken`)

Checks:

1. `X-Telegram-Bot-Api-Secret-Token` must match exactly (timing-safe compare).
2. Chat ID must be allowlisted (if list configured).
3. Global replay/rate/idempotency checks apply.

## 5. Send Path

- `src/channels/telegram/api-client.ts`
- Uses `sendMessage` endpoint over HTTPS.

## 6. Test Cases

1. Correct secret token -> accepted.
2. Missing/incorrect token -> rejected.
3. Unallowlisted chat -> rejected.

## 7. Official Sources

- Telegram Bot API: [https://core.telegram.org/bots/api](https://core.telegram.org/bots/api)
