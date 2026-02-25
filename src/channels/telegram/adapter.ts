import { BaseInboundAdapter } from "../base.js";
import { OutboundMessage, RawInboundMessage, VerificationResult } from "../../core/types.js";
import { verifyTelegramSecretToken } from "../../crypto/verifiers.js";
import { TelegramApiClient } from "./api-client.js";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    caption?: string;
    chat: { id: number | string };
    from?: { id: number | string };
  };
}

export interface TelegramAdapterConfig {
  botToken: string;
  webhookSecretToken: string;
  allowedChatIds: string[];
}

export class TelegramAdapter extends BaseInboundAdapter {
  readonly kind = "telegram" as const;
  private readonly client: TelegramApiClient;

  constructor(private readonly config: TelegramAdapterConfig) {
    super();
    this.client = new TelegramApiClient(config.botToken);
  }

  async start(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    return Promise.resolve();
  }

  async send(message: OutboundMessage): Promise<void> {
    await this.client.sendMessage(message.conversationId, message.text);
  }

  async verify(raw: RawInboundMessage): Promise<VerificationResult> {
    const verification = verifyTelegramSecretToken(
      this.config.webhookSecretToken,
      raw.headers["x-telegram-bot-api-secret-token"] ?? "",
    );

    if (!verification.authenticated) {
      return verification;
    }

    if (this.config.allowedChatIds.length > 0) {
      const allowed = new Set(this.config.allowedChatIds);
      if (!allowed.has(raw.conversationId)) {
        return {
          authenticated: false,
          mechanism: verification.mechanism,
          confidence: "low",
          reason: `chat ${raw.conversationId} not allowed`,
        };
      }
    }

    return verification;
  }

  async normalize(raw: RawInboundMessage, verification: VerificationResult) {
    const command = raw.payload.startsWith("/") ? raw.payload.slice(1).split(/\s+/) : null;

    return {
      messageId: raw.id,
      sourceChannel: this.kind,
      sourceSenderId: raw.senderId,
      sourceConversationId: raw.conversationId,
      createdAtMs: raw.timestampMs,
      kind: command ? "command" : "text",
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

  ingestWebhook(rawBody: string, headers: Record<string, string>): void {
    const update = JSON.parse(rawBody) as TelegramUpdate;
    const message = update.message;
    if (!message) {
      return;
    }

    const payload = message.text ?? message.caption ?? "";

    const raw: RawInboundMessage = {
      id: `${update.update_id}`,
      channel: this.kind,
      senderId: String(message.from?.id ?? message.chat.id),
      conversationId: String(message.chat.id),
      timestampMs: message.date * 1000,
      nonce: String(update.update_id),
      payload,
      contentType: "text/plain",
      headers: {
        "x-telegram-bot-api-secret-token": headers["x-telegram-bot-api-secret-token"] ?? "",
      },
      metadata: {
        rawBody,
      },
    };

    this.emitInbound(raw);
  }
}
