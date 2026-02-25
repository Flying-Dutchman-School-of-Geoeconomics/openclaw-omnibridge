import { BaseInboundAdapter } from "../base.js";
import {
  CanonicalMessage,
  MessageKind,
  OutboundMessage,
  RawInboundMessage,
  VerificationResult,
} from "../../core/types.js";
import { verifySignalTrustBoundary } from "../../crypto/verifiers.js";
import { SignalRpcClient } from "./rpc-client.js";

interface SignalInboundEvent {
  envelope?: {
    source?: string;
    timestamp?: number;
    dataMessage?: {
      message?: string;
      attachments?: Array<{ id?: string }>;
    };
  };
}

export interface SignalAdapterConfig {
  rpcUrl: string;
  trustedPeers: string[];
}

export class SignalAdapter extends BaseInboundAdapter {
  readonly kind = "signal" as const;
  private readonly client: SignalRpcClient;

  constructor(private readonly config: SignalAdapterConfig) {
    super();
    this.client = new SignalRpcClient(config.rpcUrl);
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
    return verifySignalTrustBoundary(this.config.trustedPeers, raw.senderId);
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

  ingestSignalEvent(event: SignalInboundEvent): void {
    const envelope = event.envelope;
    if (!envelope?.source) {
      return;
    }

    const text = envelope.dataMessage?.message ?? "";

    const raw: RawInboundMessage = {
      id: `${envelope.source}-${envelope.timestamp ?? Date.now()}`,
      channel: this.kind,
      senderId: envelope.source,
      conversationId: envelope.source,
      timestampMs: envelope.timestamp ?? Date.now(),
      nonce: `${envelope.timestamp ?? Date.now()}`,
      payload: text,
      contentType: "text/plain",
      headers: {},
      metadata: {
        source: "signal-cli",
      },
    };

    this.emitInbound(raw);
  }
}
