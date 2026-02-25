import assert from "node:assert/strict";
import test from "node:test";
import { createFastifyIngress } from "../src/ingress/fastify/server.js";
import { BridgeRuntime } from "../src/runtime.js";

test("fastify ingress preserves raw body for signed webhooks", async () => {
  let capturedRaw = "";

  const runtime = {
    config: { httpPort: 0 },
    adapters: {
      slack: {
        ingestWebhook(rawBody: string): { challenge?: string } {
          capturedRaw = rawBody;
          return {};
        },
      },
    },
    async start() {
      return Promise.resolve();
    },
    async stop() {
      return Promise.resolve();
    },
  } as unknown as BridgeRuntime;

  const app = await createFastifyIngress(runtime);

  const rawPayload = '{"z":1,"a":2}';
  const res = await app.inject({
    method: "POST",
    url: "/webhooks/slack",
    headers: {
      "content-type": "application/json",
    },
    payload: rawPayload,
  });

  assert.equal(res.statusCode, 200);
  assert.equal(capturedRaw, rawPayload);

  await app.close();
});

test("fastify ingress handles WhatsApp verification challenge", async () => {
  const runtime = {
    config: { httpPort: 0 },
    adapters: {
      whatsapp: {
        verifyWebhookSubscription(mode: string, token: string, challenge: string): string | null {
          if (mode === "subscribe" && token === "t") {
            return challenge;
          }

          return null;
        },
      },
    },
    async start() {
      return Promise.resolve();
    },
    async stop() {
      return Promise.resolve();
    },
  } as unknown as BridgeRuntime;

  const app = await createFastifyIngress(runtime);

  const res = await app.inject({
    method: "GET",
    url: "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=t&hub.challenge=abc123",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "abc123");

  await app.close();
});
