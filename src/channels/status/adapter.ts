import { BaseInboundAdapter } from "../base.js";
import {
  CanonicalMessage,
  MessageKind,
  OutboundMessage,
  RawInboundMessage,
  VerificationResult,
} from "../../core/types.js";
import { verifyStatusEnvelope } from "../../crypto/verifiers.js";
import { verifySignedStatusPayload } from "./waku-proof.js";
import { StatusWakuClient, StatusEnvelope } from "./waku-client.js";
import { SignedStatusPayload } from "./waku-types.js";

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

  async injectSignedPayloadLocally(
    signed: SignedStatusPayload,
    metadata: Record<string, string> = {},
  ): Promise<void> {
    const verification = verifySignedStatusPayload(signed);
    if (!verification.ok) {
      throw new Error(`invalid local Status payload: ${verification.reason}`);
    }

    await this.simulateInbound({
      id: signed.messageId,
      channel: this.kind,
      senderId: signed.senderPublicKey,
      conversationId: signed.chatId,
      timestampMs: signed.timestampMs,
      nonce: signed.nonce,
      payload: signed.payload,
      contentType: signed.contentType,
      headers: {
        topic: signed.topic,
      },
      metadata: {
        communityId: signed.communityId,
        signatureVerifiedByWaku: "false",
        signatureProof: verification.proof,
        transportAttestation: "local-bridge-shim",
        ...metadata,
      },
    });
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
      transportAttestation:
        raw.metadata.transportAttestation === "local-bridge-shim" ? "local-bridge-shim" : "waku",
      signatureVerifiedByWaku: raw.metadata.signatureVerifiedByWaku === "true",
      signatureProof: raw.metadata.signatureProof,
      allowedSenders: this.config.allowedSenders,
    });
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
