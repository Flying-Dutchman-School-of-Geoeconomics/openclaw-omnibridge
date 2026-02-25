import { BaseInboundAdapter } from "../base.js";
import {
  CanonicalMessage,
  MessageKind,
  OutboundMessage,
  RawInboundMessage,
  VerificationResult,
} from "../../core/types.js";
import { verifyWhatsAppWebhookSignature } from "../../crypto/verifiers.js";
import { WhatsAppApiClient } from "./api-client.js";

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
          audio?: { id?: string };
        }>;
      };
    }>;
  }>;
}

export interface WhatsAppAdapterConfig {
  appSecret: string;
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string;
  allowedSenders: string[];
}

export class WhatsAppAdapter extends BaseInboundAdapter {
  readonly kind = "whatsapp" as const;
  private readonly client: WhatsAppApiClient;

  constructor(private readonly config: WhatsAppAdapterConfig) {
    super();
    this.client = new WhatsAppApiClient(config.accessToken, config.phoneNumberId);
  }

  async start(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    return Promise.resolve();
  }

  async send(message: OutboundMessage): Promise<void> {
    await this.client.sendText(message.conversationId, message.text);
  }

  async verify(raw: RawInboundMessage): Promise<VerificationResult> {
    const signatureHeader = raw.headers["x-hub-signature-256"] ?? "";
    const rawBody = raw.metadata.rawBody ?? "";

    const verification = verifyWhatsAppWebhookSignature(this.config.appSecret, rawBody, signatureHeader);
    if (!verification.authenticated) {
      return verification;
    }

    if (this.config.allowedSenders.length > 0) {
      const allowed = new Set(this.config.allowedSenders.map((s) => s.toLowerCase()));
      if (!allowed.has(raw.senderId.toLowerCase())) {
        return {
          authenticated: false,
          mechanism: verification.mechanism,
          confidence: "low",
          reason: `sender ${raw.senderId} not allowlisted`,
        };
      }
    }

    return verification;
  }

  async normalize(raw: RawInboundMessage, verification: VerificationResult): Promise<CanonicalMessage> {
    const command = raw.payload.startsWith("/") ? raw.payload.slice(1).split(/\s+/) : null;
    const kind: MessageKind = raw.contentType === "audio/ogg" ? "audio" : command ? "command" : "text";
    return {
      messageId: raw.id,
      sourceChannel: this.kind,
      sourceSenderId: raw.senderId,
      sourceConversationId: raw.conversationId,
      createdAtMs: raw.timestampMs,
      kind,
      text: kind === "text" ? raw.payload : undefined,
      audioUrl: kind === "audio" ? raw.payload : undefined,
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

  ingestWebhook(rawBody: string, headers: Record<string, string>): void {
    const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
    const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) {
      return;
    }

    const isAudio = message.type === "audio";
    const raw: RawInboundMessage = {
      id: message.id,
      channel: this.kind,
      senderId: message.from,
      conversationId: message.from,
      timestampMs: Number(message.timestamp) * 1000,
      nonce: message.id,
      payload: isAudio ? message.audio?.id ?? "" : message.text?.body ?? "",
      contentType: isAudio ? "audio/ogg" : "text/plain",
      headers: {
        "x-hub-signature-256": headers["x-hub-signature-256"] ?? "",
      },
      metadata: {
        rawBody,
      },
    };

    this.emitInbound(raw);
  }

  verifyWebhookSubscription(mode: string, token: string, challenge: string): string | null {
    if (mode !== "subscribe") {
      return null;
    }

    if (token !== this.config.verifyToken) {
      return null;
    }

    return challenge;
  }
}
