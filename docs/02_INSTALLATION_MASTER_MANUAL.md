# Master Installation Manual

This manual is intentionally exhaustive. Follow it in sequence for a secure deployment.

## 1. Prerequisites

1. OS: Linux/macOS recommended.
2. Runtime: Node.js 20+ and npm.
3. Optional: Docker (for Redis or supporting services).
4. TLS-enabled reverse proxy for webhook endpoints (Nginx/Caddy/Cloudflare Tunnel).
5. Secret manager (Vault, AWS Secrets Manager, GCP Secret Manager, 1Password Connect).

## 2. Clone and Bootstrap

```bash
cd /path/to/workspace
# repo is already local in this project context
cd openclaw-omnibridge
./scripts/bootstrap.sh
```

If local Node/npm are unavailable, skip local bootstrap and use Docker flow:

```bash
cd openclaw-omnibridge
cp .env.docker.example .env
docker compose up --build openclaw-test
```

Minimum-exposure alternative (recommended):

1. Push branch/open PR.
2. Let `.github/workflows/docker-remote.yml` run Docker on ephemeral GitHub runners.
3. Review CI logs instead of granting this runtime SSH or Docker socket access.

## 3. Environment Configuration

1. Copy `.env.example` to `.env`.
2. Set `OPENCLAW_*` values.
3. Enable channels selectively (`*_ENABLED=true`) only after credentials are configured.
4. Keep all secrets out of Git.
5. Set `OPENCLAW_HTTP_PORT` for webhook ingress listener.
6. For clustered deployments, set `STORE_BACKEND=redis` and `REDIS_URL`.

## 4. Policy Configuration

1. Use `config/policy.example.json` as a baseline.
2. Restrict `allowedSenders` and `allowedCommands` aggressively.
3. Keep fanout minimal by default.

## 5. Build and Self-Check

```bash
npm install
npm run build
npm run selfcheck
```

Expected output:

- `selfcheck: ok`

Node-less equivalent:

```bash
docker build --target tester -t openclaw-omnibridge:tester .
docker run --rm --shm-size=2gb openclaw-omnibridge:tester
```

## 6. Run

```bash
npm start
```

For production ingress options:

1. Fastify standalone ingress:

```bash
npm run start:fastify
```

2. Nest (Fastify adapter) ingress:

```bash
npm run start:nest
```

Node-less Docker equivalent:

```bash
docker compose --profile nest up --build openclaw-nest
```

## 7. Integrate Webhook Entry Points

This repository includes three ingress options:

1. Built-in Node HTTP server in `src/server.ts`.
2. Production Fastify ingress in `src/ingress/fastify/server.ts`.
3. Nest (Fastify adapter) ingress in `src/ingress/nest/`.

Default endpoints:

1. `POST /webhooks/telegram`
2. `POST /webhooks/slack`
3. `POST /webhooks/discord`
4. `GET /webhooks/whatsapp` (verify challenge)
5. `POST /webhooks/whatsapp`
6. `POST /webhooks/signal`
7. `POST /webhooks/email`

If you prefer Fastify/Express/Nest instead of the built-in server, follow:

- `specs/WEBHOOK_INGRESS_SPEC.md`

Handoff implementation details are in `specs/*`.

## 8. Security Hardening Before Production

1. Enable immutable audit storage with retention.
2. Set `STORE_BACKEND=redis` to externalize replay/idempotency/rate-limit state for multi-instance deployments.
3. Rotate credentials on schedule.
4. Add WAF + IP allowlisting where provider supports static ranges.
5. Add SIEM alerting on repeated verification failures.

## 9. Disaster Recovery

1. Keep policy and config in versioned infrastructure repo.
2. Store secret versions with rollback ability.
3. Maintain runbook for channel credential revocation.
4. Test restore flow quarterly.

## 10. Authoritative Installation References

- Status specs: [https://status.app/specs](https://status.app/specs)
- Waku core standards: [https://rfc.vac.dev/waku/standards/core](https://rfc.vac.dev/waku/standards/core)
- Waku JS docs: [https://docs.waku.org/build/javascript/](https://docs.waku.org/build/javascript/)
- WhatsApp Cloud API docs: [https://developers.facebook.com/docs/whatsapp/cloud-api/](https://developers.facebook.com/docs/whatsapp/cloud-api/)
- WhatsApp API overview (official Meta docs mirror): [https://meta-preview.mintlify.app/docs/whatsapp-api/get-started/overview](https://meta-preview.mintlify.app/docs/whatsapp-api/get-started/overview)
- Telegram Bot API: [https://core.telegram.org/bots/api](https://core.telegram.org/bots/api)
- Signal CLI: [https://github.com/AsamK/signal-cli](https://github.com/AsamK/signal-cli)
- Discord interactions overview: [https://discord.com/developers/docs/interactions/overview](https://discord.com/developers/docs/interactions/overview)
- Discord receiving/responding: [https://discord.com/developers/docs/interactions/receiving-and-responding](https://discord.com/developers/docs/interactions/receiving-and-responding)
- Slack request verification: [https://api.slack.com/authentication/verifying-requests-from-slack](https://api.slack.com/authentication/verifying-requests-from-slack)
- Slack Events API: [https://api.slack.com/apis/connections/events-api](https://api.slack.com/apis/connections/events-api)
- SMTP RFC 5321: [https://datatracker.ietf.org/doc/html/rfc5321](https://datatracker.ietf.org/doc/html/rfc5321)
- IMAP RFC 3501: [https://datatracker.ietf.org/doc/html/rfc3501](https://datatracker.ietf.org/doc/html/rfc3501)
- DKIM RFC 6376: [https://datatracker.ietf.org/doc/html/rfc6376](https://datatracker.ietf.org/doc/html/rfc6376)
- SPF RFC 7208: [https://datatracker.ietf.org/doc/html/rfc7208](https://datatracker.ietf.org/doc/html/rfc7208)
- DMARC RFC 7489: [https://datatracker.ietf.org/doc/html/rfc7489](https://datatracker.ietf.org/doc/html/rfc7489)
