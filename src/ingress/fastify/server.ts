import Fastify, { FastifyInstance } from "fastify";
import rawBody from "@fastify/raw-body";
import { BridgeRuntime } from "../../runtime.js";
import { SignalAdapter } from "../../channels/signal/adapter.js";
import { EmailAdapter } from "../../channels/email/adapter.js";

const toHeaderMap = (headers: Record<string, string | string[] | undefined>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      out[key.toLowerCase()] = value.join(",");
    } else if (typeof value === "string") {
      out[key.toLowerCase()] = value;
    }
  }

  return out;
};

const requireRawBody = (rawBodyValue: string | undefined): string => {
  if (typeof rawBodyValue !== "string") {
    throw new Error("raw body unavailable; check raw-body middleware setup");
  }

  return rawBodyValue;
};

export const createFastifyIngress = async (runtime: BridgeRuntime): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(rawBody, {
    field: "rawBody",
    global: true,
    encoding: "utf8",
    runFirst: true,
  });

  app.post("/webhooks/telegram", async (req, reply) => {
    const raw = requireRawBody(req.rawBody);
    runtime.adapters.telegram?.ingestWebhook(raw, toHeaderMap(req.headers));
    return reply.code(200).send({ ok: true });
  });

  app.post("/webhooks/slack", async (req, reply) => {
    const raw = requireRawBody(req.rawBody);
    const result = runtime.adapters.slack?.ingestWebhook(raw, toHeaderMap(req.headers));

    if (result?.challenge) {
      return reply.code(200).send({ challenge: result.challenge });
    }

    return reply.code(200).send({ ok: true });
  });

  app.post("/webhooks/discord", async (req, reply) => {
    const raw = requireRawBody(req.rawBody);
    const result = runtime.adapters.discord?.ingestInteraction(raw, toHeaderMap(req.headers));

    if (result?.isPing) {
      return reply.code(200).send({ type: 1 });
    }

    return reply.code(200).send({ ok: true });
  });

  app.get("/webhooks/whatsapp", async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const challenge = runtime.adapters.whatsapp?.verifyWebhookSubscription(
      query["hub.mode"] ?? "",
      query["hub.verify_token"] ?? "",
      query["hub.challenge"] ?? "",
    );

    if (!challenge) {
      return reply.code(403).send({ error: "verification_failed" });
    }

    reply.type("text/plain");
    return reply.code(200).send(challenge);
  });

  app.post("/webhooks/whatsapp", async (req, reply) => {
    const raw = requireRawBody(req.rawBody);
    runtime.adapters.whatsapp?.ingestWebhook(raw, toHeaderMap(req.headers));
    return reply.code(200).send({ ok: true });
  });

  app.post("/webhooks/signal", async (req, reply) => {
    if (runtime.adapters.signal) {
      runtime.adapters.signal.ingestSignalEvent(req.body as Parameters<SignalAdapter["ingestSignalEvent"]>[0]);
    }

    return reply.code(200).send({ ok: true });
  });

  app.post("/webhooks/email", async (req, reply) => {
    if (runtime.adapters.email) {
      runtime.adapters.email.ingestInboundEmail(req.body as Parameters<EmailAdapter["ingestInboundEmail"]>[0]);
    }

    return reply.code(200).send({ ok: true });
  });

  app.get("/healthz", async (_req, reply) => reply.code(200).send({ ok: true }));

  return app;
};
