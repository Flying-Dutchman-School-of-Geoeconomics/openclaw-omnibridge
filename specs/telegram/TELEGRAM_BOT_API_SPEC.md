# SPECIFICATION: Telegram Bot API Hardened Integration

## Purpose

Complete Telegram deployment readiness with webhook management and operational controls.

## Requirements

1. Add webhook registration utility (`setWebhook`, `getWebhookInfo`).
2. Handle additional update types safely (callback query, edited messages) by explicit policy.
3. Add outbound retry/backoff and Telegram API error classification.
4. Add anti-replay check on `update_id` monotonic windows.

## Security

1. Enforce secret token check on every webhook request.
2. Optionally enforce source IP ranges if deployment architecture supports it.

## Acceptance Criteria

1. Webhook health check script returns green.
2. Unknown update types are logged and ignored safely.
