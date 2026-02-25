import { BaseInboundAdapter } from "../base.js";
import {
  CanonicalMessage,
  MessageKind,
  OutboundMessage,
  RawInboundMessage,
  VerificationResult,
} from "../../core/types.js";
import { verifyDiscordEd25519Signature } from "../../crypto/verifiers.js";
import { DiscordApiClient } from "./api-client.js";

interface DiscordInteraction {
  id: string;
  type: number;
  guild_id?: string;
  channel_id?: string;
  member?: { user?: { id?: string } };
  user?: { id?: string };
  data?: {
    name?: string;
    options?: Array<{ name: string; value: string }>;
  };
}

export interface DiscordAdapterConfig {
  publicKeyHex: string;
  applicationId: string;
  botToken: string;
  allowedGuilds: string[];
}

export class DiscordAdapter extends BaseInboundAdapter {
  readonly kind = "discord" as const;
  private readonly client: DiscordApiClient;

  constructor(private readonly config: DiscordAdapterConfig) {
    super();
    this.client = new DiscordApiClient(config.botToken);
  }

  async start(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    return Promise.resolve();
  }

  async send(message: OutboundMessage): Promise<void> {
    await this.client.createMessage(message.conversationId, message.text);
  }

  async verify(raw: RawInboundMessage): Promise<VerificationResult> {
    const verification = verifyDiscordEd25519Signature(
      this.config.publicKeyHex,
      raw.headers["x-signature-timestamp"] ?? "",
      raw.metadata.rawBody ?? "",
      raw.headers["x-signature-ed25519"] ?? "",
    );

    if (!verification.authenticated) {
      return verification;
    }

    const guildId = raw.metadata.guildId;
    if (this.config.allowedGuilds.length > 0 && guildId) {
      const allowed = new Set(this.config.allowedGuilds);
      if (!allowed.has(guildId)) {
        return {
          authenticated: false,
          mechanism: verification.mechanism,
          confidence: "low",
          reason: `guild ${guildId} is not allowed`,
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

  ingestInteraction(rawBody: string, headers: Record<string, string>): { isPing: boolean } {
    const interaction = JSON.parse(rawBody) as DiscordInteraction;

    if (interaction.type === 1) {
      return { isPing: true };
    }

    if (interaction.type !== 2) {
      return { isPing: false };
    }

    const commandName = interaction.data?.name ?? "unknown";
    const args = (interaction.data?.options ?? []).map((o) => `${o.name}=${String(o.value)}`);
    const payload = `/${commandName}${args.length > 0 ? ` ${args.join(" ")}` : ""}`;

    const raw: RawInboundMessage = {
      id: interaction.id,
      channel: this.kind,
      senderId: interaction.member?.user?.id ?? interaction.user?.id ?? "unknown",
      conversationId: interaction.channel_id ?? "unknown",
      timestampMs: Date.now(),
      nonce: interaction.id,
      payload,
      contentType: "application/command",
      headers: {
        "x-signature-ed25519": headers["x-signature-ed25519"] ?? "",
        "x-signature-timestamp": headers["x-signature-timestamp"] ?? "",
      },
      metadata: {
        rawBody,
        guildId: interaction.guild_id ?? "",
      },
    };

    this.emitInbound(raw);
    return { isPing: false };
  }
}
