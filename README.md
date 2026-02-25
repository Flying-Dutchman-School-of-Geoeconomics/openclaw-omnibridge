# OpenClaw OmniBridge

OpenClaw OmniBridge is a multi-channel, security-first communications bridge for agent orchestration across:

- Status (Waku)
- WhatsApp
- Telegram
- Signal
- Discord
- Slack
- Email

It is designed to give Status parity or better relative to mainstream channel integrations by enforcing cryptographic verification, policy gating, replay prevention, rate limiting, and auditable fan-out.

License: MPL-2.0 (`LICENSE`).

## What This Repository Includes

1. Executable TypeScript bridge core with channel adapters.
2. Status-first architecture with concrete Waku SDK integration.
3. Security controls: request signature checks, allowlists, replay protections, idempotency, rate limits.
4. Formal-method artifacts (TLA+) and proof obligations.
5. Full installation/operations manuals with official-source references.
6. Explicit `SPECIFICATION` handoff docs for provider paths that still require external runtime hardening.

## Repository Layout

- `src/`: implementation
- `tests/`: unit tests for crypto/policy/bridge invariants
- `docs/`: installation, security, cryptography, formal verification manuals
- `specs/`: detailed handoff specifications and formal artifacts
- `config/`: policy examples
- `scripts/`: bootstrap and environment checks

## Quick Start

```bash
cd openclaw-omnibridge
cp .env.example .env
./scripts/check-env.sh
npm install
npm run build
npm run selfcheck
npm start
```

## Node-Less Build/Test With Docker

If the host has no local `node`/`npm`, use Docker only:

```bash
cd openclaw-omnibridge
cp .env.docker.example .env
docker compose up --build openclaw-test
```

Lowest-exposure default (recommended): run Docker build/tests on ephemeral GitHub runners:

```bash
# push branch or open PR to trigger .github/workflows/docker-remote.yml
```

Security rationale for this choice:

- `docs/18_SECURE_REMOTE_EXECUTION_DECISION.md`

Shortcut script:

```bash
./scripts/test-docker.sh
```

If local Node is available, equivalent npm wrappers:

```bash
npm run test:docker
npm run test:docker:gpu
npm run start:nest:docker
```

Equivalent direct test run:

```bash
docker build --target tester -t openclaw-omnibridge:tester .
docker run --rm --shm-size=2gb openclaw-omnibridge:tester
```

To run end-to-end tests against local Ollama plus optional Gemini key:

```bash
GEMINI_API_KEY=your_key docker compose up --build openclaw-test
```

To enable GPU for Ollama:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build openclaw-test
```

Node-less Nest startup equivalent to `npm run build && npm run start:nest`:

```bash
docker compose --profile nest up --build openclaw-nest
```

Webhook ingress endpoints exposed by built-in server:

- `POST /webhooks/telegram`
- `POST /webhooks/slack`
- `POST /webhooks/discord`
- `GET /webhooks/whatsapp` (verification)
- `POST /webhooks/whatsapp`
- `POST /webhooks/signal`
- `POST /webhooks/email`

Alternative ingress modes:

- `npm run start:fastify` for production Fastify ingress (`src/ingress/fastify`)
- `npm run start:nest` for Nest + Fastify ingress (`src/ingress/nest`)

## Security Baseline

- Every inbound message is verified before ingestion.
- Messages failing authentication/policy are rejected and audited.
- Replay and duplicate protection are always on.
- Command handling is controlled by allowlist.

## Current Implementation vs Specification Boundary

Implemented in code:

- Core bridge engine and policy enforcement.
- Status adapter + Waku client with signed payload verification, topic/community/chat binding, and sender allowlisting.
- WhatsApp, Telegram, Slack, Discord webhook verification logic.
- Signal and Email trust-boundary logic with secure defaults.

Specified for follow-on coding agents:

- Full Signal daemon attestation and hardened transport integration.
- Full IMAP parsing + robust SMTP transport + DKIM signing pipeline.

See `docs/14_HANDOFF_SPECIFICATIONS_INDEX.md` for exact handoff packages.

## Core Manuals

- `docs/02_INSTALLATION_MASTER_MANUAL.md`
- `docs/10_CRYPTOGRAPHIC_VERIFICATION_MANUAL.md`
- `docs/11_FORMAL_VERIFICATION_MANUAL.md`
- `docs/13_STATUS_PARITY_MATRIX.md`
- `docs/16_FASTIFY_NEST_INGRESS_MANUAL.md`
- `docs/17_NODELESS_DOCKER_TESTING.md`
- `docs/18_SECURE_REMOTE_EXECUTION_DECISION.md`
