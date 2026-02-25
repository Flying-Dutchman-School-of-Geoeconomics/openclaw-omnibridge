import { Inject, Injectable } from "@nestjs/common";
import { BRIDGE_RUNTIME } from "./tokens.js";
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

@Injectable()
export class IngressService {
  constructor(@Inject(BRIDGE_RUNTIME) private readonly runtime: BridgeRuntime) {}

  ingestTelegram(rawBody: string, headers: Record<string, string | string[] | undefined>): void {
    this.runtime.adapters.telegram?.ingestWebhook(rawBody, toHeaderMap(headers));
  }

  ingestSlack(rawBody: string, headers: Record<string, string | string[] | undefined>): { challenge?: string } {
    return this.runtime.adapters.slack?.ingestWebhook(rawBody, toHeaderMap(headers)) ?? {};
  }

  ingestDiscord(rawBody: string, headers: Record<string, string | string[] | undefined>): { isPing: boolean } {
    return this.runtime.adapters.discord?.ingestInteraction(rawBody, toHeaderMap(headers)) ?? { isPing: false };
  }

  verifyWhatsApp(query: Record<string, string | undefined>): string | null {
    return (
      this.runtime.adapters.whatsapp?.verifyWebhookSubscription(
        query["hub.mode"] ?? "",
        query["hub.verify_token"] ?? "",
        query["hub.challenge"] ?? "",
      ) ?? null
    );
  }

  ingestWhatsApp(rawBody: string, headers: Record<string, string | string[] | undefined>): void {
    this.runtime.adapters.whatsapp?.ingestWebhook(rawBody, toHeaderMap(headers));
  }

  ingestSignal(payload: unknown): void {
    if (!this.runtime.adapters.signal) {
      return;
    }

    this.runtime.adapters.signal.ingestSignalEvent(payload as Parameters<SignalAdapter["ingestSignalEvent"]>[0]);
  }

  ingestEmail(payload: unknown): void {
    if (!this.runtime.adapters.email) {
      return;
    }

    this.runtime.adapters.email.ingestInboundEmail(payload as Parameters<EmailAdapter["ingestInboundEmail"]>[0]);
  }
}
