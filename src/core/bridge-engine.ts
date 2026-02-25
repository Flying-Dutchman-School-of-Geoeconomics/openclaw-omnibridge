import { createHash } from "node:crypto";
import { BaseInboundAdapter } from "../channels/base.js";
import { PolicyError, SecurityError } from "./errors.js";
import { PolicyEngine } from "./policy-engine.js";
import {
  AuditLog,
  CanonicalMessage,
  ChannelKind,
  IdempotencyStore,
  OpenClawGateway,
  OutboundMessage,
  RateLimiter,
  ReplayStore,
} from "./types.js";

export interface BridgeEngineOptions {
  replayTtlMs: number;
  enabledFanoutTargets: Partial<Record<ChannelKind, boolean>>;
}

export class BridgeEngine {
  private readonly adapters = new Map<ChannelKind, BaseInboundAdapter>();

  constructor(
    private readonly gateway: OpenClawGateway,
    private readonly policyEngine: PolicyEngine,
    private readonly idempotencyStore: IdempotencyStore,
    private readonly replayStore: ReplayStore,
    private readonly rateLimiter: RateLimiter,
    private readonly auditLog: AuditLog,
    private readonly options: BridgeEngineOptions,
  ) {}

  registerAdapter(adapter: BaseInboundAdapter): void {
    this.adapters.set(adapter.kind, adapter);
    adapter.onMessage(async (message) => {
      await this.processInbound(adapter.kind, message).catch(async (error) => {
        await this.auditLog.record({
          type: "error",
          channel: adapter.kind,
          messageId: message.id,
          detail: error instanceof Error ? error.message : String(error),
          timestampMs: Date.now(),
        });
      });
    });
  }

  async start(): Promise<void> {
    await Promise.all([...this.adapters.values()].map((adapter) => adapter.start()));
  }

  async stop(): Promise<void> {
    await Promise.all([...this.adapters.values()].map((adapter) => adapter.stop()));
  }

  private async processInbound(source: ChannelKind, raw: Parameters<BaseInboundAdapter["verify"]>[0]): Promise<void> {
    const rule = this.policyEngine.resolveRule(source);
    this.policyEngine.enforcePayloadLimit(raw, rule);

    if (!(await this.rateLimiter.allow(`${source}:${raw.senderId}`, Date.now()))) {
      throw new SecurityError(`rate limit exceeded for ${source}:${raw.senderId}`);
    }

    const replayKey = this.makeReplayKey(source, raw.senderId, raw.nonce ?? raw.id);
    const isNewNonce = await this.replayStore.markIfNew(replayKey, this.options.replayTtlMs);
    if (!isNewNonce) {
      throw new SecurityError(`replay detected for ${raw.id}`);
    }

    if (await this.idempotencyStore.hasProcessed(raw.id)) {
      throw new SecurityError(`duplicate message already processed: ${raw.id}`);
    }

    const adapter = this.adapters.get(source);
    if (!adapter) {
      throw new PolicyError(`missing adapter for source ${source}`);
    }

    const verification = await adapter.verify(raw);
    const canonical = await adapter.normalize(raw, verification);

    this.policyEngine.enforceAuthentication(canonical, rule);
    this.policyEngine.enforceSenderAllowlist(canonical, rule);
    this.policyEngine.enforceCommandAllowlist(canonical, rule);

    await this.gateway.ingest(canonical);
    await this.idempotencyStore.markProcessed(raw.id);

    await this.auditLog.record({
      type: "accepted",
      channel: source,
      messageId: raw.id,
      detail: "inbound message accepted",
      timestampMs: Date.now(),
      metadata: {
        auth: String(canonical.cryptographicState.authenticated),
        mechanism: canonical.cryptographicState.mechanism,
      },
    });

    await this.forward(canonical, rule.fanoutTargets);
  }

  private async forward(message: CanonicalMessage, targets: ChannelKind[]): Promise<void> {
    const outbound = this.toOutbound(message);

    for (const target of targets) {
      if (target === message.sourceChannel) {
        continue;
      }

      if (!this.options.enabledFanoutTargets[target]) {
        continue;
      }

      const adapter = this.adapters.get(target);
      if (!adapter) {
        continue;
      }

      const targetMessage: OutboundMessage = {
        ...outbound,
        channel: target,
      };

      await adapter.send(targetMessage);
      await this.auditLog.record({
        type: "forwarded",
        channel: target,
        messageId: message.messageId,
        detail: `forwarded from ${message.sourceChannel} to ${target}`,
        timestampMs: Date.now(),
      });
    }
  }

  private toOutbound(message: CanonicalMessage): OutboundMessage {
    return {
      channel: message.sourceChannel,
      conversationId: message.sourceConversationId,
      text: this.renderMessage(message),
      metadata: {
        sourceChannel: message.sourceChannel,
        sourceSender: message.sourceSenderId,
        sourceMessageId: message.messageId,
      },
    };
  }

  private renderMessage(message: CanonicalMessage): string {
    if (message.kind === "command") {
      const args = message.commandArgs?.join(" ") ?? "";
      return `[${message.sourceChannel}] /${message.commandName ?? "unknown"} ${args}`.trim();
    }

    if (message.kind === "audio") {
      return `[${message.sourceChannel}] (audio) ${message.audioUrl ?? "unavailable"}`;
    }

    if (message.kind === "file") {
      return `[${message.sourceChannel}] (file) ${message.fileUrl ?? "unavailable"}`;
    }

    return `[${message.sourceChannel}] ${message.text ?? ""}`;
  }

  private makeReplayKey(channel: ChannelKind, senderId: string, nonce: string): string {
    return createHash("sha256").update(`${channel}:${senderId}:${nonce}`).digest("hex");
  }
}
