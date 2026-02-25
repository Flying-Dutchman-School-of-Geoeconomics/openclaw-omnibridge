# Discord Installation and Hardening Guide

## 1. Prerequisites

1. Discord application and bot created in developer portal.
2. Bot token and application ID.
3. Interaction endpoint URL over HTTPS.
4. Public key for Ed25519 verification.

## 2. Configure Environment

- `DISCORD_ENABLED=true`
- `DISCORD_APPLICATION_ID=...`
- `DISCORD_PUBLIC_KEY=...`
- `DISCORD_BOT_TOKEN=...`
- `DISCORD_ALLOWED_GUILDS=...`

## 3. Verification Controls

Code path:

- `src/channels/discord/adapter.ts`
- `src/crypto/verifiers.ts` (`verifyDiscordEd25519Signature`)

Checks:

1. Verify `X-Signature-Ed25519` over `X-Signature-Timestamp + rawBody`.
2. Ensure guild allowlist restrictions (if configured).
3. Apply replay/idempotency/rate limit checks.

## 4. Interaction Handling

1. Type `1` ping -> return pong in your HTTP entrypoint.
2. Type `2` application command -> normalize to `/command arg=value`.

## 5. Send Path

- `src/channels/discord/api-client.ts`
- Uses bot token to create channel messages.

## 6. Test Cases

1. Valid signed interaction accepted.
2. Invalid signature rejected.
3. Non-allowlisted guild rejected.

## 7. Official Sources

- Interactions overview: [https://discord.com/developers/docs/interactions/overview](https://discord.com/developers/docs/interactions/overview)
- Receiving/responding: [https://discord.com/developers/docs/interactions/receiving-and-responding](https://discord.com/developers/docs/interactions/receiving-and-responding)
