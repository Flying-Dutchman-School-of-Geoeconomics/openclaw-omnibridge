import { BaseInboundAdapter } from "../base.js";
import { OutboundMessage, RawInboundMessage, VerificationResult } from "../../core/types.js";
import { verifyStatusEnvelope } from "../../crypto/verifiers.js";
import { StatusWakuClient, StatusEnvelope } from "./waku-client.js";

export interface StatusAdapterConfig {
  bootstrapNodes: string[];
  privateKeyHex: string;
  communityId: string;
  chatId: string;
  expectedTopic: string;
  allowedSenders: string[];
}

export class StatusAdapter extends BaseInboundAdapter {
  readonly kind = "status" as const;

  constructor(
    private readonly config: StatusAdapterConfig,
    private readonly wakuClient: StatusWakuClient,
  ) {
    super();
  }

  async start(): Promise<void> {
    this.wakuClient.on("message", (envelope: StatusEnvelope) => {
      const raw: RawInboundMessage = {
        id: envelope.id,
        channel: this.kind,
        senderId: envelope.senderPublicKey,
        conversationId: envelope.chatId,
        timestampMs: envelope.timestampMs,
        nonce: envelope.nonce,
        payload: envelope.payload,
        contentType: envelope.contentType,
        headers: {
          topic: envelope.topic,
        },
        metadata: {
          communityId: envelope.communityId,
          signatureVerifiedByWaku: String(envelope.signatureVerifiedByWaku),
          signatureProof: envelope.signatureProof,
        },
      };

      this.emitInbound(raw);
    });

    await this.wakuClient.connect();
  }

  async stop(): Promise<void> {
    await this.wakuClient.disconnect();
  }

  async send(message: OutboundMessage): Promise<void> {
    await this.wakuClient.publishText(message.text);
  }

  async verify(raw: RawInboundMessage): Promise<VerificationResult> {
    return verifyStatusEnvelope({
      senderId: raw.senderId,
      expectedTopic: this.config.expectedTopic,
      providedTopic: raw.headers.topic ?? "",
      expectedCommunityId: this.config.communityId,
      providedCommunityId: raw.metadata.communityId ?? "",
      expectedChatId: this.config.chatId,
      providedChatId: raw.conversationId,
      signatureVerifiedByWaku: raw.metadata.signatureVerifiedByWaku === "true",
      signatureProof: raw.metadata.signatureProof,
      allowedSenders: this.config.allowedSenders,
    });
  }

  async normalize(raw: RawInboundMessage, verification: VerificationResult) {
    const command = raw.payload.startsWith("/") ? raw.payload.slice(1).split(/\s+/) : null;

    return {
      messageId: raw.id,
      sourceChannel: this.kind,
      sourceSenderId: raw.senderId,
      sourceConversationId: raw.conversationId,
      createdAtMs: raw.timestampMs,
      kind:
        raw.contentType === "audio/ogg"
          ? "audio"
          : raw.payload.startsWith("/")
            ? "command"
            : "text",
      text: raw.contentType === "text/plain" ? raw.payload : undefined,
      audioUrl: raw.contentType === "audio/ogg" ? raw.payload : undefined,
      commandName: command?.[0],
      commandArgs: command?.slice(1),
      metadata: {
        ...raw.metadata,
        topic: raw.headers.topic ?? "",
      },
      cryptographicState: {
        authenticated: verification.authenticated,
        mechanism: verification.mechanism,
        confidence: verification.confidence,
      },
    };
  }
}
