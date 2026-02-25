import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { URL } from "node:url";
import { DiscordAdapter } from "./channels/discord/adapter.js";
import { EmailAdapter } from "./channels/email/adapter.js";
import { SignalAdapter } from "./channels/signal/adapter.js";
import { SlackAdapter } from "./channels/slack/adapter.js";
import { TelegramAdapter } from "./channels/telegram/adapter.js";
import { WhatsAppAdapter } from "./channels/whatsapp/adapter.js";

export interface BridgeHttpServerOptions {
  port: number;
  telegramAdapter?: TelegramAdapter;
  slackAdapter?: SlackAdapter;
  discordAdapter?: DiscordAdapter;
  whatsappAdapter?: WhatsAppAdapter;
  signalAdapter?: SignalAdapter;
  emailAdapter?: EmailAdapter;
}

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const headerMap = (req: IncomingMessage): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      out[key.toLowerCase()] = value.join(",");
    } else if (value) {
      out[key.toLowerCase()] = value;
    }
  }

  return out;
};

const writeJson = (res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void => {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(body);
};

export class BridgeHttpServer {
  private server: Server | null = null;

  constructor(private readonly options: BridgeHttpServerOptions) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer(async (req, res) => {
      try {
        await this.route(req, res);
      } catch (error) {
        writeJson(res, 500, {
          error: "internal_error",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(this.options.port, resolve);
    });

    console.log(`webhook server listening on port ${this.options.port}`);
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });

    this.server = null;
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!req.url || !req.method) {
      writeJson(res, 400, { error: "bad_request" });
      return;
    }

    const url = new URL(req.url, `http://localhost:${this.options.port}`);
    const path = url.pathname;

    if (req.method === "POST" && path === "/webhooks/telegram") {
      const rawBody = await readBody(req);
      this.options.telegramAdapter?.ingestWebhook(rawBody, headerMap(req));
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && path === "/webhooks/slack") {
      const rawBody = await readBody(req);
      const result = this.options.slackAdapter?.ingestWebhook(rawBody, headerMap(req)) ?? {};
      if (result.challenge) {
        writeJson(res, 200, { challenge: result.challenge });
        return;
      }

      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && path === "/webhooks/discord") {
      const rawBody = await readBody(req);
      const result = this.options.discordAdapter?.ingestInteraction(rawBody, headerMap(req));
      if (result?.isPing) {
        writeJson(res, 200, { type: 1 });
        return;
      }

      // In production, return interaction response payloads where required.
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && path === "/webhooks/whatsapp") {
      const challenge = this.options.whatsappAdapter?.verifyWebhookSubscription(
        url.searchParams.get("hub.mode") ?? "",
        url.searchParams.get("hub.verify_token") ?? "",
        url.searchParams.get("hub.challenge") ?? "",
      );

      if (!challenge) {
        writeJson(res, 403, { error: "verification_failed" });
        return;
      }

      res.statusCode = 200;
      res.setHeader("content-type", "text/plain");
      res.end(challenge);
      return;
    }

    if (req.method === "POST" && path === "/webhooks/whatsapp") {
      const rawBody = await readBody(req);
      this.options.whatsappAdapter?.ingestWebhook(rawBody, headerMap(req));
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && path === "/webhooks/signal") {
      const rawBody = await readBody(req);
      const payload = JSON.parse(rawBody) as Parameters<SignalAdapter["ingestSignalEvent"]>[0];
      this.options.signalAdapter?.ingestSignalEvent(payload);
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && path === "/webhooks/email") {
      const rawBody = await readBody(req);
      const payload = JSON.parse(rawBody) as Parameters<EmailAdapter["ingestInboundEmail"]>[0];
      this.options.emailAdapter?.ingestInboundEmail(payload);
      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 404, { error: "not_found" });
  }
}
