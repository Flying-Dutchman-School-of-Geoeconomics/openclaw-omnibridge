import { BaseInboundAdapter } from "../base.js";
import {
  CanonicalMessage,
  MessageKind,
  OutboundMessage,
  RawInboundMessage,
  VerificationResult,
} from "../../core/types.js";
import { verifySlackSignature } from "../../crypto/verifiers.js";
import { SlackApiClient } from "./api-client.js";

interface SlackEventEnvelope {
  type: string;
  event_id?: string;
  event_time?: number;
  challenge?: string;
  event?: {
    type: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    bot_id?: string;
  };
}

export interface SlackAdapterConfig {
  signingSecret: string;
  botToken: string;
  allowedChannels: string[];
}

export class SlackAdapter extends BaseInboundAdapter {
  readonly kind = "slack" as const;
  private readonly client: SlackApiClient;

  constructor(private readonly config: SlackAdapterConfig) {
    super();
    this.client = new SlackApiClient(config.botToken);
  }

  async start(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    return Promise.resolve();
  }

  async send(message: OutboundMessage): Promise<void> {
    await this.client.postMessage(message.conversationId, message.text);
  }

  async verify(raw: RawInboundMessage): Promise<VerificationResult> {
    const signatureHeader = raw.headers["x-slack-signature"] ?? "";
    const timestamp = raw.headers["x-slack-request-timestamp"] ?? "";
    const rawBody = raw.metadata.rawBody ?? "";

    const verification = verifySlackSignature(this.config.signingSecret, timestamp, rawBody, signatureHeader);
    if (!verification.authenticated) {
      return verification;
    }

    if (this.config.allowedChannels.length > 0) {
      const allowed = new Set(this.config.allowedChannels);
      if (!allowed.has(raw.conversationId)) {
        return {
          authenticated: false,
          mechanism: verification.mechanism,
          confidence: "low",
          reason: `channel ${raw.conversationId} not allowlisted`,
        };
      }
    }

    return verification;
  }

  async normalize(raw: RawInboundMessage, verification: VerificationResult): Promise<CanonicalMessage> {
    const command = raw.payload.startsWith("/") ? raw.payload.slice(1).split(/\s+/) : null;
    const kind: MessageKind = command ? "command" : "text";
    return {
      messageId: raw.id,
      sourceChannel: this.kind,
      sourceSenderId: raw.senderId,
      sourceConversationId: raw.conversationId,
      createdAtMs: raw.timestampMs,
      kind,
      text: command ? undefined : raw.payload,
      commandName: command?.[0],
      commandArgs: command?.slice(1),
      metadata: raw.metadata,
      cryptographicState: {
        authenticated: verification.authenticated,
        mechanism: verification.mechanism,
        confidence: verification.confidence,
      },
    };
  }

  ingestWebhook(rawBody: string, headers: Record<string, string>): { challenge?: string } {
    const payload = JSON.parse(rawBody) as SlackEventEnvelope;

    if (payload.type === "url_verification") {
      return { challenge: payload.challenge };
    }

    const event = payload.event;
    if (!event || event.type !== "message" || event.bot_id) {
      return {};
    }

    const raw: RawInboundMessage = {
      id: payload.event_id ?? `${Date.now()}`,
      channel: this.kind,
      senderId: event.user ?? "unknown",
      conversationId: event.channel ?? "unknown",
      timestampMs: payload.event_time ? payload.event_time * 1000 : Date.now(),
      nonce: event.ts,
      payload: event.text ?? "",
      contentType: "text/plain",
      headers: {
        "x-slack-signature": headers["x-slack-signature"] ?? "",
        "x-slack-request-timestamp": headers["x-slack-request-timestamp"] ?? "",
      },
      metadata: {
        rawBody,
      },
    };

    this.emitInbound(raw);
    return {};
  }
}
