import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { URL } from "node:url";
import { DiscordAdapter } from "./channels/discord/adapter.js";
import { EmailAdapter } from "./channels/email/adapter.js";
import { SignalAdapter } from "./channels/signal/adapter.js";
import { SlackAdapter } from "./channels/slack/adapter.js";
import { TelegramAdapter } from "./channels/telegram/adapter.js";
import { WhatsAppAdapter } from "./channels/whatsapp/adapter.js";
import { safeEqualUtf8 } from "./crypto/timing-safe.js";
import { CommonKnowledgeService } from "./common-knowledge/service.js";
import { StatusLocalIngressService } from "./common-knowledge/status-local-ingress.js";

export interface BridgeHttpServerOptions {
  port: number;
  commonKnowledgeService?: CommonKnowledgeService;
  telegramAdapter?: TelegramAdapter;
  slackAdapter?: SlackAdapter;
  discordAdapter?: DiscordAdapter;
  whatsappAdapter?: WhatsAppAdapter;
  signalAdapter?: SignalAdapter;
  emailAdapter?: EmailAdapter;
  statusLocalIngress?: { injectHumanText(text: string): Promise<{ messageId: string }> };
  statusLocalIngressSharedSecret?: string;
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

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(body);
};

const writeText = (res: ServerResponse, statusCode: number, body: string): void => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
};

const isLoopbackAddress = (address: string | undefined): boolean =>
  address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";

export class BridgeHttpServer {
  private server: Server | null = null;
  private boundPort: number | null = null;

  constructor(private readonly options: BridgeHttpServerOptions) {}

  get listeningPort(): number {
    return this.boundPort ?? this.options.port;
  }

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
    const address = this.server?.address();
    this.boundPort = typeof address === "object" && address ? (address as AddressInfo).port : this.options.port;

    console.log(`webhook server listening on port ${this.listeningPort}`);
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
    this.boundPort = null;
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!req.url || !req.method) {
      writeJson(res, 400, { error: "bad_request" });
      return;
    }

    const url = new URL(req.url, `http://localhost:${this.options.port}`);
    const path = url.pathname;

    if (req.method === "GET" && path === "/offers") {
      if (!this.options.commonKnowledgeService) {
        writeJson(res, 503, { error: "offers_unavailable" });
        return;
      }

      writeJson(res, 200, this.options.commonKnowledgeService.createOfferManifest());
      return;
    }

    if (req.method === "GET" && path === "/offers.txt") {
      if (!this.options.commonKnowledgeService) {
        writeText(res, 503, "offers unavailable");
        return;
      }

      const manifest = this.options.commonKnowledgeService.createOfferManifest();
      writeText(res, 200, this.options.commonKnowledgeService.renderOffersText(manifest));
      return;
    }

    if (req.method === "POST" && path === "/internal/status-shim/messages") {
      if (!this.options.statusLocalIngress || !this.options.statusLocalIngressSharedSecret) {
        writeJson(res, 503, { error: "status_local_ingress_unavailable" });
        return;
      }

      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        writeJson(res, 403, { error: "loopback_required" });
        return;
      }

      const providedSecret = headerMap(req)["x-openclaw-status-shim-secret"] ?? "";
      if (!providedSecret || !safeEqualUtf8(this.options.statusLocalIngressSharedSecret, providedSecret)) {
        writeJson(res, 403, { error: "invalid_status_shim_secret" });
        return;
      }

      const rawBody = await readBody(req);
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        writeJson(res, 400, { error: "invalid_json" });
        return;
      }

      const text = typeof (payload as { text?: unknown }).text === "string" ? (payload as { text: string }).text : "";
      if (!text.trim()) {
        writeJson(res, 400, { error: "text_required" });
        return;
      }

      const result = await this.options.statusLocalIngress.injectHumanText(text);
      writeJson(res, 200, {
        ok: true,
        messageId: result.messageId,
      });
      return;
    }

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
