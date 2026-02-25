# Fastify and Nest Ingress Manual (Raw-Body Safe)

This document defines the production ingress options that bind directly to the adapter layer while preserving raw request bodies for cryptographic verification.

## 1. Why Raw Body Matters

Signature-based webhooks (Slack, WhatsApp, Discord) must verify against exact inbound bytes. If middleware mutates JSON before verification, authentication can fail or become unsafe.

This repository now uses `@fastify/raw-body` in both ingress modes to preserve exact request bodies.

## 2. Fastify Standalone Mode

Entry point:

- `src/ingress/fastify/main.ts`

Server routes:

- `POST /webhooks/telegram`
- `POST /webhooks/slack`
- `POST /webhooks/discord`
- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`
- `POST /webhooks/signal`
- `POST /webhooks/email`
- `GET /healthz`

Run:

```bash
npm run build
npm run start:fastify
```

## 3. Nest (Fastify Adapter) Mode

Entry point:

- `src/ingress/nest/main.ts`

Key components:

- Dynamic module: `src/ingress/nest/module.ts`
- Controllers: `src/ingress/nest/webhooks.controller.ts`
- Adapter binding service: `src/ingress/nest/ingress.service.ts`

Run:

```bash
npm run build
npm run start:nest
```

## 4. Security Controls in Ingress Layer

1. Raw body preservation for signed providers.
2. Provider handshake support (Slack challenge, Discord ping, WhatsApp verify).
3. Route-level deterministic handling that forwards to adapter ingest methods.
4. Health endpoint for liveness checks.

## 5. Binding Contract

Ingress must only pass:

1. Exact raw body string.
2. Original request headers.
3. Parsed body for channels where cryptographic checks do not depend on raw bytes.

Adapters then perform verification + normalization before engine policy gate.

## 6. Operational Recommendation

Choose one ingress mode in production:

1. Fastify standalone for minimal overhead.
2. Nest mode when your platform standards require Nest dependency injection and modules.

Do not run both on the same port.
