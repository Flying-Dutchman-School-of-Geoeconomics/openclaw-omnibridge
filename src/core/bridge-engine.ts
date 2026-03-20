import { createHash } from "node:crypto";
import { BaseInboundAdapter } from "../channels/base.js";
import { CommonKnowledgeService } from "../common-knowledge/service.js";
import { ExecutionPlan } from "../common-knowledge/types.js";
import { PolicyError, SecurityError } from "./errors.js";
import { PolicyEngine } from "./policy-engine.js";
import {
  AuditLog,
  BridgePolicyRule,
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
  bridgeSenderIdentities?: Partial<Record<ChannelKind, string>>;
  systemReplyTtlMs?: number;
}

export class BridgeEngine {
  private readonly adapters = new Map<ChannelKind, BaseInboundAdapter>();
  private readonly systemReplyFingerprints = new Map<string, number>();

  constructor(
    private readonly gateway: OpenClawGateway,
    private readonly policyEngine: PolicyEngine,
    private readonly idempotencyStore: IdempotencyStore,
    private readonly replayStore: ReplayStore,
    private readonly rateLimiter: RateLimiter,
    private readonly auditLog: AuditLog,
    private readonly options: BridgeEngineOptions,
    private readonly commonKnowledge?: CommonKnowledgeService,
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

    if (this.shouldSuppressSystemReplyLoop(raw, canonical)) {
      await this.idempotencyStore.markProcessed(raw.id);
      await this.auditLog.record({
        type: "rejected",
        channel: source,
        messageId: raw.id,
        detail: "suppressed bridge-originated reply loop",
        timestampMs: Date.now(),
      });
      return;
    }

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

    const execution = this.commonKnowledge?.resolveIntent({
      message: canonical,
      rule,
    }).execution ?? { outcome: "relay" as const };

    await this.execute(canonical, rule, execution);
  }

  private async execute(message: CanonicalMessage, rule: BridgePolicyRule, execution: ExecutionPlan): Promise<void> {
    switch (execution.outcome) {
      case "dispatch":
        await this.forward(message, rule, execution.dispatchTargets ?? [], execution.dispatchText);
        return;
      case "reply":
      case "clarify":
      case "reject":
        if (execution.reply) {
          await this.reply(execution.reply, message.messageId);
        }
        return;
      case "relay":
      default:
        await this.forward(message, rule, rule.fanoutTargets);
    }
  }

  private async forward(
    message: CanonicalMessage,
    rule: BridgePolicyRule,
    targets: ChannelKind[],
    outboundText?: string,
  ): Promise<void> {
    const outbound = this.toOutbound(message, outboundText);

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
        conversationId: rule.fanoutConversationOverrides?.[target] ?? outbound.conversationId,
        metadata: {
          ...outbound.metadata,
          targetConversationId: rule.fanoutConversationOverrides?.[target] ?? outbound.conversationId,
        },
      };

      await adapter.send(targetMessage);
      await this.auditLog.record({
          type: "forwarded",
          channel: target,
          messageId: message.messageId,
          detail: `forwarded from ${message.sourceChannel} to ${target}`,
          timestampMs: Date.now(),
          metadata: {
            targetConversationId: targetMessage.conversationId,
          },
        });
    }
  }

  private async reply(plan: ExecutionPlan["reply"], sourceMessageId: string): Promise<void> {
    if (!plan) {
      return;
    }

    const adapter = this.adapters.get(plan.channel);
    if (!adapter) {
      return;
    }

    this.rememberSystemReply(plan.channel, plan.conversationId, plan.text);
    await adapter.send({
      channel: plan.channel,
      conversationId: plan.conversationId,
      text: plan.text,
      metadata: plan.metadata,
    });
    await this.auditLog.record({
      type: "forwarded",
      channel: plan.channel,
      messageId: sourceMessageId,
      detail: `same-channel ${plan.metadata?.commonKnowledgeReply ? "common-knowledge " : ""}reply sent`,
      timestampMs: Date.now(),
      metadata: {
        targetConversationId: plan.conversationId,
      },
    });
  }

  private toOutbound(message: CanonicalMessage, textOverride?: string): OutboundMessage {
    return {
      channel: message.sourceChannel,
      conversationId: message.sourceConversationId,
      text: textOverride ?? this.renderMessage(message),
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

  private shouldSuppressSystemReplyLoop(
    raw: Parameters<BaseInboundAdapter["verify"]>[0],
    canonical: CanonicalMessage,
  ): boolean {
    const expectedSender = this.options.bridgeSenderIdentities?.[canonical.sourceChannel];
    if (expectedSender && raw.senderId.toLowerCase() === expectedSender.toLowerCase()) {
      return true;
    }

    if (!canonical.text) {
      return false;
    }

    this.evictExpiredFingerprints();
    return this.systemReplyFingerprints.has(
      this.makeSystemReplyFingerprint(canonical.sourceChannel, canonical.sourceConversationId, canonical.text),
    );
  }

  private rememberSystemReply(channel: ChannelKind, conversationId: string, text: string): void {
    this.evictExpiredFingerprints();
    const ttlMs = this.options.systemReplyTtlMs ?? 15_000;
    this.systemReplyFingerprints.set(
      this.makeSystemReplyFingerprint(channel, conversationId, text),
      Date.now() + ttlMs,
    );
  }

  private evictExpiredFingerprints(): void {
    const now = Date.now();
    for (const [fingerprint, expiresAt] of this.systemReplyFingerprints.entries()) {
      if (expiresAt <= now) {
        this.systemReplyFingerprints.delete(fingerprint);
      }
    }
  }

  private makeSystemReplyFingerprint(channel: ChannelKind, conversationId: string, text: string): string {
    return createHash("sha256").update(`${channel}:${conversationId}:${text}`).digest("hex");
  }
}
